# RESTORE.md — bringing the stable version of Hugh back up

**Purpose:** this file is for whoever (human or agent) needs to take Hugh from
nothing to running, at the known-good state, without having been in the session
that created it.

**The stable point is the git tag `stable-2026-09-12`** (commit `96374a4`,
pushed to `origin`). Its tag message carries the gate numbers that were verified
on that exact commit. Read it with `git show stable-2026-09-12`.

This is a *restore* runbook. `README.md` covers ordinary day-to-day setup;
`CLAUDE.md` is the source of truth for architecture rules and must be read before
changing anything.

---

## 0. Read this first: what the tag does and does not restore

The tag restores **application source code. That is all.** Three things Hugh
needs to actually run are not in git and cannot be recovered from the tag:

| Not in the tag | Why | What to do |
|---|---|---|
| `.env.local` | Gitignored by design (`.env*`). Holds every secret. | **See §1. This is the single point of failure.** |
| The Supabase database | Migrations are **forward-only with no rollback tooling**. | See §4. |
| Supabase Storage objects | Notes screenshots, Monitor documents. | Restored from the `hugh-backups` mirror, not from git. |

**The consequence, stated plainly:** rolling the *code* back to this tag does
**not** roll the *database* back. If later work applies a migration that drops or
renames a column, checking out this tag gives you code that expects a schema the
database no longer has, and no git operation undoes it. Migration 051 is the last
one applied as of this tag.

This is the reason `CLAUDE.md` forbids applying experimental migrations against
Hugh's Supabase project. Treat that as the hard constraint it is.

---

## 1. Protect `.env.local` before anything else

`.env.local` is 1.2 KB, untracked, and exists only on the machine that made it.
Losing it means re-issuing every provider key and re-reading the Supabase
project settings. It is the highest-value, least-protected file in the project.

Keep at least one copy outside this working directory — a password manager entry
or an encrypted vault, **not** a second folder on the same disk and **never** a
git repository, public or private.

`.env.example` (tracked) lists every key with notes on what each one gates. It
is the shape of the file, never the values.

---

## 2. Prerequisites

- **Node.js `>=20.9.0`** (the `engines` field). CI runs Node 20.x; the project
  has also been developed against Node 24.x. The off-site backup scripts in the
  separate `hugh-backups` repo need Node >= 22.
- **npm** — `package-lock.json` is the lockfile. Use `npm ci`, not `npm install`,
  for a reproducible restore.
- **A Supabase project** (Postgres + Auth + Storage).
- **API keys:** Anthropic and ElevenLabs are required. OpenAI is optional and
  gates the Notes Coach, Notes summarise, Realtime mastery and the local
  architecture-dashboard assistant; those fail with a 503 when it is unset.

---

## 3. Restore the code

    git clone https://github.com/TravisJohn/hugh-app.git
    cd hugh-app
    git checkout -b <your-branch-name> stable-2026-09-12
    npm ci
    cp .env.example .env.local     # then fill in real values

Work on a branch. Do not commit onto the tag.

Verify the environment before starting the app — this checks that the variables
are set *and* that each provider key actually authenticates, which is a
different question from being non-empty:

    npm run health

Then:

    npm run dev

Open http://localhost:3000. `predev` regenerates the architecture-dashboard data,
so the first start is slower than later ones.

---

## 4. The database

Schema lives in `supabase/migrations/` as numbered SQL files. **Migrations
001-051 are applied** as of this tag.

Apply them in order via the Supabase Dashboard SQL editor, or with
`scripts/run-migration.ts`, which needs `SUPABASE_ACCESS_TOKEN` (that variable is
needed only for CLI migration applies, never to run the app).

Rules that are not optional:

- **Forward-only.** There is no down-migration tooling. Review every migration
  before applying it to a project holding real data.
- **Row Level Security is enabled on all 27 tables** and each has policies.
  `032_lock_down_profiles_rls.sql` closes a critical self-promotion gap found in
  the audit; it must be applied before any production launch.
- **A fresh Supabase project needs all 51 applied in order.** They have never
  been squashed, and squashing is only safe before any row exists.

Off-site backups (daily encrypted DB snapshot plus a storage mirror) live in a
separate private repo, `hugh-backups`, and run on GitHub Actions. The snapshot
was verified green by row count against the live database. `BACKUP_PASSPHRASE`
is held by Travis; if it is lost, every existing DB snapshot is unrecoverable.

---

## 5. Verify the restore

Run the same gate that was green when this tag was cut. Expected results, all
verified on commit `96374a4` on 2026-09-12:

| Command | Expected |
|---|---|
| `npx tsc --noEmit` | exit 0, zero errors |
| `npm run lint` | clean, no output |
| `npm run cloud:check` | `cloud-data OK — 63 services` |
| `npm test` | **1503 passed / 71 files** |
| `npm run build` | exit 0 |

A different test count is a signal, not noise: it means the working tree is not
this tag. CI (`.github/workflows/ci.yml`) runs the same set, secretless, on
`main` and on pull requests.

---

## 6. Three feature flags that must stay off

All three are off in production deliberately. Do not flip any of them to "true"
casually — each has an unresolved reason.

1. **`MASTERY_REALTIME_ENABLED`** — the route gates spend and then never calls
   `logUsage`, which is the bug `CLAUDE.md` names outright. Since migration 049
   the reservation expires unconfirmed instead of converting to recorded spend,
   so OpenAI Realtime voice minutes would go unrecorded. It has also never run
   end to end. Two things must happen first: the route must log its usage, and
   `/privacy` must disclose that enabling it sends learner **voice audio** to
   OpenAI, which it currently does not say.
2. **`DOCUMENT_UPLOAD_ENABLED`** — locked 2026-09-09 pending an answer to what
   happens when a learner uploads material they did not mean to send. The
   prompt-injection defence around it is unchanged and still in the code.
3. **Dev-only `npm audit` findings** in `vitest`/`vite` are deliberately
   untouched. Clearing them needs `npm audit fix --force`, a breaking upgrade,
   and they are not production exposure — CI audits with `--omit=dev`.

---

## 7. Product standing at this tag

**Ready for production deployment.** All six original release blockers are
closed; see the **"Re-check: 6 September 2026"** section of
`DEPLOYMENT_READINESS_AUDIT.md`, which is the current standing. The two sections
above it are the original 4 August and 22 August records, left unedited on
purpose — where they disagree, the newest section wins.

`/privacy` is public and reachable before signup, and account deletion actually
deletes across the stores that needed it.

**One open item needs a decision, not a commit:** `goal_answers` has no
retention TTL. Migration 048 keeps the 5-whys answers indefinitely by deliberate
choice. "Until you delete it" is accurate, disclosed and tested; it simply has no
expiry attached.

---

## 8. Other tags

    git tag -l

- **`stable-2026-09-12`** — this restore point.
- **`parked/llm-provider-seam`** — the LLM provider seam: 3 commits, 1,412 lines,
  44 tests, never merged, no route wired. Scrapped as a direction because
  multi-provider is a lock-in argument, not a cost one. Restoring it is a
  **merge, not a drop-in**: it edits `lib/pricing.ts`, `lib/registry/features.ts`
  and `package.json`.
- **`pre-learn-removal`** — an older marker predating this convention.

---

## 9. Files that are deliberately not in git

Do not treat their absence as something to fix:

- `.env.local` — secrets (§1).
- `CONTINUITY.md` — the session hand-off note, overwritten every session.
  `PROJECT_LOG.md` is the tracked artifact that accumulates.
- `/docs/reports/`, `/LEARNING_POINTS.md`, `/HUGH_PRESENTATION.md`,
  `/presentation/` — local scratch and slides.
- `/.claude/` and `/scripts/warm-start/` — session-continuity tooling, decided
  2026-08-04 to belong in a separate tooling repo, not in the app.
- `/backups` — contains real data.
