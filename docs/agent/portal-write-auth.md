# Portal write auth — service role vs user JWT + RLS

## Goal

Portal mutations should prefer:

```text
Bearer JWT → membership check → write with user JWT → RLS as second gate
```

Today (post-fix for profile 500s) many routes use:

```text
Bearer JWT → membership check → write with service role (RLS bypassed)
```

Service-role-after-membership is a **pragmatic fix** for production RLS drift and band-member edge cases. It is **not** the long-term target for tables that already have correct member policies in `supabase/reset.sql`.

## When service role is correct forever

| Use case | Why |
|----------|-----|
| `label_messages` welcome insert | Artists have **SELECT only** — no artist INSERT policy |
| `editor_notifications` to admin/editor | Artists must not write arbitrary notifications |
| System jobs / cron / admin ops | No end-user session |
| Cross-tenant admin tools | Explicit elevated privilege |

Do **not** migrate these back to the user client without new RLS policies.

## When user JWT + RLS should be enough

If production matches `reset.sql`, member policies already allow portal users via `artist_members`:

| Table | Member write policies (SSOT: `reset.sql`) |
|-------|-------------------------------------------|
| `artists` | `artists: own artist update` (UPDATE) |
| `artist_epks` | insert + update via `artist_members` |
| `artist_landing_pages` | insert + update via `artist_members` |
| `artist_billing_profiles` | `artist write own` (ALL) |
| `artist_documents` | `artist write own` (ALL) |
| `epk_fonts` | insert + delete |
| `epk_share_links` | insert + update |
| `epk_versions` | insert only (no member UPDATE/DELETE — version rows are append-only) |

**Known historical failure mode:** production still enforced `artists.user_id = auth.uid()` while app membership uses `artist_members`. Band members then fail under user JWT; service role “fixed” it without applying schema.

## Current code posture (after PR)

Membership verified with bearer client, then **service role** for writes on
(via `withPortalMembershipWrite` + `portalMemberWrite` canary):

- `PUT /api/portal/profile`
- Onboarding server actions (`artist_epks`, `artists`, welcome message)
- EPK document / restore / fonts / share
- Fan page document / publish / preview-token
- Billing profile
- Document vault upload / download / delete
- Uploads: photo / rider / asset / release-cover
- Invoices GET/POST/PATCH + statement view
- Messages inbox / send / folders / [id] PATCH (message routes pin membership on sender or recipient artist after load)
- Concerts + ICS export
- Checklist toggle
- Submit release / video + submission drafts + list submissions
- Interview request PATCH
- Portal feedback `GET/POST /api/portal/feedback`
- Tour Planner (all routes via `authenticateTourPlannerRequest` → membership write)

R2 uploads stay server-side with env credentials (not RLS).

**Auth:** `authenticatePortalBearer` accepts **Bearer** (preferred) or **cookie session** (dual-auth window for older clients). Portal UI should send Bearer via `getPortalAuthHeaders()`.

**Read-only / no artist pin (Bearer only):** FAQ, EPK templates list, cover-art-check (rate-limited), proxy-image.

## Phase plan — migrate back without reintroducing 500s

### Phase 0 — Do not ship regressions

- Keep service-role writes in production until Phase 2 gates pass.
- Never remove membership checks.
- Always pin `artist_id` from `resolvePortalArtist`, never trust body alone for authorization.

### Phase 1 — Verify production RLS vs `reset.sql`

**Static CI (always):** `npm run verify:portal-rls` — asserts every expected policy name in
`scripts/verify-portal-rls.sql` has a matching `CREATE POLICY` in `supabase/reset.sql`.
Wired into `npm run ci`.

**Live (optional):** set `VERIFY_PORTAL_RLS_DATABASE_URL` (Postgres connection string) and re-run
`npm run verify:portal-rls` (requires `pg`). Or run the SQL file in Supabase SQL editor:

```sql
-- scripts/verify-portal-rls.sql
```

**Pass criteria:**

1. Policies listed in the script exist on the expected tables.
2. No leftover policies that only allow `artists.user_id = auth.uid()` for portal updates (unless also OR’d with `artist_members`).
3. Spot-check: as a **band member** (in `artist_members`, not `artists.user_id`), authenticated PostgREST update of `artists.hometown` and upsert of `artist_epks` succeeds when using the **user** JWT (can be done via a temporary admin debug route or Supabase client in a secure script — not browser service key).

If Phase 1 fails → **apply** the relevant policy DDL from `reset.sql` (or a dedicated policy-only SQL file derived from it) to production, re-run verify. Do not flip app code first.

### Phase 2 — Dual-path canary (implemented)

Env flag: `PORTAL_WRITES_USE_USER_JWT=1` (default **off** = service-role only).

Helper: `src/lib/portal/portalWriteClient.ts` → `portalWriteWithCanary()`.

1. Membership check (unchanged).
2. If flag off → write with service role (current prod default).
3. If flag on → try **user JWT**; on RLS/permission failure log `portal_rls_fallback` via `app_logs` and fall back once to service role.
4. When fallback rate is ~0 for N days across primary + band-member accounts → Phase 3.

**Wired routes (canary):** profile PUT, billing POST, EPK document PUT, fan-page document PUT, onboarding save/complete/skip (epks + artists).  
**Always service-role:** gallery→press sync, welcome `label_messages`, editor notifications.

### Phase 3 — Flip default to user JWT

Per table / route group (order by risk):

1. **Low risk (dedicated tables, member policies from day one):** billing, documents, epk fonts/share  
2. **Medium:** fan page (`artist_landing_pages`), EPK document/versions  
3. **High (user-visible 500 history):** profile route (`artist_epks` + `artists`)

After each group: manual QA (primary artist + band member) + unit tests with mocked clients.

Remove service-role fallback only when dual-path metrics and QA are green.

### Phase 4 — Hardening

- Remove flag and fallbacks.
- Keep service role only for the “forever” list above.
- Optional: column-level guard on `artists` so members cannot set privileged columns (`is_visible`, `user_id`, settlement flags, etc.) — either narrow UPDATE via trigger or split public/portal-updatable columns. Today RLS allows full-row UPDATE for members; service role has the same app-layer field whitelist in routes (keep that whitelist forever).

## App-layer rules (always)

Regardless of JWT vs service role:

1. **Auth + AuthZ:** prefer `withPortalMembership(req, artistId)` for mutation routes (Bearer + membership + `userDb`/`serviceDb`).
2. **Writes:** `portalMemberWrite(ctx, meta, write)` for dual-path canary.
3. **Field allowlist:** only portal-safe columns on `artists` (bio, hometown, genres, socials, image, …). Never pass raw body through to `artists`.
4. **Partial profile PUT:** client sends only dirty fields; server skips `artist_epks` upsert when only roster fields change.
5. **Errors:** map DB failures to `SERVER_ERROR` / `FORBIDDEN` without leaking internals; log server-side with table + Postgres code.
6. **IoC:** pass `SupabaseClient` into DAL; routes choose client via membership helper.

## Helper

`portalWriteWithCanary({ userDb, serviceDb, context, write })` in `src/lib/portal/portalWriteClient.ts`.

Do not invent a second auth system — reuse `authenticatePortalBearer` + `resolvePortalArtist`.

## QA matrix (before flipping each group)

| Actor | Action | Expect |
|-------|--------|--------|
| Primary portal user (`artist_members` + often `artists.user_id`) | Save profile (hometown) | 200, row updated |
| Band member (`artist_members` only) | Save profile | 200, row updated |
| Unrelated authenticated user | Save with foreign `artist_id` | 403 |
| Anonymous | Same | 401 |
| Primary | Onboarding complete | 200; welcome message present or non-blocking fail |
| Primary | EPK save + fan page publish | 200 |

## Prod apply note

This repo’s SSOT is **`supabase/reset.sql`** (no `supabase/migrations/`). Applying policy fixes means running the policy section for the affected tables (or the whole reset in controlled env). Prefer extract-and-run policy DDL over full reset on production data.

## Status

| Phase | Status |
|-------|--------|
| 0 Keep service-role fix shipped | Done |
| 1 Prod RLS verify | **Todo** — run `scripts/verify-portal-rls.sql` |
| 2 Dual-path canary | **Done** (flag off by default; enable in staging/prod when ready) |
| 3 Flip to user JWT by group | Todo |
| 4 Remove fallback + harden artists columns | Todo |
