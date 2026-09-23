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

Use `src/lib/adminAuth.ts`. **Preferred (Phase D):**

```ts
const { userId } = await requireAdminFromRequest(req) // admin only, Bearer or cookie
// or
const { userId, serviceClient } = await requireAdminWithServiceClient(req)
// or
await requireAdminOrEditorFromRequest(req)
```

Legacy token helpers still valid: `extractBearerToken` + `verifyAdmin` / `verifyAdminOrEditor` / `verifyPermission` / `verifySyncTrigger`.

Dual auth: **Bearer first**, cookie session fallback (admin UI often uses cookies without Authorization header).

All admin routes wrap `withErrorHandler`.

`RolePermissionKey`: `can_publish_news`, `can_edit_news`, `can_manage_artists`, `can_manage_releases`, `can_manage_videos`, `can_view_admin_panel`.

## Rate limiting

External API calls: `withApiRetry()` + per-API profiles in `src/lib/sync/retryPolicy.ts`. Base `HttpError` in `src/lib/rateLimiter.ts`. Rate-limited (429) errors are **not** retried inside `withApiRetry` — the queue reschedules with cooldown. Transient DNS/network I/O uses `withTransientIoRetry()` (e.g. R2 `getaddrinfo EBUSY`). Odesli uses `resolveOdesliSmartLinkThrottled()` (~4 req/s) and **requires `odesli_api_key`** (the public v1-alpha.1 API was sunset 2026-07-31); without it Odesli is skipped instead of erroring.

## Sync service

Logic in `src/lib/sync/` with injected `SyncDeps`. `syncSingleArtist` / `syncAll` never throw — errors in `SyncResult.errors`. Each run → `sync_logs`.

**Scheduling (no Vercel Cron, no Edge Function):** `pg_cron` + `pg_net` jobs defined in `supabase/reset.sql` call the Next.js worker. Auth: `CRON_SECRET` Bearer read from Supabase Vault (`site_url`, `cron_secret`) — secrets never appear in the cron command. Jobs: `sync-worker` every minute (`POST /api/sync`), `sync-enqueue-daily` (`/api/sync/queue`), `sync-youtube-daily`, `scheduler-heartbeat` (pure-SQL liveness), `sync-telemetry-cleanup`. Schema + jobs are applied automatically on deploy.

**Queue:** `sync_queue` DAL in `syncQueue.ts` — statuses: `pending` | `running` | `done` | `failed` | `cancelled`. Job types: `full`, `spotify`, `discogs`, `songkick`, `bandsintown`, `odesli`, `youtube` (legacy, not executed as video sync). Executor `/api/sync` (bounded ~50s tick budget, Hobby-safe): atomically claims one job at a time via the `claim_sync_jobs` RPC (`FOR UPDATE SKIP LOCKED`, includes visibility-timeout recovery), single-flight worker lease in Postgres (`acquire/renew/release_sync_worker_lease`, TTL 90s, renewed every 30s), writes a `sync_runs` ledger row + `cron_ticks` worker tick, paces ~400ms between artists. `pg_cron` re-invokes every minute for continuation (no self-chain, no 280s `waitUntil`). Enqueue-only paths (`POST /api/sync-api` with `apiSource` spotify, odesli, songkick, or bandsintown) **kick** `/api/sync` immediately via `kickSyncExecutorAfterEnqueue`. Rate-limited artists (non-Odesli) reschedule with cooldown; other artists keep draining. **Admin control (Advanced only):** `GET/POST /api/admin/sync/jobs` — list, cancel, retry. **Admin UI rule:** no infra setup copy.

**Odesli:** A 429 skips that release/artist and continues the batch (no `break`). Artist `platform_links` still run. Leftover *resolvable* `smart_url=null` rows set `hasMoreWork` and reschedule with **0** cooldown — but only when the batch actually advanced (resolved or wrote a fallback). Unresolvable URLs (artist/profile) and skippable Odesli errors (404/405/422) persist a fallback `smart_url` (source URL) or empty `platform_links` so the same 40 rows cannot loop the global job forever. Odesli 429 must not reschedule a full/spotify/… artist job.

**Cover art:** `cacheReleaseCoverArt` skips when the source URL *or* the existing `cover_art` is already on the label CDN / R2 (`isAlreadyCachedCoverUrl`). Do not re-fetch iTunes/Spotify/Discogs artwork on every full sync.

**Cover art / R2:** `cacheReleaseCoverArt` uploads and records failures in `SyncResult.errors` (Spotify, Discogs, iTunes). `uploadUrlToR2` retries transient DNS errors and caps process-wide upload concurrency at 2. iTunes release processing concurrency is 2. iTunes lookup pages past 200 via Search `offset` (hard cap 1000). Name search falls back to the first hit when no exact artist name matches.

**Bandsintown keys:** per-artist keys live in `artist_private_data.bandsintown_api_key` (public `artists.bandsintown_api_key` is nulled on dual-write). `syncAll` overlays private keys before eligibility/`effectiveKey`. Health `getKnownApiConfiguration` counts both `artist_private_data` and leftover public columns, plus the optional global `api_credentials.bandsintown_api_key`.

**YouTube videos** are **not** part of the artist queue and must stay a separate channel sync. Channel sync: `POST /api/sync-youtube` (or `sync-api` with `apiSource: youtube`). pg_cron job `sync-youtube-daily` → that route. Prefer `/api/sync-youtube` for cron (max **500** newest channel videos/run, full `sync_logs` + early `youtube` tick). Both paths use `videoAttribution` + `isYouTubeShort` and omit `is_visible` on upsert so admin-hidden rows stay hidden.

**Public cache after sync:** `revalidatePublicContent()` (`src/lib/sync/revalidatePublicContent.ts`) runs `revalidateTag` + `revalidatePath` for list routes (`/`, `/releases`, `/videos`, …). Queue executor revalidates once per batch end inside `waitUntil`. Admin hooks also call `POST /api/revalidate-content` after mutations and after queue drain.

**Admin UX after full sync:** `useReleases.syncAllReleases` enqueues → kicks executor → polls `GET /api/sync/queue` for up to ~5 min via `waitForSyncQueueIdle` (only re-kicks when `running === 0`). Progress uses backlog drain (`pending+running` vs initial), never 24h `done` counts, and only reaches 100% when drained.

**Release writes:** `syncReleaseFromExternalSource()` in `releases.ts` — cross-source merge before insert, plus same-source self-healing for exact `normTitle(title)` + year matches (for example Spotify `Cut` vs `Cut - Single`). `deduplicateReleases()` also performs an intra-Spotify dedup pass before DB writes so discogs metadata is preserved on the canonical entry. `upsertReleaseBySpotifyId` / `upsertReleaseByDiscogsId` require full UNIQUE constraints on `spotify_id` / `discogs_id` in `reset.sql`.

## API credentials

Encrypted in `api_credentials` (AES-256-GCM). Admin: `/admin/api-keys`. Resolver: `getExternalCredentials.ts`. Bootstrap secrets stay in env.

### Apify Spotify play counts

- Credential: `apify_token` (group Apify) — **not** a Vercel env var.
- Actor: `beatanalytics/spotify-play-count-scraper` via official `apify-client`.
- Route: `POST /api/admin/analytics/sync-spotify-plays` (`scope`: artists \| releases \| all, `dryRun`).
- Auth: admin session **or** `CRON_SECRET` / Vercel cron (same pattern as YouTube sync).
- Eligibility: `is_visible = true` and resolvable Spotify id/url; releases also require visible parent artist. Never uses `followAlbums`/`followSingles` (catalog via explicit release album URLs only).
- Budget: `apify_usage_months`, default **1200 URLs/month**; **429** when exhausted; **503** if token missing (live runs); dry-run works without token.
- Persist: `artist_listener_metrics` source `apify`; `spotify_track_play_snapshots`. Logs: `sync_logs.api_source = apify_spotify`.

## Admin assets

SSOT: `assets` table + `asset_folders`. Upload: `POST /api/upload`. Explorer APIs: `/api/admin/assets/*`. Press curation: `press_kit_items` + `PressKitBuilder`. Deletes: R2 first, then DB.

**Storage bar (`GET /api/admin/assets/storage-stats`):** Dual-auth via `requireAdminOrEditorFromRequest` (stale Bearer **must** fall through to cookies on 401). `used_bytes` prefers the latest `r2_storage_snapshots` row (real `ListObjectsV2` bucket total). Fallback is catalog-only `resolveCatalogStorageStats` — RPC `get_assets_storage_stats()` (JSON) → PostgREST `size_bytes.sum()` → paginated sum. Also returns `catalog_used_bytes`. Service-role client only. UI label is **Bucket storage**. Apply RPC from `reset.sql` on live DBs (`DROP FUNCTION` first if return type changed — Postgres `CREATE OR REPLACE` cannot alter return type).

**R2 garbage + usage scan:** `GET/POST /api/admin/storage-snapshots` lists the bucket with existing S3 credentials (no Cloudflare Analytics token). POST is admin-only, `maxDuration` 60s, continuation via `cursor`; completed scans abort incomplete multipart uploads older than 24h. Orphans (unreferenced keys older than 24h) land in `r2_orphan_objects`. `GET /api/admin/r2-orphans` lists them. `POST /api/admin/r2-orphan-purges` with `{ confirmation: "DELETE ORPHANS" }` deletes a bounded batch after re-checking the referenced-key set. Referenced keys: all `r2_key` / `proof_r2_key` columns, CDN URLs, invoice convention `invoices/{artistId}/{invoiceId}.pdf`, HTML/JSON behind `CLOUDFLARE_R2_PUBLIC_URL`. UI: System → Maintenance. No R2 setup copy.

**Catalog image optimization:** `POST /api/upload` form field `optimize` (default on). Sharp: photos → WebP q82, same pixel size; press-approved and alpha PNG keep original format. `POST /api/admin/asset-optimizations` overwrites existing `assets` image objects in place (`optimized_at`). Cover-art hash keys and DSP 3000×3000 JPEGs are not rewritten.

## Admin accounting (`/admin/accounting`)

Admin/editor only. One linear flow: `AccountingGuidedWizard` (**Files → Checks → Amounts → Statements**). Rules (`RulesPanel`) and Insights (archives, portal persist, trends) are secondary views in the settings toolbar; Statements hosts the Abrechnungszentrale (`SettlementCenterPanel`) and SEPA (`PayoutManager`).

**Binding contract:** [sos-accounting-contract.md](sos-accounting-contract.md) §A (status/actions), §D (permissions), §E (payments). Financial mutations are admin-only; DAL precondition violations must surface as 4xx problem+json, never as generic 500 (#616). SOS period writability (`open|under_review|approved`) applies to **every** financial mutation including `persist-analytics` and `purge-sos-data` (#628/#630).

- SOS PDF upload: `uploadStatement` Server Action (same as portal flow)
- Bronze CSV: server-proxy upload/download — see `features.md`
- Save to Portal: `POST /api/admin/sos/persist-analytics` → `persistSosAnalyticsCore` (gold tables). Territory/merch `revenueEur` is scaled by the artist share before upsert; Excel stays unscaled. Do **not** send 1000+ metric rows through a Server Action / `startTransition` — that surfaces as a Server Components digest toast or `app/error.tsx`.
- Settlement register, corrections, period lock/archive — see `features.md`
- **Data audit (read-only, #630):** `GET /api/admin/sos/settlement-audits` (`scanSettlementAudit`, `settlementAuditCore.ts`) scans existing rows for the ten §E.3 categories (period links, artist mismatches, missing/orphan PDFs, unconfirmed batches, artifact hash/size, duplicates, carry-forwards, balances, view/mail evidence). Strictly read-only, bounded per table (`rowLimit`, default 5000, max 20000), sets `truncated` instead of silently dropping rows, cursor pagination (`next_cursor`). UI: `/admin/accounting/data-audit` (link in the Accounting tab bar). Live R2 hash verification is not wired yet — the detector accepts injected `artifactChecks`/`orphanPdfObjectKeys` (needs R2 access; open acceptance in #630).
- **Data repair (dry-run + apply, #630):** `POST /api/admin/sos/settlement-repairs` builds a plan from `unique` findings only (`settlementRepair.ts`), re-checks preconditions per step and stops on change; `dry_run: false` requires an `operation_id` and journals the run in `settlement_operations` (restore artifact in `result`). Locked/archived periods are refused with 409 `SETTLEMENT_PERIOD_LOCKED` (`findRepairStepsInLockedPeriods`). `GET /api/admin/sos/settlement-repairs/{operation_id}` reads a stored run. Runbook: `ADMIN.md`.

## Bronze CSV import

Client: `bronzeUpload.ts`. Multipart: `bronzeMultipartUpload.ts`. Limits: `bronzeUploadLimits.ts`. Decision tree in `AGENTS.md` / `features.md`. Register may send `file_hash` for duplicate lookup; persist hash only at confirm. Pending batches stay writable until `status === 'completed'`.

## SOS upload (portal + admin)

`uploadStatement` in `statements/_actions/uploadStatement.ts`: session auth → presigned PUT → `createSalesStatement` (service role) → `sendStatementNotification` (non-blocking). PDF as Base64 in Server Action.

## Notifications platform

**Emit only via** `emitNotification()` from `src/lib/notifications` (service role). Unified table: `public.notifications` (RLS: own read/update; insert service-role only). Legacy `editor_notifications` is not written by new code.

| Event type | Audience | Typical emitter |
|------------|----------|-----------------|
| `artist_release_submission` | staff | `POST /api/portal/submit-release` |
| `artist_video_submission` | staff | `POST /api/portal/submit-video` |
| `landing_page_review` | staff | `POST /api/portal/fan-page/publish` (submit_review) |
| `press_asset_suggestion` | staff | `POST /api/portal/upload-asset` |
| `artist_portal_message` | staff | `POST /api/portal/messages/send` (toLabel) |
| `fan_page_review_decision` | artist members | `POST /api/admin/fan-page/review/[artistId]` |
| `release_submission_decision` | artist members | `PATCH /api/admin/release-submissions/[id]` |
| `video_submission_decision` | artist members | `PATCH /api/admin/video-submissions/[id]` |
| `statement_available` | artist members | `uploadStatement` (notify path) |
| `invoice_submitted` | staff (admin) | `POST /api/portal/invoices` |
| `invoice_payment_received` | artist members | `PATCH /api/admin/invoices/[id]/payment` |
| `journalist_application_submitted` | staff (admin) | `POST /api/journalist-applications` |
| `journalist_application_decision` | applicant user | `PATCH /api/journalist-applications/[id]` |

Release/video submit also fires `sendSubmissionNotificationEmail()` (env `LABEL_NOTIFICATION_EMAIL`, fire-and-forget).

**Preferences:** `notification_preferences` (user_id, event_type, in_app, email, push). Missing row = all channels on. `emitNotification` skips users with `in_app=false` for the DB insert; Web Push uses a separate `push=false` filter via `sendPushForNotification`. UI: `/admin/notifications/preferences`, `/portal/notifications/preferences`.

**Web Push (PWA):** After a successful insert, `emitNotification` fire-and-forgets `sendPushForNotification` (`src/lib/push/send.ts`, `web-push` + VAPID). Subscriptions in `push_subscriptions` (RLS: own all). APIs: `GET /api/push/vapid-public-key`, `POST /api/push/subscribe`, `POST /api/push/unsubscribe`. Env: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, optional `VAPID_SUBJECT`. Missing keys → push no-op. SW handlers in `app/sw.ts` (`push`, `notificationclick`) + Badging API.

**Client UX:** `PushBootstrap` / `PortalPushBootstrap` / `AdminPushBootstrap` — one soft “Enable” banner; auto re-sync when permission already granted; app icon badge from portal/admin counts. Preferences include device toggle + per-event push column.

**History:** `/admin/notifications`, `/portal/notifications` via `NotificationCenter`.

**New feature checklist:** catalog entry → emit after successful write → i18n (admin/portal) → routing href → unit/route test.

## Admin system (`/admin/system`)

**SOS data purge (Maintenance tab):** `POST /api/admin/maintenance/purge-sos-data` with `{ scope, confirmation }`. Scopes: `failed_bronze` (unconfirmed/failed batches + R2), `bronze` (all bronze archives), `gold` (territory metrics, merch orders, period summaries, event impact). Confirmation phrases: `DELETE FAILED` / `DELETE BRONZE` / `DELETE GOLD`. Writes `admin_audit_log` + `financial_audit_events`. Does **not** delete `sales_statements`, invoices, or settlement ledger. Per-batch bronze DELETE on Accounting also logs `admin_audit_log`.

Health: `GET /api/health` defaults to **lite** (DB liveness); full dashboard snapshot only via `?mode=full` (admin widget uses this). `buildHealthSnapshot` powers full mode + `/api/health/alert`: **latest sync per API** is `limit(1)` per `api_source` (no global lookback — chatty sources must not bury others as “Never”); 24h SLA stats are a separate capped query (`HEALTH_LOG_STATS_*`). Full snapshot includes **`app.version`** (from `package.json` via `src/lib/appVersion.ts`) and **`app.commit`** (short SHA from `VERCEL_GIT_COMMIT_SHA` / `GITHUB_SHA` / `NEXT_PUBLIC_GIT_COMMIT`). Admin System Health shows `vX.Y.Z · sha`. Sync logs, app errors, maintenance routes. Liveness ticks live in `cron_ticks` (append-only; read latest per kind): `scheduler` (pg_cron alive), `worker` (HTTP hop reached `/api/sync`), `queue`, `youtube`, `health_alert`. `deriveCronHealth` compares `scheduler` vs `worker` to tell “pg_cron down” from “HTTP hop broken”. YouTube channel sync caps at 500 newest videos per run and always writes `sync_logs`. Optional alert webhook. Product release tags/ritual: [RELEASING.md](../RELEASING.md).

## Portal billing compliance

| Topic | Implementation |
|-------|----------------|
| Tax status | `artist_billing_profiles.tax_status` → PDF VAT lines (§19 / reverse charge) |
| VIES | `src/lib/legal/viesVat.ts` → EC REST; required for reverse charge on save + invoice create |
| IBAN | Local only `src/lib/sos/iban-validator.ts` on billing POST |
| FX | Frankfurter via `getEcbRateForCurrency` / `/api/exchange-rates`; non-EUR invoice footnotes |
| PDF immutability | `pdf_sha256` + write-once update guard; R2 key `invoices/{artistId}/{invoiceId}.pdf` |
| PDF access | Email: expiring HMAC link `/api/invoices/{id}/pdf?token=` (`invoicePdfToken.ts`, secret = `API_CREDENTIALS_ENCRYPTION_KEY`). Portal/admin: 10-min presigned URLs. `pdf_url` is never returned to clients (`hasPdf` only) |
| AGB | `/agb` + `portal_terms_*` on `artists` + `POST /api/portal/accept-terms` |

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

In-process IP limits for unauthenticated public endpoints:

| Route | Limit |
|-------|-------|
| `/api/contact` | 5 / 10 min |
| `/api/auth/forgot-password` | 3 / 10 min |
| `/api/journalist-applications` | 3 / 30 min |
| `/api/page-events` | 120 / 10 min |

## Portal / authenticated abuse guards (`rateLimitDistributed` + `portalUploadLimits`)

Prefer **distributed** limits (Upstash when configured, else in-process) keyed by `userId:ip`. SSOT for upload size/MIME and portal rate numbers: `src/lib/uploads/portalUploadLimits.ts`.

| Area | Default |
|------|---------|
| Portal file uploads (photo, rider, asset, cover, documents, fonts, tour tech) | 40 / 10 min |
| Message send | 30 / 10 min |
| EPK export | 10 / 10 min |
| Client error log (`/api/log-error`) | 60 / 10 min |
| Submit release / video | 20 / 10 min |

Route handlers must import size limits from `portalUploadLimits` — no local `MAX_BYTES` copies.

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

## API contract CI (SOTA foundation)

Wired into `npm run ci` → phase `ci:contracts`:

| Script | Purpose |
|--------|---------|
| `verify:portal-rls` | Expected portal RLS policy names ⊆ `reset.sql` |
| `verify:schema-columns` | No `supabase/migrations/*.sql`; critical tables: CREATE columns have matching `ADD COLUMN IF NOT EXISTS` (prevents hometown-class drift) |
| `verify:api-contracts` | Every route uses `withErrorHandler`; portal mutations / admin routes have recognized auth helpers |

Local phases: `ci:contracts` → `ci:typecheck` → `ci:tests` (see [workflow.md](./workflow.md)).

Inventory dump: `npm run api:inventory` (`scripts/extract-api-routes.mjs`).

**Golden route tests:** `tests/helpers/api/routeTestkit.ts` + unit tests under `tests/unit/portal/*Route.test.ts` (401 / 403 / 2xx). After `vi.resetModules()`, throw auth errors via `rejectApiError()` so `instanceof ApiError` matches the route graph.

**New portal mutations:** prefer `withPortalMembershipWrite` + `portalMemberWrite` + Zod allowlist — never raw body to `artists`.

**New columns on evolved tables (`artists`, `artist_epks`):** always add `ADD COLUMN IF NOT EXISTS` next to the CREATE definition.

## Error logging & observability

Non-fatal errors → `app_logs` (service role). Visible in Admin → System → Logs → **App Errors**.

Pipeline:

1. **Global catch** — `instrumentation.ts` (`onRequestError`) captures every unhandled server error (RSC, route handler, server action, proxy) and calls `captureError` (`src/lib/observability/captureError.ts`). Node persists; Edge only logs to console.
2. **Route errors** — `withErrorHandler` (`src/lib/errors.ts`) persists handled route errors via `writeAppLog` (`src/lib/appLog.ts`).
3. **Server actions / background** — `logServerActionError` delegates to `captureError`.
4. **Client** — `reportClientError` (`src/lib/clientErrorReporter.ts`) → `POST /api/log-error` → `writeAppLog`.
5. **Structured logs** — `src/lib/observability/logger.ts` emits JSON lines with PII redaction (email, bearer tokens, long digit runs, sensitive keys). `app_logs.details` is redacted before persistence.

**Aggregation:** rows with the same `fingerprint` (`src/lib/observability/fingerprint.ts`, FNV-1a over event + name + normalized message + first stack frame) are upserted by the `upsert_app_log` RPC into **one row** with an `occurrences` counter and `first_seen_at`/`last_seen_at`. Admins resolve/ignore rows via `PATCH /api/admin/app-logs/{id}`. Retention: pg_cron `app-logs-cleanup` deletes rows not seen for 90 days (`DEPLOYMENT.md`).

**Not an audit log:** business changes belong in `admin_audit_log` (see below).

## Admin audit trail

`admin_audit_log` (append-only) records admin mutations. Two paths:

- **Automatic (broad):** `adminAuth.verifyAdminRequest` records the resolved actor on the request (`src/lib/adminAuditContext.ts`); `withErrorHandler` then writes an entry for `/api/admin/*` mutations, derived from the path (`admin.patch./users/:id`, `admin.post./maintenance/clear-logs`, …). Legacy token-only auth is covered by a request-based actor fallback. Transport-only endpoints (`presign-*`, `multipart/*`) are excluded to avoid flooding the log.
- **Explicit (semantic):** `logAdminActionForRequest(req, db, {...})` writes a richer action (`user.invite`, `sos_data.purged`, …) and marks the request so the automatic fallback does not duplicate it. Use for business-critical mutations.

Related trails: `rbac_audit_log` (role/permission changes), `financial_audit_events` (accounting), `message_events` (shared inbox).

## Zammad support tickets (optional)

Admin → **Support** (`/admin/support`). Env: `ZAMMAD_URL`, `ZAMMAD_API_TOKEN`, optional `ZAMMAD_GROUP` (default `Support`). See `DEPLOYMENT.md`.

- **Lib:** `src/lib/zammad/` — config, client (`POST /api/v1/tickets`), fingerprint, format, `submitTicket` orchestrator.
- **DAL:** `src/lib/api/zammadSupport.ts` — `support_known_errors`, `zammad_ticket_log`.
- **Manual tickets:** `POST /api/admin/support/tickets` (admin only).
- **Auto tickets:** `POST /api/log-error` with `level: error` → background Zammad ticket (`[SYSTEM ERROR REPORT — darkTunes]`).
- **Filters:** known fingerprints (`blocked_known`); same fingerprint + user within 24 h (`blocked_duplicate`).
- **Robustness:** unconfigured/offline Zammad never throws; status logged in `zammad_ticket_log`.