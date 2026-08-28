#!/usr/bin/env bash
#
# Full backup of the Supabase database.
#
# Usage:
#   bash scripts/backup-db.sh 'postgresql://postgres:PASSWORD@db.<ref>.supabase.co:5432/postgres'
#
# Produces three files in backups/<ref>_<timestamp>/ (override with $BACKUP_OUT):
#   roles.sql   — database roles            (--role-only)
#   schema.sql  — tables, functions, RLS    (schema only)
#   data.sql    — all row data              (--data-only)
#
# Restore later (into a fresh project) by running the three files in order:
#   roles.sql -> schema.sql -> data.sql
#
# CONNECTION STRING: from a CI runner, use the Session Pooler host
# (aws-0-<region>.pooler.supabase.com:5432), not the direct db.<ref> host.
# Direct connections are IPv6-only and GitHub runners are IPv4-only, so the
# direct host does not fail fast — it hangs until the job times out. Port 5432
# (session) and not 6543 (transaction): the transaction pooler cannot serve
# pg_dump, which needs session-level state.
#
# This script is the single source of truth for the backup. The scheduled job
# lives in a separate private repo and checks this public repo out to run it,
# so there is no second copy to drift.
#
set -euo pipefail

DB_URL="${1:-}"
if [[ -z "$DB_URL" ]]; then
  echo "Error: pass the full connection string as the first argument." >&2
  echo "  bash scripts/backup-db.sh 'postgresql://postgres:PWD@<host>:5432/postgres'" >&2
  exit 1
fi

# Prefer a Supabase CLI already on PATH (CI installs one via supabase/setup-cli);
# fall back to npx for a local run where nobody has installed it globally.
if command -v supabase >/dev/null 2>&1; then
  SUPA=(supabase)
else
  SUPA=(npx --yes supabase)
fi

# Extract project ref from the host for a clear folder name. Works for the
# direct host (db.<ref>.supabase.co) and the pooler user (postgres.<ref>@).
REF="$(echo "$DB_URL" | sed -nE 's#.*db\.([a-z0-9]{20})\.supabase\.co.*#\1#p')"
[[ -z "$REF" ]] && REF="$(echo "$DB_URL" | sed -nE 's#.*postgres\.([a-z0-9]{20}).*#\1#p')"
REF="${REF:-unknown}"
STAMP="$(date -u +%Y%m%d_%H%M%SZ)"
OUT="${BACKUP_OUT:-backups/${REF}_${STAMP}}"
mkdir -p "$OUT"

echo "Backing up project '${REF}' -> ${OUT}/"

# Roles are the one part reconstructible from the migrations, and --role-only is
# also the step most likely to be refused through the pooler. Warn rather than
# abort, so a roles failure never costs us the schema and data we came for.
echo "  [1/3] roles..."
if ! "${SUPA[@]}" db dump --db-url "$DB_URL" -f "$OUT/roles.sql" --role-only; then
  echo "  WARNING: role dump failed (common through the session pooler)." >&2
  echo "  Continuing — roles can be rebuilt from supabase/migrations/." >&2
  : > "$OUT/roles.sql"
  ROLES_OK=0
else
  ROLES_OK=1
fi

echo "  [2/3] schema..."
"${SUPA[@]}" db dump --db-url "$DB_URL" -f "$OUT/schema.sql"

echo "  [3/3] data..."
"${SUPA[@]}" db dump --db-url "$DB_URL" -f "$OUT/data.sql" --data-only

# ── Verify before anyone trusts this ────────────────────────────────────────
# A backup job that greenly writes empty files every night is worse than having
# none, because it buys confidence that was never earned. `supabase db dump` can
# exit 0 having written a header and no content, so exit code alone is not
# evidence. Fail loudly here instead — a wait and a failure must not look alike.
echo ""
echo "Verifying..."
FAIL=0

for f in schema.sql data.sql; do
  if [[ ! -s "$OUT/$f" ]]; then
    echo "  FAIL: $f is missing or empty." >&2
    FAIL=1
  fi
done

# Hugh has 28 tables across 47 migrations. Assert a floor rather than the exact
# count so that adding a table does not break the check, while a catastrophic
# partial dump (a handful of tables, or none) still trips it.
TABLES=$(grep -ciE '^\s*CREATE TABLE' "$OUT/schema.sql" 2>/dev/null || echo 0)
if (( TABLES < 20 )); then
  echo "  FAIL: schema.sql declares only ${TABLES} tables; expected at least 20." >&2
  FAIL=1
else
  echo "  ok: schema.sql declares ${TABLES} tables"
fi

# --data-only emits COPY blocks (or INSERTs). Neither present means we captured
# a schema with no rows in it, which for a live project is a failed dump, not an
# empty database.
if grep -qE '^\s*(COPY|INSERT INTO)' "$OUT/data.sql" 2>/dev/null; then
  ROWS=$(grep -cE '^\s*(COPY|INSERT INTO)' "$OUT/data.sql")
  echo "  ok: data.sql carries ${ROWS} COPY/INSERT blocks"
else
  echo "  FAIL: data.sql contains no COPY or INSERT — no rows were captured." >&2
  FAIL=1
fi

(( ROLES_OK == 1 )) && echo "  ok: roles.sql captured" || echo "  warn: roles.sql skipped (see above)"

if (( FAIL != 0 )); then
  echo "" >&2
  echo "BACKUP FAILED VERIFICATION — do not treat ${OUT} as a restore point." >&2
  exit 1
fi

echo ""
echo "Done. Files written:"
ls -lh "$OUT"
