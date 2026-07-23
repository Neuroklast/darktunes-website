# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **P1-1 Observability:** optional Sentry (`@sentry/nextjs`) via `instrumentation.ts` / client init — no-op without DSN; `x-request-id` + `requestId` on API errors; structured JSON logs; client error boundaries report to Sentry + `/api/log-error`; CSP allows Sentry ingest hosts.
- **Portal release submission wizard:** guided multi-step flow (type → field groups → tracks → review) driven by `field_group`; track focus mode, copy/apply-all, `?step=` URL, review completeness, prefill from last submission.
- **Server submission drafts:** `submission_form_drafts` + portal draft API (release/video); local IndexedDB cache.
- **Cover art verification:** server JPEG 3000×3000 check with stable error codes, retries, and short-lived HMAC token so submit can skip re-download; no R2 during form.
- **Required idempotency** on release submit (UUID); duplicate key returns prior submission when known.
- **Video submission wizard** shell parity with release form.
- **Admin wizard groups:** submission form manager can set each field’s wizard group (`metadata`, `distribution`, `rights`, `track`, custom).

### Fixed
- **Release submit blocked by Drive CORS:** cover art check no longer runs in the browser against CORS-blocked hosts.
- **Sync reliability (covers / queue / Odesli):** R2 cover uploads retry transient DNS errors (`getaddrinfo EBUSY`) and are concurrency-capped; iTunes release concurrency lowered to 2. Queue executor is single-flight (`sync_executor_lease`) with a ~280s budget (`maxDuration` 300). Admin progress uses backlog drain (not 24h `done`) and only shows 100% when drained; poller re-kicks only when `running === 0`. Odesli throttled to ~4 req/s, does not retry 429 in-request, and batches artist `platform_links`. iTunes 200-collection cap is logged when hit.
- **Sync → frontend stale data**: queue executor now revalidates public tags **and** list paths (`revalidatePublicContent`) at batch end; YouTube/sync-api/artist routes share the same helper. Admin full release sync polls the queue, reloads the list, and busts public cache instead of reloading immediately after `{ accepted: true }`. Video CRUD/sync also revalidates the `videos` tag. `GET /api/sync/queue` returns queue stats (no longer aliases POST enqueue). `/api/sync` accepts `verifySyncTrigger` (admin/editor), matching the queue route.
- **Settlements — ledger double-booking**: statement-linked invoice payments no longer post a second negative ledger row when `invoice_liability` already exists; open balance returns to zero after full pay.
- **Settlements — approve idempotency**: single statement approve only accepts `draft`; re-approve / retry cannot double-book `statement_payout`.
- **Settlements — correction workflow**: creating a correction no longer supersedes the original or books ledger delta; supersede + delta happen on correction approve so artists keep seeing the live statement.
- **Invoices — USt / gross totals**: payment caps and carry-forward unpaid amounts use gross (net + tax) matching the PDF.
- **Portal invoices — locked periods**: creating a statement-linked invoice rejects locked/archived settlement periods (422).
- **News — press exclusivity**: public news queries and RLS exclude `is_press_only`; press readers require published/scheduled + due `published_at`.
- **News — unknown status**: mapper defaults unknown statuses to `draft` (was `published`).
- **SOS UI**: “Sonstiges Digital” residual no longer double-counts Believe/Bandcamp.
- **Auth — finance APIs**: sales-statements, settlements, invoices, and SOS admin routes require **admin** (editors blocked; matches UI).
- **XSS — theme customCss**: admin CSS is sanitized before `<style>` injection (`sanitizeThemeCss`).
- **Portal messages**: MessagesInbox uses shared `sanitizeHtml` on SSR (no raw HTML passthrough).
- **Health**: `GET /api/health?mode=full` requires admin Bearer or `CRON_SECRET`; SystemHealthWidget sends the admin token.

### Performance
- **Image optimization cleanup**: removed all `unoptimized` props and `wsrv.nl` helper wrappers (`getOptimizedImageUrl`, `getSquareThumbnail`) from every public-facing `<Image>` component (11 files). All images now flow through Next.js's built-in optimizer and Cloudflare CDN.
- **`sizes` prop** added to every `fill` image that was missing it (PressReleaseDetailClient, ArtistEpkClient, PressReleasesClient, News.tsx, VideoGridBlock, ReleaseGridBlock) — prevents browsers from over-downloading near-viewport-width images.
- **`priority` prop** added to above-the-fold images: first news card in `News.tsx`, artist hero in `ArtistDetailContent.tsx`, artist hero in `ArtistEpkClient`.

### Refactored
- **Centralized `createPublicSupabaseClient`**: removed 6 in-file duplicates (releases/[id]/page, artists/[slug]/page, news/[slug]/page, about/page, sitemap, datenschutz/page) in favour of the shared `@/lib/supabase/publicClient` module.
- **Deduplicated data fetches** in `press/releases/[slug]/page` and `press/artists/[slug]/page` using `React.cache()` — `getPressReleaseBySlug` and `getArtistBySlug` are now called once per request across `generateMetadata` and the page component.

### Added
- **ISR pre-rendering**: `releases/[id]` and `news/[slug]` now export `generateStaticParams()` + `dynamicParams = true`, pre-rendering all visible entries at build time so ISR starts warm rather than cold on-demand.
- **Loading skeletons** (zero CLS): added `loading.tsx` for all previously uncovered async routes — `/artists`, `/events`, `/events/[id]`, `/news/[slug]`, `/fan/[slug]`, `/datenschutz`, `/impressum`, `/login`, `/promo-pool`, `/epk/share/[token]`, `/newsletter`, `/newsletter/confirmed`, `/offline`, `/account/privacy`, `/account/delete`, `/press/releases/[slug]`, `/press/artists/[slug]`, and all 12 admin sub-pages (`/admin/features`, `/admin/settings`, `/admin/analytics`, `/admin/assets`, `/admin/users`, `/admin/statements`, `/admin/videos`, `/admin/tour-planner`, `/admin/portal-faq`, `/admin/api-keys`, `/admin/support`, `/admin/promo-log`).
- **Metadata exports**: `/promo-pool` and `/editor` now export `generateMetadata()` with `robots: noindex`.

### Changed
- **`generateInvoicePdf`** converted from synchronous with `require()` to `async` with `await import()` — eliminates `@typescript-eslint/no-require-imports` suppressions.
- **ESLint `react-hooks/exhaustive-deps` suppressions removed** from `TiptapEditor.tsx`, `FileExplorer.tsx`, `PromoLogManager.tsx`, `AdminDashboard.tsx`, `ArtistForm.tsx`, and `useSosCSVProcessor.ts` by fixing root causes: ref-based stable callbacks, functional `setState` updaters, and a `sendProcessRef` to decouple worker lifecycle from `sendProcess` identity.

- **Enterprise Analytics — Portal** (`/portal/analytics`): 11 tabs — Streaming, Listeners, Territories, Events (concert + promo impact), Earnings, Releases, Revenue Mix, EPK & Press, Settlement, Website engagement, Merch. Overview intelligence panel on `/portal` with deep links. Authenticated Supabase reads for correct RLS.
- **Enterprise Analytics — Admin** (`/admin/analytics`): Label Intelligence Hub — roster health, period trends, press CRM, website engagement, financial audit viewer. Sidebar entry under MANAGEMENT.
- **Gold-layer tables**: `promo_impact`, `page_events`, `merch_orders` in `supabase/reset.sql` + `src/types/database.ts`.
- **Website tracking**: consent-gated `PageTracker` + `POST /api/page-events` (rate-limited, service-role insert, slug resolution). Shop clicks from roster cards.
- **Merch pipeline**: `buildMerchOrderRows()` in SOS worker → upsert on Accounting **Save to Portal**.
- **DAL**: `pageEvents.ts`, `merchOrders.ts`, `labelAnalytics.ts`, `promoImpact.ts`; analytics compute modules in `src/lib/analytics/`.
- **Artist Portal — Document Vault**: `/portal/documents` — artists upload and manage PDF/DOCX contracts, GEMA forms, and splits documents. Stored in R2 under `artist-documents/{artistId}/`. `artist_documents` table with RLS. Route handlers: `POST /api/portal/documents/upload` (20 MB), `DELETE /api/portal/documents/[id]`.
- **Artist Portal — Calendar**: `/portal/calendar` — tour date / event calendar view for the artist's own concerts.
- **Artist Portal — Interviews**: `/portal/interviews` — interview request management and scheduling.
- **Artist Portal — Onboarding Wizard**: `/portal/onboarding` — first-run wizard guiding new artists through profile setup, photo upload, and social links.
- **Artist Portal — Help / FAQ**: `/portal/help` — FAQ page and artist support contact form.
- **Artist Portal — Video Submission**: `/portal/releases/videos/new` — artists submit new video entries for admin review (`is_visible=false`). Notifies admins via `editor_notifications` and email.
- **Admin — Accounting tab**: `/admin/accounting` — Tab A: SOS Generator (upload royalty PDFs for any artist via `uploadStatement` Server Action); Tab B: Statement History table.
- **Admin — System tab**: `/admin/system` — Health dashboard, Audit/Error/App-Error logs with filtering, Media Library, and Maintenance panel (clear logs, purge orphaned releases, reset checklists, manage accreditations, clear stats).
- **Admin — Release Submissions**: `/admin/release-submissions` — review and approve/reject artist-submitted releases.
- **Admin — Video Submissions**: `/admin/video-submissions` — review and approve/reject artist-submitted videos.
- **Supabase Read Replica client**: `src/lib/supabase/replica.ts` exports `createReplicaSupabaseClient()`. When `SUPABASE_REPLICA_URL` and `SUPABASE_REPLICA_ANON_KEY` are set, analytics queries and admin health/log reads are routed to the replica. Falls back to primary DB when env vars are unset.
- **Admin Maintenance API routes**: `POST /api/admin/maintenance/clear-logs`, `purge-releases`, `reset-checklists`, `clear-accreditations`, `reset-accreditations`, `clear-stats`.

### Changed
- **SOS webhook removed**: `POST /api/webhooks/sos` and `POST /api/webhooks/sos/confirm` deleted. Statement-of-Sales PDFs are now uploaded via a direct `uploadStatement` Server Action (`app/portal/statements/_actions/uploadStatement.ts`) authenticated by the admin's Supabase session. `SOS_WEBHOOK_SECRET` env var is no longer needed.
- `isValidArtistId` and `isValidPeriod` moved from the deleted `src/lib/sos/sosWebhook.ts` into the new `src/lib/sos/validation.ts`.

### Fixed
- **Admin overview counts**: `/admin` now loads artists, releases, news, and videos counts server-side, eliminating client-side Supabase CORS failures and the perpetual loading dashes in “Content at a glance”.
- **Service worker admin navigation warning**: disabled navigation preload in `app/sw.ts` so admin/portal/press navigations excluded from the service worker no longer log cancelled `preloadResponse` warnings.
- **ESLint 0 warnings**: Added `argsIgnorePattern: '^_'`, `varsIgnorePattern: '^_'`, `caughtErrorsIgnorePattern: '^_'` to the `@typescript-eslint/no-unused-vars` rule in `eslint.config.js`. Removed stale `eslint-disable-next-line` directives in `heroItems.ts` and `sos-csv-processor.worker.ts`.
- **`ArtistsManager.tsx` dead state**: Removed vestigial `editingArtist` / `setEditingArtist` state and `artistToFormData()` — editing now navigates to `/admin/artists/[id]/edit`; the inline dialog is create-only.
- **`ColorThemeManager.tsx` useEffect deps**: Added `draft.typography` to the dependency array alongside the individual font-family properties.
- **Upload size limits in SECURITY.md**: Corrected `/api/portal/upload-release-cover` from 10 MB → 5 MB. Added `/api/portal/upload-asset` as 20 MB (was incorrectly listed as 50 MB). Added `/api/portal/documents/upload` at 20 MB.

## [1.1.0] — 2026-06-06

### Added
- **Statement of Sales Email Notifications**: Artists receive an automatic email via Resend when a new statement is uploaded. Email includes period, optional amount, and link to `/portal/statements` for secure download.
- **Admin Statements Manager**: New read-only tab in Admin dashboard to monitor all uploaded statements across all artists.

### Changed
- `sendStatementNotification()` is called after every successful `sales_statements` insert (non-blocking).
