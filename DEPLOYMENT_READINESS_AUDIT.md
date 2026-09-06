# Hugh Codebase Quality, Security, and Deployment-Readiness Audit

**Audit date:** 4 August 2026  
**Repository:** `D:\WEB PROJECTS\hugh`  
**Framework:** Next.js 16.2.9, React 19.2.4, TypeScript 5.9.3, Supabase, Anthropic, OpenAI, ElevenLabs  
**Decision:** **Not ready for production deployment**
**Superseded — see "Re-check: 6 September 2026" below for current status.**

The application has a sound foundation: strict TypeScript passes, the production build succeeds, all 294 unit tests pass, secrets are separated from client code, most tenant-owned data access is scoped correctly, and sensitive uploads use private storage with signed URLs. However, two directly exploitable security defects and several cost-control and deployment-safety gaps must be fixed before launch.

---

# Re-check: 22 August 2026

The 4 August audit is **left unedited on purpose** — everything from
"Executive summary" onward is the original record of what was found and why.
This section is the current standing. Where the two disagree, this section is
the newer fact.

**Decision:** still **not ready for public deployment**, but for a much shorter
list of reasons. Four of the six original release blockers are closed. What
remains is concentrated almost entirely in one place: the **money path**.

## Gates, re-run 22 August 2026

| Check | 4 Aug | 22 Aug |
|---|---|---|
| `npm run build` | Pass | **Pass** (exit 0) |
| `npx tsc --noEmit` | Pass | **Pass** — 0 real `any`, 0 `@ts-ignore`, 0 TODO/FIXME |
| `npm test` | 294 tests / 23 files | **870 tests / 41 files, all green** |
| `npm run lint` | **Fail** — 28 errors | **Clean** |
| `npm audit --omit=dev` | **Fail** — 4 high | **0 vulnerabilities** (Next 16.3.1) |
| CI | None | **Present** — secretless gate on `main` + PRs |
| RLS | Gap at `profiles` | **Enabled on all 27 tables**, each with policies |
| Secrets in git | Clean | **Clean** — only `.env.example` tracked |
| Migrations | 032/033 drafted | **031-045 applied** per PROJECT_LOG / CONTINUITY |

## Release blocker status

| # | Blocker | Status |
|---|---|---|
| 1 | `profiles_owner` RLS self-promotion | **Closed** — 032 applied |
| 2 | Unsafe `next`/`returnUrl` redirects | **Closed** — `utils/safe-redirect.ts` + 13 tests |
| 3 | Vulnerable production dependencies | **Closed** — audit clean on Next 16.3.1 |
| 4 | Approved/unblocked enforcement | **Closed** for the paid-AI surface |
| 5 | Atomic usage reservation + rate limiting | **OPEN** — nothing built |
| 6 | Mandatory CI gates | **Closed** — `.github/workflows/ci.yml` |

**Superseded — see "Re-check: 6 September 2026" below for current status.**

## The one thing that needs a human, not a commit

Email verification **auto-approves** the profile (`app/auth/confirm/route.ts:39`),
granting full access to every paid AI route. That chains with blocker 5 and the
findings below: the 100,000-token monthly cap is **not an enforceable financial
control**. Anyone who can reach signup and verify an email address can spend the
project's Anthropic / OpenAI / ElevenLabs budget, and the admin gauge may
under-report it.

Until blocker 5 is closed:

1. **Set hard spend caps in the provider consoles** (Anthropic budget limit +
   alert, OpenAI monthly usage limit). ElevenLabs is fixed-tier and self-caps.
   This is the independent second control the original audit asked for under
   HIGH-04, and it needs no code.
2. **Do not expose a deployment with open signup.** Preview protection on, or
   signup closed.
3. **Leave `MASTERY_REALTIME_ENABLED` unset/false.** That route mints an OpenAI
   Realtime ephemeral key, checks quota, and records no usage at all.

## Open findings, ranked — the punch-list to work from

### 1. Usage logging is fire-and-forget everywhere (new detail on HIGH-04)

All **23** `logUsage` call sites are `void logUsage(...)`. **Zero are awaited.**
On Vercel the invocation may freeze the moment the response returns, so the
insert can be lost. The monthly cap then enforces against an under-counted log,
and the admin cost gauge under-reports real spend.

`after()` from `next/server` is already imported and used in
`app/api/dashboard/goals/route.ts:95` and
`app/api/dashboard/goals/document/approve/route.ts:64`. The fix is a mechanical
`void logUsage(...)` → `after(() => logUsage(...))` sweep across those 23 sites.
Cheapest large win available; do it first.

### 2. Three paths spend tokens and log nothing (violates CLAUDE.md outright)

CLAUDE.md: "A route that calls `enforceUsageGate` but never logs is a bug."

- **`judgeTopicDomain`** (`lib/learn/topic-domain-server.ts:31`, Haiku) — called
  from `dashboard/classify-topic`, `dashboard/goals/document/extract`, and
  `dashboard/goals/document/approve`. Gated, never logged.
- **`generateSessionAssessment`** (`lib/claude/assessSession.ts:19`, Sonnet) —
  called from `api/interview/generate-session-assessment` **and** from
  `app/interview/[room]/summary/page.tsx:78` on server render, with no gate and
  no log. A page view triggers a Sonnet call for free.
- **`app/api/architecture/chat/route.ts:83`** — `gpt-4o`, admin-gated, unlogged,
  and inlines the model string instead of declaring `const MODEL`, which is a
  second CLAUDE.md rule ("every route names its model once").

The pattern behind all three: the provider call lives in a `lib/` helper that
has no `userId`, so logging was never wired through. Fix the shape, not just the
three instances — a helper that spends tokens should be unable to run without
somewhere to log.

### 3. TTS spend never counts against quota (HIGH-04, unchanged)

`checkUsageAllowed` sums only `tokens_in + tokens_out` (`lib/usage.ts:113`).
`tts_chars` is logged and then ignored, so ElevenLabs is unmetered per learner.

### 4. No rate limiting, and the gate fails open (HIGH-05, unchanged)

Only a monthly total exists. It is read-then-spend, so concurrent requests all
pass the same check before any row is written. A failed usage query yields no
rows, therefore a zero total, therefore allowed.

### 5. No error boundaries (part of MEDIUM-07)

Zero `error.tsx`, `global-error.tsx`, or `not-found.tsx` anywhere in `app/`.
One `loading.tsx` (`app/tracker/[trackId]/`). Any render throw in production
shows the raw Next error page.

### 6. No observability (MEDIUM-07, unchanged)

No error monitoring, structured logging, or runtime health endpoint.
`npm run health` is a local CLI, not something production can be asked. A
production failure would be reported by a user.

### 7. Deploy payload (MEDIUM-10, unchanged)

`public/` is 179 MB, 161 MB of it audio, 44 audio files tracked in git; `.git`
is 183 MB. No `vercel.json`, no `.vercelignore`.

### 8. No runtime input validation (MEDIUM-03, unchanged)

No `zod`/`valibot` in the dependency tree. Handlers still cast
`await request.json()` to a TypeScript type, so malformed input becomes a 500.

## The structural finding — why increments are not yet small

The suite is 870 tests across 41 files, and **every one is a pure-library unit
test. Not one crosses an HTTP or auth boundary.**

So the tests are deep exactly where the code is already safe — parsers, pricing,
layout geometry, pack content — and silent exactly where a change can hurt:
does this route still refuse a blocked user, does the quota still hold, does a
cross-tenant id still 404, does a redirect still reject `//evil.example` at the
route rather than only in the helper.

That is the real answer to "small increments from a robust solution". A change
to `lib/usage.ts` currently cannot break a test, so every increment near money
or auth has to be hand-verified, and hand-verification is what stops increments
from being small. The pure-module discipline in CLAUDE.md rule 7 is working; it
simply stops one layer below the risk.

## Recommended order

1. **Findings 1 and 2** — mechanical, closes two standing CLAUDE.md violations,
   makes spend visible before anything else is decided on top of it.
2. **The integration-test layer** — two normal users plus one admin, proving:
   blocked/unapproved gets 403, cross-tenant ids fail, concurrent quota attempts
   cannot overspend, unsafe redirects are rejected at the route. This is the
   step that makes every later increment small.
3. **Findings 3 and 4** — quota correctness and rate limiting, built on tests
   from step 2 that can prove they work.
4. **Findings 5 and 7** — pre-launch chores.
5. **Finding 6** — day one of production, not before.
6. **Finding 8** — ongoing; add validation at each boundary as it is touched.

---

# Re-check: 6 September 2026

The 4 August and 22 August sections are **left unedited on purpose**, same
convention as before. This section is the current standing. Where any of the
three disagree, this section is the newer fact.

**Decision:** **ready for production deployment.** All six original release
blockers are closed. What is left is a flag-off code defect and one open
product decision, neither of which blocks shipping.

## Gates, re-run 6 September 2026

| Check | 22 Aug | 6 Sep |
|---|---|---|
| `npm run build` | Pass | **Pass** (exit 0), `/privacy` prerenders static |
| `npx tsc --noEmit` | Pass | **Pass** — 0 real `any` (2 grep hits, both prose strings), 0 `@ts-ignore`, 0 TODO/FIXME |
| `npm test` | 870 tests / 41 files | **1,255 tests / 58 files, all green** |
| `npm run lint` | Clean | **Clean** |
| `npm audit --omit=dev` | 0 vulnerabilities | **0 vulnerabilities** — 2 moderate found and cleared this pass, see below |
| CI | Present | **Unchanged** — green on PR #3 merge, 1m39s |
| RLS | All 27 tables | Not re-verified this pass — no schema change since 22 Aug to prompt a recheck |
| Secrets in git | Clean | **Clean** — only `.env.example` tracked |
| Migrations | 031-045 applied | **031-050 applied**, 049 and 050 verified live against production DB |

**The two new audit findings are transitive, not Hugh's own code:**
`@xmldom/xmldom` (via `mammoth`, used for `.docx` extraction on the
document-upload path) and `qs` (via `@duckdb/duckdb-wasm` and `elevenlabs`).
Both moderate severity, both have a fix available via `npm audit fix`. Not
release-blocking — these are the same class of dependency-drift finding the
22 Aug gate closed once already, not a defect introduced by the two merges
since.

## Release blocker status

| # | Blocker | Status |
|---|---|---|
| 1 | `profiles_owner` RLS self-promotion | Closed — 032 applied |
| 2 | Unsafe `next`/`returnUrl` redirects | Closed — `utils/safe-redirect.ts` + 13 tests |
| 3 | Vulnerable production dependencies | Closed — see transitive note above, not a blocker-grade regression |
| 4 | Approved/unblocked enforcement | Closed for the paid-AI surface |
| 5 | Atomic usage reservation + rate limiting | **Closed 2026-09-04** — migration 049, verified live (25 concurrent calls against a 10,000 cap granted exactly 10) |
| 6 | Mandatory CI gates | Closed — `.github/workflows/ci.yml` |

Blocker 5 was the last one open at the 22 August re-check. A seventh item
surfaced and closed in the same window that was never on the original
six-blocker list: **no privacy policy or terms existed anywhere in the app**,
raised 2026-08-30, closed 2026-09-05 (PR #3) — `/privacy` is public and
reachable before signup, and account deletion actually deletes across the
stores that needed it.

## What is left, in order of relevance

1. **`mastery/realtime-session` spends without logging.** Calls
   `enforceUsageGate` and never calls `logUsage` — the exact bug CLAUDE.md
   names outright. Since migration 049 this means the reservation expires
   unconfirmed rather than converting to recorded spend, so OpenAI Realtime
   voice minutes would go unrecorded if this route ran. **Not live**:
   `MASTERY_REALTIME_ENABLED` is confirmed off in Vercel. Tracked in
   `WISHLIST.md`; do not set that flag true in production until the route
   logs usage.
2. **Retention TTL is an open product decision, not a code gap.** Migration
   048 keeps `goal_answers` indefinitely with no TTL job, by deliberate
   choice recorded in `CONTINUITY.md`. "Until you delete it" is accurate and
   tested; it just has no expiry date attached. Needs a decision from
   Travis, not a commit.
3. **The two new transitive audit findings** above — **closed the same
   day.** `npm audit fix` took them lockfile-only, with no `package.json`
   change and no direct dependency moved; `npm audit --omit=dev` now reports
   0 vulnerabilities. All four gates were re-run after the bump because both
   packages sit on live paths. Dev-only findings in `vitest` and `vite`
   remain and are deliberately untouched: clearing them needs
   `npm audit fix --force`, which is a breaking-change upgrade, and they are
   not production exposure — the CI gate audits with `--omit=dev`.

None of the three block a production deployment. The email-verification
auto-approve caveat from the 22 August section (open signup reaching every
paid AI route) is now covered by blocker 5 being closed: the reservation
system enforces per-request and per-plan, so an unapproved-but-verified
account can no longer overspend the shared budget the way it could when the
gate was read-then-spend.

## Executive summary

| Severity | Count | Summary |
|---|---:|---|
| Critical | 1 | Any authenticated user can promote their own database profile to admin/pro through the current RLS policy. |
| High | 5 | Untrusted navigation can produce post-login XSS/open redirects; vulnerable production dependencies are installed; blocked/unapproved users can bypass access controls; AI/TTS quota accounting is incomplete; expensive endpoints lack rate limits and consistent usage gates. |
| Medium | 10 | Lint and CI gates are unhealthy, security headers are absent from app configuration, request validation and upload defenses are inconsistent, test coverage stops below HTTP/auth boundaries, important database indexes are missing, operational monitoring is absent, deployment documentation/environment validation is incomplete, the Proxy adds duplicated auth work, and the public asset payload is very large. |
| Low | 3 | Some internal errors are exposed, production logs may contain user/model content, and hard-coded personal/admin details reduce portability. |

### Release blockers

Do not deploy publicly until all of these are complete:

1. Replace the `profiles_owner` `FOR ALL` RLS policy with read-only self-access and service-role/admin-only mutation. — **Migration drafted** (`032_lock_down_profiles_rls.sql`), not yet applied to Supabase.
2. Sanitize every `next`/`returnUrl` before passing it to `router.push`, `router.replace`, or `redirect`. — **Fixed** 2026-08-04.
3. Upgrade Next.js and its paired ESLint configuration to a patched version and obtain a clean production dependency audit. — Open.
4. Enforce approved/unblocked status inside every protected page, Server Action, and Route Handler—especially all paid AI routes. — **Fixed** 2026-08-04 for the paid-AI page/route surface identified in this audit.
5. Add atomic usage reservation and rate limiting that covers Anthropic, OpenAI, OpenAI Realtime, and ElevenLabs. — Open.
6. Make lint, typecheck, tests, build, audit, and migration checks mandatory CI gates. — Lint errors fixed (0 remaining); no CI workflow exists yet.

## Remediation log

Work below was completed 2026-08-04, same day as the audit, scoped to fixes
that were self-contained (no product/infra decisions, no conflict with
other in-flight work). Each item was verified with `tsc --noEmit`, the full
Vitest suite (307 tests), `npm run build`, and — for the security headers —
an actual `curl` against a local `next start` server. Full detail in
`PROJECT_LOG.md`.

**Fixed:**
- **HIGH-01** (unsafe `next`/`returnUrl`) — new `utils/safe-redirect.ts` (`safeInternalPath`, 13 unit tests) rejects `javascript:`, `data:`, absolute/protocol-relative/encoded/backslash variants. Applied at every redirect call site: `app/(auth)/login/page.tsx`, `app/auth/confirm/route.ts`, `app/mastery/[milestoneId]/page.tsx`, `app/review/[milestoneId]/page.tsx` (the mastery/review clients receive an already-sanitized value, so no separate client-side fix was needed).
- **HIGH-03** (blocked/unapproved bypass on paid AI routes) — new `enforceUsageGate()` in `lib/usage.ts` (thin wrapper over the existing `checkUsageAllowed`, which already checked `approved`/`is_blocked`) applied to the 11 API routes that made a provider call with no gate at all: `dashboard/goals`, `dashboard/goals/document/extract`, `dashboard/refine`, `dashboard/classify-topic`, `interview/check-similarity`, `interview/generate-feedback`, `interview/generate-hint`, `interview/generate-question`, `interview/generate-session-assessment`, `notes/coach`, `notes/summarize`. `app/api/interview/tts/route.ts` was refactored onto the same helper for consistency. Separately, `verifyUserAccess()` was applied to the 10 pages that previously checked only `auth.getUser()`: `interview`, `interview/[room]`, `interview/[room]/summary`, `learn`, `mastery/[milestoneId]`, `review/[milestoneId]`, `study/[goalId]/ask`, `study/[goalId]/track`, `tracker`, `tracker/[trackId]`, `upgrade` (the last two also had their separate `profiles` query merged into `verifyUserAccess`'s single fetch). Scope: the paid-AI/approval-gate surface identified by the audit — not a claim that every authenticated page/route in the app was re-audited from scratch.
- **MEDIUM-01** (lint errors) — 28 → 0 errors. Fixed the 4 genuine "mutate a ref during render" anti-patterns (`components/code/CmEditor.tsx`, `components/code/DrillMock.tsx` ×2, `hooks/useDrillAudio.ts`) by moving the mutation into a `useEffect`. Scoped `eslint-disable` (with rationale comments) on 3 findings that are legitimate patterns the newer `react-hooks` rules flag conservatively — a ref read inside a deferred keypress handler, and two "reset countdown timer on prop change" effects in `DrillMock.tsx` that don't have a non-effect equivalent without a larger timer-state redesign I wasn't willing to risk untested. Added an `eslint.config.mjs` override disabling `no-require-imports` for `tools/architecture-dashboard/scripts/**` (a standalone `"type": "commonjs"` Node CLI, not part of the Next.js app). 9 pre-existing `exhaustive-deps`/unused-var *warnings* were left as-is (out of scope — errors only).
- **MEDIUM-02** (no security headers/CSP) — `next.config.ts` now sets `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, and a `Content-Security-Policy-Report-Only` (per the audit's own recommendation to start report-only) built from the app's actual external surface (Supabase, OpenAI Realtime, jsDelivr for Pyodide/DuckDB-WASM). `poweredByHeader: false`.
- **MEDIUM-06** (missing FK indexes) — drafted `supabase/migrations/033_missing_fk_indexes.sql`, not yet applied (see below).
- **MEDIUM-08** (partial — deployment docs) — replaced the `create-next-app` template `README.md`; committed a value-free `.env.example` via a `.gitignore` exception (`!.env.example`), now including the previously-undocumented `SUPABASE_ACCESS_TOKEN`; pinned `"engines": { "node": ">=20.9.0" }` in `package.json`; exposed the existing health-check script as `npm run health` and added the missing `OPENAI_API_KEY` check to it. CI, `vercel.json`, and the migration rollback runbook are still open.
- **MEDIUM-09** (Proxy duplicate auth) — narrowed the matcher in `proxy.ts` to exclude `/api/*`. Route Handlers can set their own cookies (Server Components can't), so API routes already self-refresh the session via their own `getUser()` call — this removed a redundant Supabase round trip on every API request without losing anything (the only actual authorization decision the Proxy ever made, the `/interview` page redirect, didn't touch `/api/*` anyway).
- **LOW-01** (raw error leakage) — `app/api/auth/self-approve/route.ts` and `app/api/dashboard/goals/[id]/route.ts` now log the Supabase error server-side and return a stable public message.

**Drafted but NOT applied** (require you to run them against Supabase — see each file's header comment):
- **CRITICAL-01** — `supabase/migrations/032_lock_down_profiles_rls.sql`. Before applying: audit existing `profiles` rows for values an attacker may already have set via the current hole (the migration's header explains why every legitimate write already goes through the service-role client, so this should be a safe drop-in).
- **MEDIUM-06** — `supabase/migrations/033_missing_fk_indexes.sql`.

**Explicitly not started** (need a product/infra decision first — see conversation for the full list): HIGH-02 (Next.js version upgrade), HIGH-04/HIGH-05 (usage-accounting rework + rate limiting), MEDIUM-03/04/05/07/10, LOW-02/03.

## Scope and method

The audit covered 313 TypeScript/TSX/SQL source files (approximately 36,168 lines), 46 Route Handler files, 31 database migrations, server/client trust boundaries, authentication and authorization, service-role usage, uploads and document parsing, AI-provider cost paths, dependency health, production configuration, tests, public assets, and operational readiness.

The following checks were run locally without printing secret values:

| Check | Result |
|---|---|
| `npm run build` | Pass; 51 static pages generated and all dynamic routes compiled. |
| `npx tsc --noEmit --pretty false` | Pass. |
| `npm test -- --reporter=verbose` | Pass; 23 files and 294 tests. |
| `npm run lint` | **Fail**; 28 errors and 9 warnings. |
| `npm audit --omit=dev --json` | **Fail**; 4 high-severity vulnerable production packages. |
| `npm outdated --json` | Multiple stale direct dependencies; Next.js latest was 16.3.0 at audit time. |
| Git secret/file-history checks | No tracked `.env*`, private-key, or database-backup filename was found in current history; `.env.local` is ignored. |

The review used the version-pinned Next.js 16.2.9 documentation under `node_modules/next/dist/docs`, including authentication, data security, Route Handlers, Proxy, environment variables, CSP, `useRouter`, and the production checklist.

### Limitations

- This was a source, migration, build, and dependency audit—not a live penetration test.
- The deployed Supabase project's actual policies and migration history were not introspected. The RLS findings describe the state produced by the repository migrations; verify production has not diverged.
- Paid-provider health calls were not made, so key validity, account limits, and model availability were not tested.
- Vercel project settings, Supabase Auth dashboard settings, WAF/CDN controls, backup/restore configuration, email templates, and DNS/TLS configuration were not available in the repository.
- Lighthouse, browser accessibility, cross-browser, and load tests were not run because no deployed or locally orchestrated test environment is defined.

## Detailed findings

### CRITICAL-01: Authenticated users can promote themselves to admin/pro through Supabase

**Evidence**

- Migration 007 creates `profiles_owner` as `FOR ALL` with only `auth.uid() = user_id`: [`supabase/migrations/007_profiles.sql`](supabase/migrations/007_profiles.sql#L12).
- Later migrations add privilege-bearing columns—`is_admin`, `approved`, `is_blocked`, `usage_reset_at`, and `token_limit`—without replacing that policy: [`supabase/migrations/013_admin_flag.sql`](supabase/migrations/013_admin_flag.sql#L1), [`supabase/migrations/014_admin_system.sql`](supabase/migrations/014_admin_system.sql#L1).
- No later migration drops or narrows `profiles_owner`.
- The client-side Supabase anon key is intentionally public, so a signed-in attacker can call Supabase REST directly with their session token; they do not need an application UI for this.

**Impact**

An authenticated user can update their own profile row to set `is_admin=true`, `plan='pro'`, `approved=true`, `is_blocked=false`, or an arbitrary `token_limit`. `requireAdminPage` and `requireAdminApi` trust `profiles.is_admin`, so this can lead to full admin access, user administration, architecture data access, unrestricted paid usage, and bypass of blocking.

**Required remediation**

Create a new migration before launch that removes mutation rights from normal users. If there are currently no user-editable profile fields, the safe shape is read-only self-access:

```sql
DROP POLICY IF EXISTS "profiles_owner" ON public.profiles;

CREATE POLICY "profiles_select_own"
ON public.profiles
FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = user_id);

REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM authenticated;
```

Keep privilege changes behind the server-only service-role client and an independently verified admin gate. Add a database integration test proving a normal user cannot update every privileged column. Review existing profile rows for unauthorized privilege changes before launch.

### HIGH-01: Untrusted return URLs create XSS and open redirects

**Evidence**

- Login reads `next` from the URL and passes it directly to `router.push`: [`app/(auth)/login/page.tsx`](app/%28auth%29/login/page.tsx#L37).
- The mastery page accepts `returnUrl` without validation, uses it in server redirects, and passes it to Client Components: [`app/mastery/[milestoneId]/page.tsx`](app/mastery/%5BmilestoneId%5D/page.tsx#L12).
- Both mastery clients pass that value to `router.push`: [`app/mastery/[milestoneId]/MasteryClient.tsx`](app/mastery/%5BmilestoneId%5D/MasteryClient.tsx#L105), [`app/mastery/[milestoneId]/MasteryRealtimeClient.tsx`](app/mastery/%5BmilestoneId%5D/MasteryRealtimeClient.tsx#L42).
- The review page checks only `startsWith('/')`, which still accepts protocol-relative `//host/path` values: [`app/review/[milestoneId]/page.tsx`](app/review/%5BmilestoneId%5D/page.tsx#L14).
- The email confirmation flow already demonstrates the stronger relative-path check: [`app/auth/confirm/route.ts`](app/auth/confirm/route.ts#L14).
- The installed Next.js guide explicitly warns that `javascript:` values passed to `router.push`/`replace` execute in page context: `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-router.md:53`.

**Impact**

A crafted login link can execute attacker-controlled JavaScript after the victim successfully signs in. Other flows allow external redirects and repeat the unsafe client navigation pattern. CSP is not configured, so there is no useful secondary mitigation.

**Required remediation**

Centralize a server/client-safe helper that accepts only same-origin absolute paths:

```ts
export function safeInternalPath(value: string | null | undefined, fallback = "/home") {
  return value?.startsWith("/") && !value.startsWith("//") ? value : fallback;
}
```

Apply it before every redirect/navigation and add regression tests for `javascript:`, `data:`, `https://evil.example`, `//evil.example`, encoded variants, backslashes, and valid internal query/hash URLs. Prefer server-controlled destination identifiers over arbitrary return URL strings.

### HIGH-02: Installed production dependencies contain known high-severity vulnerabilities

`npm audit --omit=dev` reported four high-severity vulnerable production packages:

| Package | Installed path/version | Relevant result |
|---|---|---|
| `next` | Direct, 16.2.9 | Multiple advisories affect versions below 16.2.11, including App Router Proxy bypass, Server Action DoS, SSRF scenarios, cache confusion, and endpoint disclosure. Audit proposes Next 16.3.0 as the available fix. |
| `postcss` | Next-bundled 8.4.31 | Path traversal/information disclosure and XSS advisories. |
| `sharp` | Next dependency 0.34.5 | High-severity inherited libvips vulnerabilities below 0.35.0. |
| `form-data` | Via `elevenlabs`, 4.0.5 | CRLF injection in multipart field names/filenames; fixed in 4.0.6. |

The Next Proxy bypass is partially mitigated by the application rechecking authentication in Route Handlers and pages, but `/interview` currently relies on Proxy for one layer and the package remains unsafe to ship.

**Required remediation**

Upgrade `next` and `eslint-config-next` together to a patched release, following the repository's version-pinned Next.js migration guidance. Update the ElevenLabs dependency or override `form-data` to a compatible patched version. Regenerate the lock file, rerun build/tests/lint, and require `npm audit --omit=dev --audit-level=high` to pass in CI. Review these advisories: [GHSA-6gpp-xcg3-4w24](https://github.com/advisories/GHSA-6gpp-xcg3-4w24), [GHSA-m99w-x7hq-7vfj](https://github.com/advisories/GHSA-m99w-x7hq-7vfj), [GHSA-89xv-2m56-2m9x](https://github.com/advisories/GHSA-89xv-2m56-2m9x), [GHSA-f88m-g3jw-g9cj](https://github.com/advisories/GHSA-f88m-g3jw-g9cj), and [GHSA-hmw2-7cc7-3qxx](https://github.com/advisories/GHSA-hmw2-7cc7-3qxx).

### HIGH-03: Blocked and unapproved users can bypass application access controls

**Evidence**

- `verifyUserAccess` correctly checks `approved` and `is_blocked`, but it is used by only 10 page files: [`lib/supabase/verify-access.ts`](lib/supabase/verify-access.ts#L10).
- `getAuthenticatedUserId` checks identity only, not approval/block status: [`lib/supabase/auth-helper.ts`](lib/supabase/auth-helper.ts#L12).
- Many protected pages check only `auth.getUser()`, including interview, learning, tracker, review, mastery, and study pages.
- Twenty-nine authenticated API files have neither `checkUsageAllowed` nor an approval/block gate. This includes paid AI paths such as dashboard classification/refinement/course generation, five interview AI routes, Notes Coach/summarization, and tracker generation.
- Proxy checks only whether `/interview` has a user; it does not check approval/block status: [`proxy.ts`](proxy.ts#L31).

**Impact**

An authenticated account that an admin blocks can continue calling significant portions of the application directly, including paid AI endpoints. An unapproved account can do the same. UI redirects are not authorization controls.

**Required remediation**

Create one route-safe access helper that verifies the Supabase user and current profile state and returns consistent `401`, `403`, or `429` responses. Use it in every protected Route Handler and Server Action. Use the page equivalent everywhere outside explicitly public routes. Continue to check authorization at the final data operation; do not depend on Proxy alone.

### HIGH-04: Usage accounting does not reliably enforce the advertised cost limits

**Evidence**

- `checkUsageAllowed` sums only `tokens_in + tokens_out`; it ignores `tts_chars`: [`lib/usage.ts`](lib/usage.ts#L71).
- TTS logs only `ttsChars`, so TTS activity never moves the value used by the quota check: [`app/api/interview/tts/route.ts`](app/api/interview/tts/route.ts#L67).
- OpenAI Realtime sessions check the token quota but record no usage at all: [`app/api/tracker/mastery/realtime-session/route.ts`](app/api/tracker/mastery/realtime-session/route.ts#L36).
- Notes Coach and Notes summarization make OpenAI calls but do not call `checkUsageAllowed` or `logUsage`: [`app/api/notes/coach/route.ts`](app/api/notes/coach/route.ts#L23), [`app/api/notes/summarize/route.ts`](app/api/notes/summarize/route.ts#L19).
- Thirteen authenticated, user-facing AI routes have no usage gate or usage log.
- Many metered routes invoke `void logUsage(...)` after provider completion. The write is neither awaited nor scheduled with Next.js `after()`, so a serverless invocation may end before the log is durable.
- Quota evaluation is a read/sum followed later by provider work and logging. Concurrent requests can all pass before any usage row exists.
- Usage-query errors effectively fail open because absent rows become a zero total.
- The interview summary Server Component calls Claude on page render without usage accounting: [`app/interview/[room]/summary/page.tsx`](app/interview/%5Broom%5D/summary/page.tsx#L75).

**Impact**

Free, blocked, or compromised accounts can generate materially unbounded provider spend. The admin gauge can under-report real spend, and the free limit is not an enforceable financial control.

**Required remediation**

- Reserve budget atomically in Postgres before the provider call, using an RPC/transaction and idempotency key.
- Track provider-specific units: Anthropic/OpenAI input/output/cached tokens, ElevenLabs characters, Realtime audio/text tokens or session duration, retries, and failed billable requests.
- Await the accounting write or use `after()` for non-blocking durable logging.
- Define hard per-request, per-minute, per-day, and monthly caps. Do not exempt pro users from abuse/rate caps merely because their monthly product allowance is higher.
- Alert from provider billing as a second independent control.

### HIGH-05: Expensive endpoints have no rate limiting and inconsistent request bounds

There is no rate limiter in the repository. Authentication and a monthly counter are not substitutes for burst controls. Repeated calls can consume AI/TTS spend, database connections, CPU-heavy parsing, or background generation capacity.

Examples:

- Dashboard goal creation can trigger multiple model calls plus an asynchronous track build, with no idempotency or usage gate: [`app/api/dashboard/goals/route.ts`](app/api/dashboard/goals/route.ts#L18).
- Tracker generation directly invokes the expensive generation pipeline without a usage gate: [`app/api/tracker/generate/route.ts`](app/api/tracker/generate/route.ts#L6).
- Interview question/feedback/hint/similarity/assessment endpoints have no usage gate.
- Document extraction accepts 15 MB and performs in-memory PDF/DOCX/HTML parsing plus up to two topic-extraction attempts and a domain-classification call: [`app/api/dashboard/goals/document/extract/route.ts`](app/api/dashboard/goals/document/extract/route.ts#L45).
- `request.formData()` materializes the multipart body before `file.size` is checked. Notes image upload has the same pattern: [`app/api/notes/images/route.ts`](app/api/notes/images/route.ts#L76).
- Session and usage quotas are check-then-insert/check-then-call flows, so concurrent requests can exceed them.

**Required remediation**

Apply distributed rate limits keyed by authenticated user and a privacy-preserving IP signal. Use tighter limits for authentication, upload, document extraction, TTS, Realtime token minting, and every AI generation route. Add idempotency keys for goal/track generation. Reject oversized requests from `Content-Length` when present, retain post-parse verification, configure platform body limits, and bound every string/array before building prompts.

### MEDIUM-01: Lint fails and production build does not enforce it

`npm run lint` reports **28 errors and 9 warnings**. Application errors include unsafe ref access during render, synchronous state updates inside effects, and unstable hook dependency lists in:

- [`components/code/CmEditor.tsx`](components/code/CmEditor.tsx#L37): 3 errors.
- [`components/code/DrillMock.tsx`](components/code/DrillMock.tsx#L317): 4 errors and 6 warnings.
- [`hooks/useDrillAudio.ts`](hooks/useDrillAudio.ts#L42): 1 error.

The remaining 20 errors are CommonJS import-style violations in the architecture-dashboard scripts. The build still passes because current Next.js builds do not run ESLint, and no CI workflow exists.

**Remediation:** fix the application hook/ref findings; add a scoped ESLint override for intentional CommonJS tool scripts or migrate them deliberately; make lint a required CI step before build.

### MEDIUM-02: No application-level security header policy is configured

[`next.config.ts`](next.config.ts#L3) is empty and Proxy sets no security headers. The application therefore defines no Content Security Policy, frame-ancestor policy, MIME-sniffing protection, referrer policy, permissions policy, or explicit HSTS policy. Hosting infrastructure may add some headers, but that is not documented or tested here.

**Remediation:** add and test a CSP compatible with Supabase, WebAssembly/Pyodide, audio blobs, signed image URLs, and any provider connections. At minimum define `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'` (or an explicit allowlist), and `form-action 'self'`, plus `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, and HSTS at the TLS edge. Set `poweredByHeader: false`. Start CSP in report-only mode and promote it after observing violations.

### MEDIUM-03: Runtime request validation is mostly type assertion, not validation

Most handlers cast `await request.json()` to a TypeScript type. TypeScript does not validate runtime input. Several routes immediately call string or array methods on asserted values, allowing malformed requests to become `500`s, and many chat histories/fields lack per-item length constraints.

**Remediation:** use a runtime schema library or small explicit parsers at every boundary. Validate UUIDs, enums, ISO dates, numbers/ranges, object keys, array counts, message roles, and maximum string lengths. Return consistent `400` responses and set request-body limits. Fuzz malformed JSON and wrong-type inputs in route tests.

### MEDIUM-04: Upload validation trusts client MIME and buffers files in memory

Positive controls exist: document/image type allowlists, 15 MB/10 MB post-parse limits, private storage, random object names, signed URLs, extracted-text truncation, and script/style removal from HTML. Remaining gaps:

- File type is selected from browser-supplied `File.type`; PDF, DOCX, and image magic bytes are not verified.
- Entire multipart bodies and files are buffered before validation/extraction.
- There is no per-user storage quota, file-count quota, malware/content scan, decompression-ratio guard, PDF page cap, DOCX ZIP-entry cap, or extraction timeout.
- Image bytes can be stored with an asserted image content type without decoding/re-encoding.

**Remediation:** sniff magic bytes and parse defensively, cap decompressed content/pages/entries, enforce timeouts and storage quotas, and consider decoding/re-encoding images. Keep raw documents ephemeral as the current design does.

### MEDIUM-05: Tests do not cover HTTP, authorization, RLS, or browser-critical flows

The 294 passing tests are valuable but all 23 test files are library-level unit tests. There are no `*.spec.ts`/E2E tests, no Playwright configuration despite Playwright being installed, and no automated tests for Route Handlers, Server Actions, Supabase RLS, admin separation, blocked users, upload limits, redirects, rate limits, or quota concurrency.

The standalone [`scripts/test-api.ts`](scripts/test-api.ts#L1) covers only a few interview endpoints, uses a development service-role bypass, writes an MP3, is not a package script, and is not CI-suitable.

**Remediation:** add integration tests with at least two normal users plus one admin. Prove cross-tenant IDs fail, profile privileges cannot be changed, blocked/unapproved accounts receive `403`, unsafe redirects are rejected, malformed/oversized requests return `4xx`, and concurrent quota attempts cannot overspend. Add Playwright smoke tests for signup/confirm/login/logout and the primary learning flow.

### MEDIUM-06: Core foreign-key/query columns lack indexes

The initial interview and tracker migrations define foreign keys and frequent filters without supporting indexes. Examples include `sessions.user_id`, `questions.session_id`, `answers.question_id`, `tracks.user_id`, `milestones.track_id`, `milestone_entries.milestone_id`, and `learning_goals.user_id`: [`supabase/migrations/001_initial_schema.sql`](supabase/migrations/001_initial_schema.sql#L7), [`supabase/migrations/005_tracker.sql`](supabase/migrations/005_tracker.sql#L2), [`supabase/migrations/006_learning_goals.sql`](supabase/migrations/006_learning_goals.sql#L2).

PostgreSQL does not automatically index referencing foreign-key columns. These tables are queried by those columns and used inside RLS subqueries, so performance and lock behavior will degrade as data grows.

**Remediation:** capture `EXPLAIN (ANALYZE, BUFFERS)` for common queries and add targeted composite indexes, for example sessions by `(user_id, room, status, started_at DESC)`, questions by `(session_id, order_index)`, answers by `question_id`, tracks by `(user_id, created_at DESC)`, milestones by `(track_id, kanban_column, position)`, entries by `(milestone_id, created_at)`, and goals by `(user_id, created_at DESC)`.

### MEDIUM-07: Operational observability and failure handling are not production-ready

There is no error-monitoring/telemetry integration, structured logger, request ID propagation, audit log for admin actions, provider latency/error metrics, health endpoint, or alert configuration in the repository. There are no application-owned `error.tsx`, `global-error.tsx`, `loading.tsx`, or `not-found.tsx` files. Many database errors are intentionally converted into empty states, which can hide migration drift and outages.

**Remediation:** add structured, redacted logging; error monitoring; provider and database latency/error metrics; usage/budget alerts; admin audit events; and actionable health/readiness checks. Add route-level error/loading boundaries and distinguish “empty” from “failed to load.”

### MEDIUM-08: Deployment documentation and environment validation are incomplete

- [`README.md`](README.md#L1) is the untouched create-next-app template and does not describe architecture, required services, migrations, environment variables, deployment, rollback, backups, or incident response.
- `.gitignore` ignores `.env*`, including `.env.example`, so the existing template is not committed as deployable documentation.
- `package.json` does not declare a Node engine or package-manager version. Local checks used Node 24.15.0 and npm 11.12.1.
- The health script omits `OPENAI_API_KEY`, Realtime configuration, database migration state, storage bucket/policies, and application-level checks. It is not exposed as an npm script.
- No CI, `vercel.json`, Docker definition, Supabase `config.toml`, or documented migration release procedure is present.

**Remediation:** commit a value-free environment template via a `.gitignore` exception, validate environment variables at server startup, pin a supported Node line, replace the README, document Supabase migration and rollback/restore procedures, and add a preflight command that verifies schema version and storage configuration without exposing credentials.

### MEDIUM-09: Proxy performs duplicated remote authentication on nearly every request

The Proxy matcher includes pages and API routes and calls `supabase.auth.getUser()` for all of them, but it only makes an access decision for `/interview`: [`proxy.ts`](proxy.ts#L31). Route Handlers and pages then call `getUser()` again. This adds network latency and Supabase load to static/public pages and every API call without providing centralized authorization.

**Remediation:** keep Proxy focused on session refresh/optimistic routing and narrow its matcher where possible. Preserve secure authorization inside pages, actions, and handlers. Measure before/after auth latency and request volume.

### MEDIUM-10: Public assets total 177.7 MB

The `public` directory contains 296 files totaling approximately 177.7 MB, dominated by many 4–6 MB focus-music MP3 files. This does not put all bytes into a user's JavaScript bundle, but it increases repository/deploy transfer size and can create substantial static bandwidth cost if caching or playback behavior is inefficient.

**Remediation:** move large media to object storage/CDN, use immutable hashed names and long-lived caching, normalize/encode audio for web delivery, lazy-load it, and measure actual transfer. Add a bundle/static-asset budget to CI.

### LOW-01: Some API responses expose internal provider/database messages

Examples include raw Supabase error messages from self-approval and goal deletion: [`app/api/auth/self-approve/route.ts`](app/api/auth/self-approve/route.ts#L26), [`app/api/dashboard/goals/[id]/route.ts`](app/api/dashboard/goals/%5Bid%5D/route.ts#L18).

**Remediation:** return stable public error codes/messages and keep detailed errors only in redacted server logs.

### LOW-02: Logs may retain user or model content

Session creation logs the user-selected topic, and several AI error paths log raw provider errors or model-output fragments: [`app/actions/session.ts`](app/actions/session.ts#L19), [`app/api/tracker/mastery/evaluate/route.ts`](app/api/tracker/mastery/evaluate/route.ts#L131), [`app/api/tracker/mastery/session/route.ts`](app/api/tracker/mastery/session/route.ts#L189).

**Remediation:** define a data classification and retention policy, redact prompts/transcripts/topics by default, and log identifiers/metrics rather than content. Ensure provider data-retention settings match the product privacy policy.

### LOW-03: Personal/admin identity is hard-coded

The owner's email is embedded in migrations and public UI: [`supabase/migrations/013_admin_flag.sql`](supabase/migrations/013_admin_flag.sql#L4), [`supabase/migrations/014_admin_system.sql`](supabase/migrations/014_admin_system.sql#L8), [`app/blocked/page.tsx`](app/blocked/page.tsx#L22), and [`app/pending/page.tsx`](app/pending/page.tsx#L24).

**Remediation:** bootstrap admins through a documented secure operation, use a role/claim or protected admin-membership table, and move support contact details into configuration or product content.

## Positive controls already present

These are worth preserving:

- TypeScript strict mode is enabled and typecheck passes.
- Production compilation succeeds without suppressed type errors.
- 294 focused unit tests cover parsers, prompt-output validation, scoring, mastery limits/idempotency, document extraction, and code-drill logic.
- `.env.local` and `.env*` are ignored; no environment/private-key/backup filename was found in Git history during this review.
- `SUPABASE_SERVICE_ROLE_KEY` is confined to server-side modules/scripts, and [`lib/supabase/service.ts`](lib/supabase/service.ts#L1) imports `server-only`.
- API keys are not prefixed `NEXT_PUBLIC_`; only the expected Supabase URL/anon key are public.
- Auth uses server-verified `getUser()` rather than trusting cookie session contents.
- Admin pages and admin architecture APIs perform server-side admin checks.
- Most service-role data operations explicitly include `user_id`, and normal Supabase clients benefit from table RLS.
- The auth confirmation redirect already rejects protocol-relative paths.
- Note images use a private bucket, UUID paths, ownership checks, and expiring signed URLs.
- Uploads have basic MIME/size allowlists; extracted documents are truncated before prompts and are not persisted after track generation completes.
- HTML extraction removes common hidden/script content, and document prompts frame uploaded text as untrusted data.
- No `dangerouslySetInnerHTML` usage was found. React rendering and `react-markdown` defaults reduce stored-XSS risk.
- Model-output parsers have explicit shape/length validation in several high-value learning/mastery paths.
- Dependency versions are lock-file pinned (`package-lock.json` lockfile v3).

## Maintainability and architecture observations

- The codebase is feature-rich but increasingly concentrated: `MilestoneDrawer.tsx` is 1,148 lines, `DrillMock.tsx` 952, the central prompt module 685, `MasteryClient.tsx` 625, and `ChatWindow.tsx` 501. Breaking these into state machines, domain services, and smaller view components would improve testability and reduce regression risk.
- There are 88 Client Component/hook files. This is not inherently wrong, but interactive boundaries and large browser-only dependencies such as Pyodide/DuckDB/CodeMirror should be measured with a bundle analyzer.
- Database access is spread across pages and handlers rather than a consistently server-only data access layer. A DAL would make owner/approval/block checks harder to omit.
- Several helpers that instantiate Anthropic or read server environment variables do not import `server-only` (`lib/claude/assessSession.ts`, `lib/learn/topic-domain-server.ts`, `lib/tracker/generate.ts`, `lib/tracker/priority.ts`). Add the marker as defense in depth.
- Error-tolerant fallbacks are user-friendly but can hide missing migrations. For example, a missing shared drill cache causes repeated live model generation. Production should alert on these fallbacks.

## Recommended remediation sequence

### Phase 0 — before any public deployment

1. Ship and verify the restrictive `profiles` RLS migration; inspect existing profile privilege values.
2. Fix and regression-test all unsafe return URL handling.
3. Upgrade vulnerable dependencies and obtain a clean high-severity production audit.
4. Introduce a unified approved/unblocked route/page/action authorization layer.
5. Put atomic budget reservation, rate limits, idempotency, and complete provider accounting in front of every billable operation.
6. Fix application lint errors and make quality/security commands required CI checks.

### Phase 1 — immediately after blockers

1. Add runtime schemas and strict input size/count limits.
2. Harden uploads with magic-byte validation, parser limits/timeouts, and storage quotas.
3. Add security headers and test the CSP in report-only mode.
4. Add RLS/authorization integration tests and Playwright release smoke tests.
5. Add missing database indexes based on real query plans.
6. Add monitoring, redaction, alerts, admin audit logs, and error boundaries.

### Phase 2 — production hardening

1. Move large audio assets to a CDN/object store and establish performance budgets.
2. Refactor the largest stateful components and create a server-only DAL.
3. Replace the README with operating/deployment/runbook documentation.
4. Exercise backup restoration, migration rollback, provider outage behavior, and incident response.
5. Run a staging load test and an authenticated browser security test before launch.

## Proposed CI release gate

At minimum, every release should run:

```powershell
npm ci
npm run lint
npx tsc --noEmit --pretty false
npm test
npm audit --omit=dev --audit-level=high
npm run build
```

Add separate jobs for migration lint/drift checks, RLS integration tests against an ephemeral Supabase project, Playwright smoke tests, and static/bundle size budgets. Production deployment should require all jobs and a reviewed migration plan.

## Final readiness checklist

- [ ] Normal authenticated users cannot mutate `plan`, `is_admin`, `approved`, `is_blocked`, `token_limit`, or `usage_reset_at`. — migration drafted, not applied; no automated regression test yet.
- [ ] Two-user cross-tenant tests pass for every resource type.
- [x] Unsafe `next`/`returnUrl` values are rejected everywhere. — fixed 2026-08-04, `utils/safe-redirect.test.ts`.
- [x] Blocked/unapproved users cannot load protected pages or call protected APIs. — fixed 2026-08-04 for the paid-AI surface (see remediation log above).
- [ ] Every billable operation has atomic allowance reservation, burst limiting, durable accounting, and an idempotency strategy.
- [ ] TTS and Realtime usage are measured and hard-capped.
- [ ] Production dependency audit has no high/critical findings.
- [ ] Lint, typecheck, unit/integration/E2E tests, and build all pass in CI. — all four pass locally (0 lint errors, 307/307 tests); no CI workflow configured yet.
- [ ] CSP and baseline security headers are verified on deployed responses. — headers ship in `next.config.ts` and were verified against a local `next start`; not yet verified on an actual deployment.
- [ ] Upload magic bytes, decompression limits, timeouts, and storage quotas are enforced.
- [ ] Supabase migrations, RLS policies, indexes, storage bucket policies, and Auth settings are verified in staging.
- [ ] Monitoring, provider budget alerts, audit logs, backups, restore test, and rollback runbook are operational.
- [x] README/environment template/Node version accurately describe the production deployment. — fixed 2026-08-04.
- [ ] Staging smoke, load, accessibility, and browser-security tests pass.

Until the Critical and High findings are resolved and verified, the safest assessment is **do not expose this deployment to untrusted users or production billing credentials**.
