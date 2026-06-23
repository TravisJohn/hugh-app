#!/usr/bin/env bash
#
# Full backup of a Supabase project before deletion.
#
# Usage:
#   bash scripts/backup-db.sh 'postgresql://postgres:PASSWORD@db.<ref>.supabase.co:5432/postgres'
#
# Produces three files in backups/<ref>_<timestamp>/:
#   roles.sql   — database roles            (--role-only)
#   schema.sql  — tables, functions, RLS    (schema only)
#   data.sql    — all row data              (--data-only)
#
# Restore later (into a fresh project) by running the three files in order:
#   roles.sql -> schema.sql -> data.sql
#
set -euo pipefail

DB_URL="${1:-}"
if [[ -z "$DB_URL" ]]; then
  echo "Error: pass the full connection string as the first argument." >&2
  echo "  bash scripts/backup-db.sh 'postgresql://postgres:PWD@db.<ref>.supabase.co:5432/postgres'" >&2
  exit 1
fi

# Extract project ref from the host (db.<ref>.supabase.co) for a clear folder name.
REF="$(echo "$DB_URL" | sed -nE 's#.*db\.([a-z0-9]+)\.supabase\.co.*#\1#p')"
REF="${REF:-unknown}"
STAMP="$(date +%Y%m%d_%H%M%S)"
OUT="backups/${REF}_${STAMP}"
mkdir -p "$OUT"

echo "Backing up project '${REF}' -> ${OUT}/"

echo "  [1/3] roles..."
npx supabase db dump --db-url "$DB_URL" -f "$OUT/roles.sql"  --role-only

echo "  [2/3] schema..."
npx supabase db dump --db-url "$DB_URL" -f "$OUT/schema.sql"

echo "  [3/3] data..."
npx supabase db dump --db-url "$DB_URL" -f "$OUT/data.sql"  --data-only

echo ""
echo "Done. Files written:"
ls -lh "$OUT"
echo ""
echo "Verify each file is non-empty and contains SQL before deleting the project."
