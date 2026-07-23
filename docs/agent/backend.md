# Backend, Admin & Sync

## RBAC (roles & permissions)

**SSOT:** `src/lib/rbac/` — registry, `resolveEffectiveAccess`, guards, route registry.

| Layer | Module |
|-------|--------|
| Edge routes | `proxy.ts` → `resolveEffectiveAccess` + capability guards |
| API Bearer | `src/lib/adminAuth.ts` → `verifyAdmin`, `verifyAdminOrEditor`, `verifyPermission`, `verifySyncTrigger` |
| Admin pages (defense-in-depth) | `requirePageCapability('admin.panel.full')` from `src/lib/rbac/requireAdminPage.ts` |
| RLS | `has_permission()` in `supabase/reset.sql` — system `role_permissions` + `user_custom_roles` |

**System roles:** `admin`, `editor`, `journalist`, `artist`, `user`. Deprecated `press` enum value is aliased to `journalist` at runtime (`normalizeRole`).

**Custom roles:** Admin-defined in `/admin/settings` → `custom_roles` + `user_custom_roles`. Enforced in API (`resolveEffectiveAccess`) and RLS (`has_permission`).

**Adding a system role:** enum in `reset.sql` → `role_permissions` seed → `src/lib/rbac/registry.ts` → `sync_primary_role` CASE → run `npx tsx scripts/validate-rbac.ts`.

## Admin route auth

Use `src/lib/adminAuth.ts`: `extractBearerToken`, `verifyAdminOrEditor`, `verifyAdmin`, `verifyPermission`, `verifySyncTrigger`. All admin routes wrap `withErrorHandler`.

`RolePermissionKey`: `can_publish_news`, `can_edit_news`, `can_manage_artists`, `can_manage_releases`, `can_manage_videos`, `can_view_admin_panel`.

## Rate limiting

External API calls: `withApiRetry()` + per-API profiles in `src/lib/sync/retryPolicy.ts`. Base `HttpError` in `src/lib/rateLimiter.ts`. Rate-limited (429) errors are **not** retried inside `withApiRetry` — the queue reschedules with cooldown. Transient DNS/network I/O uses `withTransientIoRetry()` (e.g. R2 `getaddrinfo EBUSY`). Odesli uses `resolveOdesliSmartLinkThrottled()` (~4 req/s).

## Observability (errors & correlation)

| Piece | Location |
|-------|----------|
| Route wrapper | `withErrorHandler` (`src/lib/errors.ts`) — always sets `x-request-id`, error JSON `requestId` |
| Request id helpers | `src/lib/observability/requestId.ts` |
| Sentry report helper | `src/lib/observability/reportException.ts` (no-op without DSN) |
| Init | `instrumentation.ts`, `instrumentation-client.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts` |
| Client UI | `reportClientError` → Sentry + `POST /api/log-error` |

Env: `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` (optional). Source maps: `SENTRY_AUTH_TOKEN` + org/project. See `DEPLOYMENT.md` / `SECURITY.md`.

## Sync service

Logic in `src/lib/sync/` with injected `SyncDeps`. `syncSingleArtist` / `syncAll` never throw — errors in `SyncResult.errors`. Each run → `sync_logs`.

**Scheduling (no Vercel Cron):** Supabase Cron → `supabase/functions/trigger-sync` → Next.js routes. Auth: `CRON_SECRET` Bearer. Typical schedules: `all` daily 03:00 UTC, `process-queue` every 5 min, `youtube` daily 06:00 UTC.

**Queue:** `sync_queue` DAL in `syncQueue.ts` — job types: `full`, `spotify`, `discogs`, `youtube` (legacy; prefer channel route), `odesli`. Spotify/Odesli force-sync enqueues only; executor in `/api/sync` (~280s budget, `maxDuration` 300, `verifySyncTrigger`). **Single-flight lease** (`site_settings.sync_executor_lease`) prevents overlapping `waitUntil` workers from admin poll kicks. Odesli batches (`ODESLI_BATCH_SIZE`) for releases **and** artist `platform_links`; reschedule on rate limit (15 min cooldown) or remaining work.

**Cover art / R2:** `uploadUrlToR2` retries transient DNS errors and caps process-wide upload concurrency at 2. iTunes release processing concurrency is 2. iTunes lookup is capped at 200 collections (logged when truncated).

**YouTube videos** are **not** part of the artist queue. Channel sync: `POST /api/sync-youtube` (or `sync-api` with `apiSource: youtube`). Cron type `youtube` → that route.

**Public cache after sync:** `revalidatePublicContent()` (`src/lib/sync/revalidatePublicContent.ts`) runs `revalidateTag` + `revalidatePath` for list routes (`/`, `/releases`, `/videos`, …). Queue executor revalidates once per batch end inside `waitUntil`. Admin hooks also call `POST /api/revalidate-content` after mutations and after queue drain.

**Admin UX after full sync:** `useReleases.syncAllReleases` enqueues → kicks executor → polls `GET /api/sync/queue` for up to ~5 min via `waitForSyncQueueIdle` (only re-kicks when `running === 0`). Progress uses backlog drain (`pending+running` vs initial), never 24h `done` counts, and only reaches 100% when drained.

**Release writes:** `syncReleaseFromExternalSource()` in `releases.ts` — cross-source merge before insert, plus same-source self-healing for exact `normTitle(title)` + year matches (for example Spotify `Cut` vs `Cut - Single`). `deduplicateReleases()` also performs an intra-Spotify dedup pass before DB writes so discogs metadata is preserved on the canonical entry. `upsertReleaseBySpotifyId` / `upsertReleaseByDiscogsId` require full UNIQUE constraints on `spotify_id` / `discogs_id` in `reset.sql`.

## API credentials

Encrypted in `api_credentials` (AES-256-GCM). Admin: `/admin/api-keys`. Resolver: `getExternalCredentials.ts`. Bootstrap secrets stay in env.

## Admin assets

SSOT: `assets` table + `asset_folders`. Upload: `POST /api/upload`. Explorer APIs: `/api/admin/assets/*`. Press curation: `press_kit_items` + `PressKitBuilder`. Deletes: R2 first, then DB.

## Admin accounting (`/admin/accounting`)

Admin/editor only. **Guided** default: `AccountingGuidedWizard` (Upload → Review → Publish). **Advanced:** SOS upload, reporting, Abrechnungszentrale (`SettlementCenterPanel`), portal persist, SEPA, trends, rules.

- SOS PDF upload: `uploadStatement` Server Action (same as portal flow)
- Bronze CSV: server-proxy upload/download — see `features.md`
- Save to Portal: `persistSosAnalytics` → gold tables (`territory_metrics`, `merch_orders`, etc.)
- Settlement register, corrections, period lock/archive — see `features.md`

## Bronze CSV import

Client: `bronzeUpload.ts`. Multipart: `bronzeMultipartUpload.ts`. Limits: `bronzeUploadLimits.ts`. Decision tree in `AGENTS.md` / `features.md`.

## SOS upload (portal + admin)

`uploadStatement` in `statements/_actions/uploadStatement.ts`: session auth → presigned PUT → `createSalesStatement` (service role) → `sendStatementNotification` (non-blocking). PDF as Base64 in Server Action.

## Submission notifications

Release/video submit → `editor_notifications` + `sendSubmissionNotificationEmail()` (fire-and-forget).

## Admin system (`/admin/system`)

Health: `GET /api/health` defaults to **lite** (DB liveness); full dashboard snapshot only via `?mode=full` (admin widget uses this). `buildHealthSnapshot` powers full mode + `/api/health/alert`. Sync logs, app errors, maintenance routes. Cron heartbeats + optional alert webhook.

## Scheduled news publishing

No Vercel Cron. Due posts (`status = scheduled`, `published_at <= now`) are promoted to `published` when `getCachedPublicNews()` revalidates (public homepage, `/news`, etc.). Admin saves trigger `revalidateTag('news')` via `useNews`.

## Emoji-free public text (a11y)

User-facing text is stripped of emoji characters via `src/lib/stripEmojis.ts` on read (DAL mappers), write (DAL sanitizers), HTML display (`sanitizeHtml`), admin paste (TipTap + plain inputs), and a one-time `persistEmojiCleanup()` pass during public cache revalidation. Theme preset emoji pickers in admin are excluded.

## Hero featured limits

Releases and news posts support `featured_until` and `featured_removed_reason`. The hero carousel shows at most 10 eligible featured items (`src/lib/heroFeatured.ts`). `enforceHeroFeaturedLimits()` runs during public cache revalidation; enabling an 11th feature in admin prompts a confirmation modal and bumps the oldest active hero item.

## Newsletter (Shopify)

Public sign-up is embedded via `NewsletterSection` (`https://darkmerch.com/pages/newsletter` iframe). Legacy DOI routes (`/api/newsletter`, `/api/newsletter/verify`, `/api/newsletter/unsubscribe`) redirect or return 410 — the `newsletter_subscribers` table and Edge Function were removed.

## Password recovery email

Public: `POST /api/auth/forgot-password` (rate-limited, enumeration-safe). Admin: `POST /api/admin/users/:id/reset-password`.

Both use `requestPasswordReset()` in `src/lib/auth/requestPasswordReset.ts`:

1. **Resend configured** (Admin → API Keys): `auth.admin.generateLink({ type: 'recovery' })` → branded HTML via `sendPasswordResetEmail()` with impressum footer from `site_settings`.
2. **Resend not configured or send fails**: falls back to `auth.resetPasswordForEmail()` (Supabase built-in template).

Recovery landing page unchanged: `/login?type=recovery`.

## User invite email

Admin: `POST /api/admin/users/invite` and `POST /api/admin/artists/:id/invite`.

Both use `requestUserInvite()` in `src/lib/auth/requestUserInvite.ts`:

1. **Resend configured**: `auth.admin.generateLink({ type: 'invite' })` → branded HTML via `sendInviteEmail()`; link verifies at `/auth/callback?invite=1` then lands on `/login?type=invite` (general) or `/portal/accept-invite` (artist).
2. **Resend not configured or send fails**: falls back to `auth.admin.inviteUserByEmail()` (Supabase built-in template).

Role and optional `artist_id` are written to auth user metadata; `handle_new_auth_user` + `syncInvitedUserAccess()` keep `users`, `user_roles`, and `artist_members` in sync.

## Admin users & feature flags

Users tab: `users.ts` DAL + `/api/admin/users/*` (admin only). Feature flags: `site_settings.feature_toggles` (global `promoPool`, `editorTools`) + `portal_feature_flags` (per-module). See [features.md](features.md#feature-flags-admin-adminfeatures).

## Public rate limits (`ipRateLimit.ts`)

| Route | Limit |
|-------|-------|
| `/api/contact` | 5 / 10 min |
| `/api/auth/forgot-password` | 3 / 10 min |
| `/api/journalist-applications` | 3 / 30 min |
| `/api/page-events` | 120 / 10 min |

## robots.txt & llms.txt

`app/robots.ts` — block private prefixes in `disallow`. `app/llms.txt/route.ts` — dynamic from Supabase (revalidate 300s); never list admin/portal routes.

## Vercel deployment

`scripts/vercel-install.sh` — `npm ci` + env validation. Required: `NEXT_PUBLIC_SUPABASE_*`, R2 vars, `API_CREDENTIALS_ENCRYPTION_KEY`. Integrations in Admin API Keys. See `DEPLOYMENT.md`.

## Portal write auth (service role vs user JWT)

**Target:** Bearer → membership (`resolvePortalArtist`) → write with **user JWT** so RLS is a second gate.

**Current (pragmatic):** After membership, many portal routes write with **service role** so band members / production RLS drift do not 500 (profile hometown bug). This bypasses RLS; keep field allowlists and membership checks mandatory.

**Service role forever:** `label_messages` welcome insert (artists SELECT-only), `editor_notifications` to staff, cron/admin jobs.

**Helpers:** `withPortalMembership` + `portalMemberWrite` (`src/lib/portal/withPortalMembership.ts`). Profile PUT accepts **partial** payloads (dirty fields only).

**Migrate back:** verify prod policies with `scripts/verify-portal-rls.sql` → dual-path canary (`PORTAL_WRITES_USE_USER_JWT=1`) → flip tables by risk. Full plan: [portal-write-auth.md](portal-write-auth.md).

## Error logging

Non-fatal errors → `app_logs` (service role). Visible in Admin System tab.

## Zammad support tickets (optional)

Admin → **Support** (`/admin/support`). Env: `ZAMMAD_URL`, `ZAMMAD_API_TOKEN`, optional `ZAMMAD_GROUP` (default `Support`). See `DEPLOYMENT.md`.

- **Lib:** `src/lib/zammad/` — config, client (`POST /api/v1/tickets`), fingerprint, format, `submitTicket` orchestrator.
- **DAL:** `src/lib/api/zammadSupport.ts` — `support_known_errors`, `zammad_ticket_log`.
- **Manual tickets:** `POST /api/admin/support/tickets` (admin only).
- **Auto tickets:** `POST /api/log-error` with `level: error` → background Zammad ticket (`[SYSTEM ERROR REPORT — darkTunes]`).
- **Filters:** known fingerprints (`blocked_known`); same fingerprint + user within 24 h (`blocked_duplicate`).
- **Robustness:** unconfigured/offline Zammad never throws; status logged in `zammad_ticket_log`.