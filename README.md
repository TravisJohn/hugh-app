# Hugh

Hugh is an AI-powered learning platform: mock interview practice, a
personal-tutor chat, a spaced-review tracker, and a code-drill pillar, built
on Next.js 16 (App Router) with Supabase for auth/data and Anthropic,
OpenAI, and ElevenLabs for the AI/voice features.

For product context, architecture rules, folder layout, and the AI model
selection policy, see [`CLAUDE.md`](./CLAUDE.md) — that file is the source of
truth for how this codebase is organized and why. `PROJECT_LOG.md` has the
running history of decisions and milestones.

## Prerequisites

- Node.js `>=20.9.0` (matches the `engines` field in `package.json` and
  Next.js's own minimum; developed against Node 24.x)
- A Supabase project (Postgres + Auth + Storage)
- API keys for Anthropic and ElevenLabs (required); OpenAI (optional — gates
  the Notes Coach/summarize and Realtime mastery features, which fail
  gracefully with a 503 if unset)

## Setup

```bash
npm install
cp .env.example .env.local   # then fill in real values — see below
npm run health                # verifies env vars + that each provider key actually works
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment variables

See [`.env.example`](./.env.example) for the full list with explanations of
what each one gates. In short:

| Variable | Required | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Server-only. Interview generation, learn/chat, track generation, mastery evaluation. |
| `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID_1/2/3` | Yes | Server-only. Interview persona TTS. |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Public by design — used by the browser Supabase client. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-only. Bypasses RLS — never expose to the client. |
| `SUPABASE_ACCESS_TOKEN` | No | Only needed for `scripts/run-migration.ts` (CLI migration apply). |
| `OPENAI_API_KEY` | No | Server-only. Notes Coach/summarize, Realtime mastery, local architecture-dashboard assistant. |
| `MASTERY_REALTIME_ENABLED` | No | Feature flag — `"true"` switches `/mastery` to the OpenAI Realtime voice flow. |

`NEXT_PUBLIC_` vars are safe for the client bundle; every other key is
server-only and must only be read from `/app/api/**` route handlers, Server
Components, or `lib/**` modules marked `import "server-only"`.

### Database

Schema lives in [`supabase/migrations/`](./supabase/migrations) as numbered,
sequential SQL files — apply them in order via the Supabase Dashboard SQL
editor (or `scripts/run-migration.ts` from the CLI, which needs
`SUPABASE_ACCESS_TOKEN`). There is no down-migration/rollback tooling yet;
treat each migration as forward-only and review it before applying to a
project with real data. Row Level Security is enabled on every table —
`supabase/migrations/032_lock_down_profiles_rls.sql` is the fix for a
critical RLS gap found in the deployment-readiness audit (see below) and
should be applied before any production launch.

## Scripts

```bash
npm run dev      # start the dev server (also runs the architecture-dashboard prebuild)
npm run build    # production build
npm run start    # run a production build locally
npm run lint     # ESLint
npm test         # Vitest (unit tests, run once)
npm run test:watch
npm run health   # verify env vars are set AND that each provider key actually authenticates
```

There is no CI workflow configured yet — `lint`, `tsc --noEmit`, `test`,
`npm audit`, and `build` should all be run (and pass) before merging or
deploying; see `DEPLOYMENT_READINESS_AUDIT.md`'s "Proposed CI release gate"
for the exact command set this repo should eventually run on every push.

## Deployment status

**This repository has an outstanding security/readiness audit —
[`DEPLOYMENT_READINESS_AUDIT.md`](./DEPLOYMENT_READINESS_AUDIT.md) — that
gates public deployment.** Read it before deploying to production. It
documents what's already fixed, what's still open, and the recommended
remediation order. The intended host is [Vercel](https://vercel.com); there
is no `vercel.json` — project settings (env vars, build command) are
configured directly in the Vercel dashboard.
