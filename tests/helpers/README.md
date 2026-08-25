# E2E test helpers & isolation conventions

Everything under `tests/e2e/` runs against a **real local Supabase stack**
(Postgres + GoTrue + Storage in Docker via the Supabase CLI), not mocks and not
a shared remote project. Provision it once with `npm run db:e2e:start`; see
`E2E-TESTS.md` for the architecture and `scripts/e2e-db-setup.mjs` for what that
command actually does.

## Helpers

| File | Purpose |
| --- | --- |
| `auth.ts` | Signs in as one of the three fixture accounts (`loginAsAdmin`, `loginAsArtist`, `loginForPressDashboard`) and reads their credentials from the env (`getTestUser`). |
| `supabase.ts` | Anon-key `supabase-js` client for reading seeded content from the test runner (`getVisibleArtists`, `getVisibleReleases`). |
| `pageSettle.ts` | `gotoAndSettle` / `waitForPageSettled` — CI runners never reach `networkidle` (analytics + vitals polling), so `load` is the ceiling there. |

Fixture row IDs and slugs live in `tests/e2e/fixtures/seed-ids.ts` and must stay
in sync with `supabase/e2e-fixtures.sql` by hand.

## Why the suite runs with `workers: 1`

`playwright.config.ts` pins `workers: 1` **everywhere**, not just on CI. Every
spec shares one Supabase stack, one set of fixture users, and one fixed set of
seeded rows. Running specs in parallel would let one test's writes and another's
reads interleave on that shared state. This is an isolation requirement, not a
CI cost control — do not "optimise" it back to parallel without first giving
each worker its own database.

The same reasoning drives the shared-page pattern in the section-coverage specs
(`admin-sections`, `portal-sections`, `press-sections`): they log in once in
`beforeAll` and reuse a single page, because re-authenticating per route would
dominate the runtime of the three-project matrix.

Those describe blocks deliberately do **not** use `mode: 'serial'`. Serial mode
skips every remaining test once one fails, which would hide the state of 20+
other routes behind a single broken section — the opposite of what a coverage
matrix is for.

## Convention for tests that create data

Most specs only read. When a spec must write, it follows all three rules:

1. **Prefix every identifier it creates with `e2e-<testId>`** — e.g.
   ``const testId = `e2e-${Date.now()}` `` and then
   `` `${testId}@darktunes.test` ``. Never reuse a bare fixture value for a row
   the test itself inserts, or a failed run leaves something that looks seeded.
2. **Delete it in `afterAll`/`afterEach`**, unconditionally, so a failing
   assertion still cleans up. Use a direct Postgres connection
   (`new Client({ connectionString: process.env.SUPABASE_DB_URL })` from `pg`)
   when the row is service-role-owned or lives outside PostgREST's
   public-schema exposure.
3. **Never mutate the seeded fixtures** from `supabase/e2e-fixtures.sql`. Other
   specs assert on those exact rows; treat them as read-only.

`tests/e2e/press-sections.spec.ts` ("application to accreditation round trip")
is the worked example.

## Rate limits are shared across the whole run

Several public API routes are IP-rate-limited (`/api/contact`: 5 per 10 min,
`/api/journalist-applications`: 3 per 30 min). All three browser projects hit
one server from one IP, so a spec that posts N times actually posts 3N per full
run. Budget accordingly — see the header comment in
`tests/e2e/public-flows.spec.ts` — otherwise the last project to run fails with
a 429 that looks like a real regression.

## Fixture accounts

Bootstrapped by `scripts/e2e-db-lib.mjs` through the GoTrue admin API (password
hashing and identity rows aren't reliably seedable with plain SQL) and exported
into `.env.e2e.local`:

| Role | Env prefix | Notes |
| --- | --- | --- |
| `admin` | `E2E_ADMIN_` | Full admin panel + portal access. |
| `artist` | `E2E_ARTIST_` | Linked to the visible fixture artist via `artist_members`; also exported as `PLAYWRIGHT_PORTAL_*` for back-compat. |
| `journalist` | `E2E_JOURNALIST_` | Press dashboard access, no artist membership. |

`tests/e2e/global-setup.ts` re-runs that bootstrap on every run, so a
`supabase db reset` between runs can't silently drop the accounts.
