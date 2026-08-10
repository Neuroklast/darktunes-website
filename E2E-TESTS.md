# E2E Test Coverage — Tracking

Goal: Playwright E2E coverage for every route/feature area across the public
frontend, `/admin`, `/portal`, and `/press`, running against a **real local
Supabase stack** (Postgres + Auth + Storage via the Supabase CLI's Docker
stack) instead of mocks or a remote/shared project — as close to production
as possible without touching production data.

This file is the single source of truth for what's actually been built.
Update the checkboxes as work lands; don't let this drift from reality.

## Architecture decision

- Local DB: Supabase CLI local stack (`supabase start`, `supabase/config.toml`,
  ports 54321–54324). Real Postgres/GoTrue/Storage in Docker.
- Schema: `supabase/reset.sql` is the canonical source (no
  `supabase/migrations/` exists today — production is applied by pasting into
  the Supabase Dashboard SQL editor). A generated baseline migration file lets
  `supabase start` apply the real schema locally without changing the
  production deployment process.
- Auth fixtures: created via `supabase.auth.admin.createUser()` (service-role,
  scripted), not raw SQL — GoTrue password hashing/identities aren't reliably
  seedable via plain inserts.
- Content fixtures: `supabase/seed.sql`, applied automatically by
  `supabase start` / `supabase db reset`.
- Test isolation: `workers: 1` for DB-backed runs; tests that create data use
  `e2e-<testId>`-prefixed identifiers and clean up in `afterEach`/`afterAll`.

## Status legend

- [ ] not started
- [~] in progress
- [x] done

## Phase 1 — Local DB foundation

**Status: done and verified at the database level** (schema, RLS, fixture content, fixture users all confirmed via direct `psql` queries — see "Verification" below). Full Playwright browser validation is blocked by an unrelated local port-3000 conflict, see "Known issue" below.

Design changed from the original plan during implementation, for two reasons discovered along the way:

1. **No `supabase/migrations/` directory** — AGENTS.md and `docs/agent/data-and-schema.md` explicitly forbid one (schema SSOT is `supabase/reset.sql` only). So instead of generating a migration file, `scripts/e2e-db-setup.mjs` applies `supabase/reset.sql` directly over a Postgres connection via `psql`.
2. **`supabase/seed.sql` would collide with the Supabase CLI's own auto-seeding** — `supabase start` automatically executes a file literally named `supabase/seed.sql` *before* `reset.sql` has created any app tables, which crashes (`relation "public.artists" does not exist`). Fixture content instead lives in `supabase/e2e-fixtures.sql`, applied manually, in the right order, by our own script.

Additionally: `reset.sql` has a few early statements (the deprecated `press` → `journalist` role migration) that reference tables created later in the same file — harmless when pasted into the Supabase Dashboard SQL editor (which runs statement-by-statement, continuing past individual errors) but fatal if run as one atomic transaction on a truly empty database. `scripts/e2e-db-setup.mjs` applies `reset.sql` via `psql` (not `ON_ERROR_STOP`) **twice** — pass 1 tolerates the early errors, pass 2 converges to a fully-applied, error-free schema. Verified: 0 real errors on pass 2, 107 tables, 261 RLS policies, `get_my_role()` present, `site_settings` seeded.

- [x] `supabase/e2e-fixtures.sql` — content fixtures: 2 artists (1 visible, 1 hidden), 2 releases, 2 news posts (1 public, 1 press-only), fixed `e2e...` UUIDs
- [x] `tests/e2e/fixtures/seed-ids.ts` — same fixed IDs/slugs, importable from Playwright specs
- [x] `scripts/e2e-db-setup.mjs` — orchestrates `supabase start` → apply `reset.sql` ×2 via psql → apply `e2e-fixtures.sql` → bootstrap 3 fixture auth users (admin/artist/journalist) via GoTrue admin API + promote `public.users.role` + link artist to `artist_members` → write `.env.e2e.local`
- [x] npm scripts: `db:e2e:start`, `db:e2e:stop`, `db:e2e:reset`
- [x] devDependencies added: `pg`, `@types/pg`, `dotenv`, `ws`, `@types/ws` (the last two work around Node 20 lacking native WebSocket, which `@supabase/supabase-js`'s realtime client requires even though we only use the admin REST API)
- [x] `.env.e2e.example` — documents the generated `.env.e2e.local` shape
- [x] `playwright.config.ts` — loads `.env.e2e.local` via `dotenv` so both the Playwright runner and the Next.js `webServer` see local-stack credentials (pulled forward from Phase 2 to allow end-to-end validation)

### Verification (2026-07-24)
```
psql: 107 tables in public schema, 261 RLS policies, get_my_role() present
public.users roles: e2e-admin@darktunes.test=admin, e2e-artist@darktunes.test=artist, e2e-journalist@darktunes.test=journalist
public.artist_members: e2e-artist fixture linked to e2e-visible-artist as owner
public.artists: e2e-visible-artist (is_visible=t), e2e-hidden-artist (is_visible=f)
npm run db:e2e:start re-run: fully idempotent (no errors, "already exists" for fixture users)
```

### Known issue — not caused by this work (resolved for this session)
Local Playwright runs default to `http://localhost:3000`, which was being reclaimed by an unrelated project (`/home/simon/Projects/FinTrack`) on this machine. User stopped it manually. Worth remembering if it recurs: `reuseExistingServer: !process.env.CI` will silently reuse whatever's already on port 3000 rather than building darktunes, which produces very confusing failures (unrelated 404s, a form that looks permanently disabled).

### Live Playwright run against the local stack (2026-07-24)
Ran `tests/e2e/portal.spec.ts` against the real local Supabase stack end-to-end:
- ✅ `unauthenticated users are redirected to /login`
- ✅ `upload-asset API rejects unauthenticated requests` (401)
- ❌ `authenticated portal overview renders when credentials are configured` — form fills correctly with the `e2e-artist` fixture credentials, "Sign In" is clicked, but the page never navigates to `/portal` within 15s and no visible error appears.

### Root cause found and fixed (2026-07-24, later same day)
The failure above was three independent local-stack-only bugs stacked on top of each other, found by tracing a Playwright trace's console/network logs and adding temporary proxy-side debug logging (reverted after diagnosis):

1. **CSP blocked the browser from ever reaching the local Supabase stack.** `connect-src` in `src/lib/security/contentSecurityPolicy.ts` only allowed `https://*.supabase.co`, so `signInWithPassword` failed client-side with a silently-caught `TypeError: Failed to fetch` (CSP violation) — no request ever left the browser. Fixed: `buildContentSecurityPolicy()` now appends the configured `NEXT_PUBLIC_SUPABASE_URL` origin (+ its `ws(s)` equivalent) to `connect-src` **only when that URL's hostname is a loopback address** (`localhost`/`127.0.0.1`/`::1`) — real production Supabase URLs are always hosted, never loopback, so prod CSP is unaffected regardless of misconfiguration.
2. **`anon`/`authenticated`/`service_role` had no table grants at all.** `reset.sql`'s tables are created by the `postgres` role over a plain `psql` connection, which — unlike a hosted Supabase project's Dashboard SQL editor — does not inherit the platform's default-privilege wiring. `\dp public.users` showed only `Dxt` (truncate/references/trigger) for those roles: RLS policies were correctly defined but Postgres denied at the GRANT layer *before* RLS was ever evaluated (`permission denied for table ...`). This also explained the `permission denied for table artists/news_posts` warnings seen during `generateStaticParams`. Fixed: new `supabase/e2e-grants.sql` (local-stack-only, NOT part of the production `reset.sql` SSOT) re-grants standard privileges + default privileges for future tables; applied by `scripts/e2e-db-setup.mjs` right after the two `reset.sql` passes.
3. **Missing `API_CREDENTIALS_ENCRYPTION_KEY` crashed `/portal` and `/auth/callback` at runtime**, not just at build time — `src/lib/env.server.ts`'s Zod schema throws wherever code touching `api_credentials` executes. Fixed: added the same kind of fixed 64-hex-char placeholder already used for the Cloudflare R2 vars, to both `playwright.config.ts`'s `webServer.env` and `.github/workflows/qa.yml`'s job-level `env:`.
4. **Once auth actually worked end-to-end, a 4th issue surfaced**: the e2e-artist fixture got redirected to `/portal/onboarding` instead of `/portal`, because `isProfileComplete()` (`src/lib/api/artistProfiles.ts`) requires an `image_url` and a social/streaming link, and the fixture artist had neither. Fixed: `supabase/e2e-fixtures.sql` now sets `image_url`/`spotify_url` on the visible fixture artist.

All three `portal.spec.ts` tests pass now, verified against both an incrementally-updated stack and a full `npm run db:e2e:reset` (clean-slate Docker stack + fresh schema/grants/fixtures) to make sure the setup-script changes aren't order-dependent.

Also fixed while regression-testing the above (pre-existing bugs unrelated to the root cause, but blocking other specs from proving anything):
- `tests/e2e/rls-validation.spec.ts` was fundamentally unable to pass — it queried `pg_catalog.pg_tables` through the JS `supabase-js` client, but PostgREST only ever exposes the `public`/`graphql_public` schemas (`PGRST106: Invalid schema`). Rewritten to use a direct Postgres connection (new `SUPABASE_DB_URL`, written to `.env.e2e.local` by `scripts/e2e-db-setup.mjs`) via the `pg` package instead. Also dropped a stale table name (`artist_profiles`, which doesn't exist — the actual EPK table is `artist_epks`) in favor of `artist_billing_profiles`, and needed the same Node-20-has-no-native-WebSocket `ws` transport workaround already used in `scripts/e2e-db-lib.mjs`.
- `tests/helpers/supabase.ts`'s `createTestSupabaseClient()` had the same missing `ws` transport workaround (silently would have failed the same way for any spec exercising it under Node 20). A bare `transport: ws` broke `next build`'s whole-project type-check in a way Playwright's transpile-only test run never surfaced (a pre-existing `@types/ws`/`WebSocketLikeConstructor` structural mismatch throws off this call's schema-name generic inference) — fixed by casting through `@supabase/realtime-js`'s own `WebSocketLikeConstructor` type instead of a bare/`any` cast.
- `tests/e2e/tour-planner.spec.ts` had two stale assertions: a Playwright strict-mode violation (`getByRole('heading', { name: 'Tour Planner' })` matched both an `h1` and an `h2` on the admin page — scoped to `level: 1`), and the artist-facing page's heading was renamed from "Tour Planner" to "Tour Production" without updating the test.

Not chased further (separate, narrower issues, flagged for their respective phases):
- `tests/e2e/press-kit.spec.ts` — 3 journalist-dashboard tests fail with `net::ERR_ABORTED` navigating to `/press/dashboard/press-kit`. Distinct from the above; needs its own investigation under Phase 8.

### `tests/e2e/feature-completeness.spec.ts` — 3 stale assertions fixed (2026-07-24)
Found while re-verifying the fixes above (this spec's suite-level regression run first surfaced a red herring: local Playwright defaults to `http://localhost:3000`, which a completely unrelated project — `/home/simon/Projects/FinTrack` — had reclaimed again, exactly as previously documented; `reuseExistingServer: !CI` silently reused it, producing 15 false failures across every spec until the FinTrack process was stopped). Once isolated to the real darktunes server:
- **"homepage key sections are visible"** expected a `section#artists` on the public homepage — that section doesn't exist in `app/_components/HomePageContent.tsx` (only `releases`/`videos`/`concerts`/`news`/`newsletter`). Removed the stale assertion.
- **"admin dashboard tabs are visible for admin role"** expected Radix `tab` roles at `/admin` (`AdminDashboard.tsx`'s `TAB_DEFS`) — but `/admin` now renders `AdminOverview` (stat cards + quick-access section links); the old tabbed dashboard survives only at `/editor` for the `editor` role (`AdminDashboardWrapper`). Rewrote the test to check `AdminOverview`'s actual "Content statistics" stat cards and "Admin sections" quick-links instead of nonexistent tabs.
- **"admin sidebar links are visible for admin role"**: `'Tour Planner'` → `'Tour Production'` (same rename as the tour-planner fix above) and `'Label Intelligence'` → `'Analytics'` (that one sidebar entry uses a `labelDictKey` i18n override — `admin.json`'s `labelIntelligence` key renders as "Analytics", matching the rename ANALYIZE_RESULT.md already recommended and the codebase had already partially applied).

All 6 tests in this file pass now.

## Phase 2 — Playwright wiring

**Status: done.**

- [x] `tests/e2e/global-setup.ts` — ensures local stack is up, runs seed-auth, waits for health
  - Can't do first-time provisioning (webServer in `playwright.config.ts` starts *before* `globalSetup` runs — verified against the installed Playwright's task ordering). So `.env.e2e.local` from `npm run db:e2e:start` must already exist; global-setup's job is: verify required env vars, verify/`supabase start` the stack, poll GoTrue's `/auth/v1/health`, then re-run the (now-shared) fixture-user upsert so a `supabase db reset` or fresh container can't silently drop the fixture accounts.
  - Extracted the fixture-user/status logic shared with `scripts/e2e-db-setup.mjs` into `scripts/e2e-db-lib.mjs` so the two entry points can't drift.
- [x] `tests/e2e/global-teardown.ts` — optional `supabase stop`, gated behind `E2E_STOP_DB_AFTER_TESTS=1` (default off, so local iteration doesn't pay full Docker startup cost every run; CI can opt in)
- [x] `playwright.config.ts` — wired `globalSetup`/`globalTeardown`; `webServer.env` fallbacks changed from fake `placeholder.supabase.co` values to the Supabase CLI's well-known local-dev demo URL/keys (public, identical for every project on default `config.toml`), so an unconfigured build still points at a real local backend once the stack is up
- [x] `tests/helpers/auth.ts`, `tests/helpers/supabase.ts` — dropped remote-only skip guards (`isSupabaseE2EConfigured`, `getTestUser` returning `null`) now that a DB is always available; both now throw an actionable error instead. Updated all specs that used those guards: `dynamic-routes`, `interactions`, `feature-completeness`, `press-kit`, `tour-planner`, `admin-scroll`, and `rls-validation` (the last was explicitly flagged in this file for a Phase 2 revisit — done)
- [x] `.env.example` / `.env.e2e.example` — documented local-stack E2E vars and the new global-setup/teardown behavior

## Phase 3 — CI integration

**Status: done, not yet verified against a real GitHub Actions run** (no way to trigger Actions from this environment — verified by reading the job through and validating YAML syntax; flag if the first real CI run surfaces something).

- [x] `.github/workflows/qa.yml` `e2e-tests` job — add Supabase CLI setup + `supabase start`, stop relying on repo secrets for E2E
  - `supabase/setup-cli@v1` installs the real CLI binary onto `PATH`; `npx --yes supabase ...` (used throughout `scripts/e2e-db-setup.mjs`/`e2e-db-lib.mjs`) resolves to it directly instead of hitting the npm registry each run.
  - Added a defensive `command -v psql || apt-get install postgresql-client` step — GitHub's `ubuntu-latest` image normally ships `psql`, but `scripts/e2e-db-setup.mjs` depends on it to apply `reset.sql`, so don't assume.
  - `npm run db:e2e:start` now runs as its own step: starts the Docker stack, applies the schema twice, applies fixtures, bootstraps the 3 fixture auth users, writes `.env.e2e.local`.
  - The old job-level `env:` block (`secrets.NEXT_PUBLIC_SUPABASE_URL != '' && ... || placeholder`) is gone. Cloudflare R2 vars stay as flat placeholders at job level (no E2E test touches real object storage). The three Supabase vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) are deliberately **not** set at job level — `playwright.config.ts`'s `dotenv.config({ path: '.env.e2e.local' })` does not override variables already present in `process.env`, so a job-wide placeholder would permanently shadow the real local-stack credentials written above and every DB-backed test would silently talk to a fake domain instead.
  - `npm run build` still needs *some* value for those three vars (`src/lib/env.server.ts`'s Zod schema throws during Next's "Collecting page data" build step if they're missing), so placeholders are supplied **step-scoped** to the build step only, not job-wide.
  - `E2E_STOP_DB_AFTER_TESTS=1` set at job level so `tests/e2e/global-teardown.ts` stops the Docker stack at the end of the CI run (kept off by default for local dev — see Phase 2).

## Phase 3b — CI failures on GitHub runners (2026-07-26)

**Status: root-caused and fixed.**

The first real Actions run failed ~25 tests. Two independent causes:

1. **The build ran against a placeholder Supabase project.** `qa.yml` started
   the local stack, then ran `npm run build` with step-scoped
   `NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co`. `NEXT_PUBLIC_*`
   vars are **inlined at build time into both the client and the server
   bundle**, so the whole application — `createBrowserSupabaseClient`,
   `createPublicSupabaseClient`, `generateStaticParams` — pointed at an
   unreachable domain no matter how the server process was configured
   afterwards. That is the single explanation for every symptom in the run:
   `signInWithPassword` never resolved (every auth-dependent test timed out at
   ~16 s), `/artists/[slug]` and `/releases/[id]` returned non-200 (32 ms
   failures), and the homepage rendered no data sections.
   **Fix:** the build step now sources the real `.env.e2e.local` written by
   the preceding `npm run db:e2e:start` (`set -a; . ./.env.e2e.local; set +a`),
   scoped to that step so it can't shadow `playwright.config.ts`'s own dotenv
   load.
2. **`globalTimeout` truncated the run.** It was a flat 10 minutes for 208
   serial tests (`workers: 1` × 3 browser projects). The pasted CI log simply
   stops after test 42 — that is the global timeout firing, not a hang.
   **Fix:** `globalTimeout: (process.env.CI ? 60 : 30) * 60_000`.

The `API_CREDENTIALS_ENCRYPTION_KEY: expected string, received undefined`
lines in that log predate commit `45b7529a`, which added the placeholder to
both `playwright.config.ts`'s `webServer.env` and `qa.yml`'s job-level `env:`.
No further change was needed; verified both are still present.

### Local-only footgun, hit again while verifying the above
`reuseExistingServer: !process.env.CI` means a **stale `next-server` left on
port 3000 is silently reused instead of rebuilding**. One survived a previous
Playwright run and made a whole verification pass test pre-fix code — the
duplicate-`#videos` fix "didn't work" purely because the old bundle was still
being served. `npm run kill` before a verification run. (CI is unaffected:
`reuseExistingServer` is false there.)

## Phase 4 — Test isolation conventions

**Status: done.**

- [x] Document prefixed-fixture + cleanup convention once in `tests/helpers/` — `tests/helpers/README.md`. **This file was checked off previously but had never actually been created**; written now, and extended with the `workers: 1` rationale, the shared-session/no-`mode: 'serial'` pattern used by the new section specs, and the shared IP rate-limit budget.
- [x] Confirm `workers: 1` stays enforced for DB-backed local/CI runs — was previously `process.env.CI ? 1 : undefined` (parallel locally, contradicting the "Architecture decision" section above); now a fixed `1` everywhere

## Phase 5 — Coverage: Public frontend

- [x] `tests/e2e/dynamic-routes.spec.ts` (existing)
- [x] `tests/e2e/route-completeness.spec.ts` (existing)
- [x] `tests/e2e/sitemap-validation.spec.ts` (existing)
- [x] `tests/e2e/user-journeys.spec.ts` (existing)
- [x] `tests/e2e/interactions.spec.ts` (existing)
- [x] `tests/e2e/edgecases.spec.ts` (existing)
- [x] `tests/e2e/responsive.spec.ts` (existing)
- [x] Contact form submission — `tests/e2e/public-flows.spec.ts`. **Corrected scope:** the original item said "real DB insert", but `app/api/contact/route.ts` writes no row — it emails via Resend when a key is configured in Admin → API Keys and otherwise just logs. The test drives the real form and asserts the endpoint's 200.
- [x] Newsletter — `tests/e2e/public-flows.spec.ts`. **Corrected scope:** there is no double-opt-in flow left to confirm. Sign-up moved to the darkmerch.com Shopify embed and `app/api/newsletter/route.ts` answers 410 Gone. Covered: both newsletter pages render, the legacy endpoint still reports 410, and the homepage section embeds the Shopify iframe.
- [x] Promo-pool flow — `tests/e2e/public-flows.spec.ts` (unauthenticated redirect; a signed-in non-journalist gets `PromoPoolAccessGate`, not the tracks)
- [x] Locale fallback behavior (non-en/de Accept-Language) — `tests/e2e/public-flows.spec.ts`, asserted on `<html lang>`: `fr-FR` → `de` (`routing.defaultLocale`), `de-DE` → `de`, `en-US` → `en`
- [x] Artist/release/news detail pages against seeded slugs — `tests/e2e/public-flows.spec.ts`

## Phase 6 — Coverage: `/admin`

- [x] `tests/e2e/admin-scroll.spec.ts` (existing — scroll contract only, not feature coverage). **Still failing, pre-existing** — see "Known failures" below.

**Status: done** — `tests/e2e/admin-sections.spec.ts`. One test per section, all
27 sidebar routes plus 2 sub-routes, asserting the contract
`app/admin/_components/AdminPageShell.tsx` gives every section: HTTP 200, no
bounce to `/login`, a visible `<h1>` with the section's exact title, the
sidebar entry for that route carrying `aria-current="page"`, and no
`app/error.tsx` boundary. Verified: 29/29 green.

- [x] accounting · artists · assets · colors · events · features · messages · news · press · promo-log · release-submissions · releases · settings · statements · system · users · analytics · api-keys · support · tour-planner · fan-page-reviews · submission-form · genres · portal-faq
- [x] content — asserted as a redirect: `app/admin/content/page.tsx` is a legacy stub that `redirect()`s to `/admin/artists`
- [x] Also covered beyond the original list: `/admin` overview, accreditations, videos, video-submissions, `/admin/news/new`, `/admin/messages/compose`
- [x] RBAC checks — unauthenticated → `/login?returnTo=…`; an artist-role session → `/login?error=unauthorized` (proxy.ts bounces rather than rendering 403); an artist-role session against `/api/admin/users` → 401/403/404

Note found while writing these: `AdminOverview`'s stat cards link to
`/admin/content?tab=artists|releases|news|videos`, but `/admin/content` now
redirects unconditionally to `/admin/artists` and drops the tab — so all four
stat cards land on Artists. Not changed here (product behaviour, not a test
concern), flagging it.

## Phase 7 — Coverage: `/portal`

- [x] `tests/e2e/portal.spec.ts` (existing — login/redirect smoke only)
- [x] `tests/e2e/tour-planner.spec.ts` (existing)
**Status: done** — `tests/e2e/portal-sections.spec.ts`. Portal pages have no
shared shell and several render their heading in a client leaf, so the
asserted contract is what they all share: HTTP 200, no bounce to `/login` or
`/portal/onboarding`, the `Artist portal navigation` landmark, a visible
heading, no error boundary. Verified: 21/21 green.

- [x] analytics · billing · calendar · documents · events · help · interviews · invoices · marketing · messages · profile · releases · settings · statements
- [x] tour — asserted as a redirect: `app/portal/tour/page.tsx` `redirect()`s to `/portal/events`
- [x] epk-builder, fan-page — asserted as "renders **or** 404s", because both call `notFound()` when their feature flag is off; pinning one outcome would make the spec a flag-state assertion
- [x] Also covered: `/portal/releases/submissions`, `/portal/releases/videos`
- [x] Access control — unauthenticated → `/login?returnTo=…`; a journalist with no `artist_members` row → `/login?error=no_artist`

## Phase 8 — Coverage: `/press`

- [x] `tests/e2e/press-kit.spec.ts` (existing)
**Status: done** — `tests/e2e/press-sections.spec.ts`. Verified: 18/18 green.

- [x] Journalist application submission → admin accreditation review round trip — posts a real `journalist_applications` row with an `e2e-<testId>` outlet, confirms an admin can retrieve it, and deletes it in `afterAll` over a direct Postgres connection. **Verified through `GET /api/journalist-applications`, not the `/admin/accreditations` table** — a freshly submitted application does not show up in that table; which admin surface is meant to triage pending applications is an open question (below).
- [x] `/press/dashboard` — plus every sibling section: press-kit, press-releases, interviews, accreditation, contact, download-history, profile, promo-pool. Each asserts the `Press dashboard navigation` landmark, a visible heading, no error boundary, and **no unresolved next-intl key** (a raw `pressKit.heading` would otherwise slip past a "a heading is visible" check).
- [x] `/press/releases/[slug]` — there is no `/press/releases` index route, only the detail route; covered for an unknown slug
- [x] `/press/artists/[slug]` — covered against the visible fixture artist's EPK
- [x] Public: `/press` landing and `/press/apply` reachable without a session

### Root cause of the long-standing `net::ERR_ABORTED` on `/press/dashboard/press-kit`
Flagged in Phase 1 as "needs its own investigation under Phase 8". It was never
a routing or access problem: `tests/helpers/auth.ts`'s
`loginForPressDashboard()` signed in via `/login?returnTo=/press/dashboard/press-kit`
and then waited for that URL — but the login screen routes an authenticated
user to `resolveRedirectPath(role)`, which is `/press/dashboard` for a
journalist. The wait therefore timed out, the `beforeAll` threw, and every
subsequent `page.goto` in the block died with `ERR_ABORTED`. The helper now
waits for the role's actual landing page and lets callers navigate onward.
This single fix turned the whole press-kit + press-dashboard set green.

## Known failures still open

- **`tests/e2e/admin-scroll.spec.ts`** — `scrollTop` stays 0, so the wheel-over-row
  contract is not being exercised. Pre-existing (fails on `main` too, not
  introduced by this work). Shrinking the viewport to 1280×400 to force the
  pane to overflow did not help, which suggests the element matched by
  `[data-lenis-prevent].overflow-y-auto` on `/admin/submission-form` is not the
  pane that actually scrolls — `ScrollableAppShell` renders that container with
  `overflow-hidden` when `lockScroll` is set. Needs someone to confirm which
  element owns the scroll on that page before the selector can be fixed.
- **Visual regression snapshots** (`tests/e2e/visual.spec.ts`) fail locally by
  design: `updateSnapshots` is `'none'` off CI and no baselines are committed
  (per AGENTS.md). CI seeds them with `'missing'`. Not a regression.

## Open questions (found while writing the new coverage, not resolved)

1. **`/news/e2e-press-only-news` answers 200 to an anonymous visitor**, even
   though `app/news/[slug]/page.tsx` uses `getPublicNewsPostBySlug()` (which
   filters `is_press_only = false`) and calls `notFound()` on a null result.
   The fixture is correct (`is_press_only = TRUE` in `supabase/e2e-fixtures.sql`).
   Worth confirming whether press-gated content is actually readable by direct
   link. `public-flows.spec.ts` asserts only the listing exclusion for now.
2. **`/press/releases/<unknown-slug>` answers 200** rather than 404, despite the
   route calling `notFound()`. Same shape as (1) — possibly one underlying
   cause. The spec asserts only "does not hit the error boundary".
3. **A submitted journalist application does not appear in `/admin/accreditations`.**
   The row is created and an admin can read it via
   `GET /api/journalist-applications`, so which admin UI is meant to triage
   pending applications is unclear.
4. **`getArtistBySlug()` is not visibility-filtered** — `is_visible = false`
   artists stay reachable by direct URL on both `/artists/[slug]` and
   `/press/artists/[slug]`, and are only excluded from listings. Confirmed
   from source; documented as intended ("unlisted") in `public-flows.spec.ts`.
   Flagging in case it was meant to be a hard gate.

## App fixes made while getting the suite green

- **Duplicate DOM ids on the homepage** (`app/_components/HomePageContent.tsx`):
  the section wrappers for `releases`, `videos`, `news` and `newsletter` each
  carried an `id` that the inner component (`Releases.tsx`, `Videos.tsx`,
  `News.tsx`, `NewsletterSection.tsx`) already renders on its own `<section>`.
  So `#videos`, `#releases`, `#news` and `#newsletter` each resolved to two
  elements — invalid HTML, ambiguous anchor targets, and the direct cause of
  the `interactions.spec.ts` "Video Modal" strict-mode violations. The wrapper
  ids were removed; the inner `<section id="…" class="… scroll-mt-36">` keeps
  the anchor offset that navigation relies on.

## Other existing E2E-adjacent specs (unaffected by this plan)

- `tests/e2e/security.spec.ts`
- `tests/e2e/visual.spec.ts` / `tests/e2e/visual-ci.spec.ts`
- `tests/e2e/rls-validation.spec.ts` — no longer skips; runs against the local stack's service-role creds since Phase 2 (see above)
- `tests/e2e/feature-completeness.spec.ts`
- `tests/performance/*`
