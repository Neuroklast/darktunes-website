# Integration Summary — darkTunes Music Group

## What Is Implemented

### Public Website

- **Hero section** — rotating featured release/news carousel with dynamic background (6s auto-advance + clickable dot indicators); buttons functional (Listen Now → streaming/player, Explore → `#releases` for releases or `#news` for news)
- **Releases section** — server-side fetched from Supabase via RSC + ISR (60s revalidate); semantic `<ul>/<li>` grid; `useReducedMotion` support
- **Spotify Player** — embedded iframe player for the label playlist
- **Artists section** — server-side data, passed as props to client component; shows max 6 cards per visit with stable per-visit shuffle; featured artists are guaranteed in those 6; quick search (name/genre) shows all matches; semantic `<ul>/<li>` grid; full ARIA on icon links; 44×44px touch targets; `useReducedMotion` support
- **Videos section** — YouTube embed gallery; semantic `<ul>/<li>` grid; image proxy via wsrv.nl; `useReducedMotion` support
- **News section** — server-side data from Supabase; semantic `<ul>/<li>` list; "Read Full Story" links to `/news/${slug}`; `useReducedMotion` support
- **Tour section** — upcoming concert dates from Supabase with ticket links
- **Header** — shrinking logo on scroll, navigation (including external darkmerch.com shop link), Lenis smooth scroll, full ARIA (nav label, mobile toggle aria-expanded/controls, mobile nav id), 44px touch targets (`"use client"`)
- **Footer** — Lenis smooth scroll, footer nav wrapped in `<nav aria-label="Footer navigation">`, aria-labels on social icons (`"use client"`)
- **CRT scanline overlay** — full-page vintage aesthetic
- **WCAG 2.1 AA/AAA compliance** — skip navigation link in `app/layout.tsx`, `id="main-content"` on `<main>`, `useReducedMotion` in all animated sections, descriptive alt text, icon aria-labels, 44×44px touch targets, semantic lists

### Infrastructure (Next.js 15 App Router)

- **Next.js 15 (App Router)** + React 19 + TypeScript — migrated from Vite SPA
- **Tailwind CSS v4** (PostCSS) with custom darkTunes brand tokens in `app/globals.css`
- **Framer Motion** for page animations and modal transitions
- **Lenis** smooth scrolling via single `LenisProvider` at root (`app/_components/Providers.tsx`). Uses `ReactLenis` from `lenis/react` (root mode) so `useLenis()` is available anywhere in the tree. `useLenis` re-exported from `src/components/animations/LenisProvider.tsx`.
- **Vitest** unit test suite (`npm test`) — 847 tests passing (80 test files)
- **ESLint** with TypeScript and React-Hooks rules
- **Vercel** deployment via `vercel.json` (framework: nextjs) + `scripts/vercel-install.sh`
- **Supabase SSR** client (`@supabase/ssr`) — server client in `src/lib/supabase/server.ts`, browser client in `src/lib/supabase/client.ts`
- **Edge Middleware** (`middleware.ts`) — auth protection for all `/admin/*` and `/portal/*` routes before page render; also detects locale from `Accept-Language` header and sets `NEXT_LOCALE` cookie
- **Internationalisation (i18n)** — `src/i18n/` custom dictionary pattern; `en.json` + `de.json`; `getDictionary.ts` loads server-side; RSCs pass dict as props to Client Components (IoC); Header has DE/EN locale switcher
- **Database schema** defined only in `supabase/reset.sql` (single idempotent script; no migration files) and mirrored in `src/types/database.ts`
- **TypeScript DB types** in `src/types/database.ts`

### Environment Validation

- **Client-side** (`src/env.ts`) — Zod schema for `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`; warns in dev/prod, returns null if missing (graceful degradation)
- **Server-side** (`src/lib/env.server.ts`) — Zod schema for all server-only vars; throws at startup if any required variable is missing

### Data Access Layer (`src/lib/api/`)

- `artists.ts` — CRUD for artists table
- `releases.ts` — CRUD + `upsertReleaseByItunesId` for iTunes sync
- `news.ts` — CRUD for news_posts table
- `videos.ts` — CRUD for videos table
- `concerts.ts` — read upcoming concerts from concerts table
- `assets.ts` — asset mapping, folder/artist filtering, search, update/move, SHA-256 lookup, and batch delete helpers
- `assetFolders.ts` — folder CRUD plus breadcrumb/path helpers for the admin file explorer
- `siteSettings.ts` — `getSiteSettings` (returns typed `SiteSettings`), `upsertSiteSetting`, `upsertSiteSettings` (batch)
- `artistBillingProfiles.ts` — billing master data for legal invoicing (`artist_billing_profiles`) plus completeness checks for portal invoice gating
- Each DAL function receives `SupabaseClient<Database>` as first arg; fully unit-tested

### React Hooks (`src/hooks/`)

- `useArtists` — loads artists, exposes create/update/delete
- `useReleases` — loads releases, exposes create/update/delete + `syncFromItunes()`
- `useNews` — loads news posts, exposes create/update/delete
- `useVideos` — loads videos, exposes create/update/delete
- `useAssets` — legacy asset CRUD hook used by older admin flows
- `useFileExplorer` — admin asset explorer hook for folder navigation, search, selection, and authenticated mutations
- `useSiteSettings` — loads site settings, exposes `saveSettings()` + cache revalidation
- All hooks check `isSupabaseConfigured` and short-circuit gracefully in dev

### Admin Panel (Next.js App Router)

- Route: `/admin` (dynamic, server-rendered on demand, protected by Edge Middleware)
- Route: `/admin/login` (dynamic, server-rendered on demand)
- Authentication via `useAuth` hook (Supabase Auth)
- Dashboard UI with tabbed interface
- **ArtistsManager** — table + create/edit dialog + delete confirm + **"Sync Now"** per-artist button + skeleton loading states + last-synced-at display
- **ReleasesManager** — table + create/edit dialog + iTunes sync button
- **NewsManager** — table + create/edit (redirects to `/admin/news/new` and `/admin/news/[id]`) + delete confirm; supports artist association (news post linked to a specific artist)
- **VideosManager** — table + create/edit dialog + delete confirm
- **AssetsManager** — folder-based file explorer with tree navigation, grid/list views, drag/drop upload, search, multi-select, batch delete, and artist assignment. Backed by `/api/upload` plus `/api/admin/assets`, `/api/admin/assets/folders`, and `/api/admin/assets/batch`.
- **SiteSettingsManager** — tabbed form (Global / Social Links / Homepage / SEO / Legal / DSGVO / Visual Effects) with Zod validation; Homepage tab supports both a fallback Spotify playlist URI and a multi-playlist array (label + URI) for instant tab switching. Saves all settings to Supabase and revalidates the Next.js ISR cache via `/api/revalidate-site-settings`. Follows IoC pattern: accepts `value: SiteSettings` and `onChange` props; `useSiteSettings` is wired in `AdminDashboard`.
- **UsersManager** *(admin-only tab)* — full user management: lists all registered users (via Supabase Auth Admin API), allows role changes (admin/editor/journalist/user), ban/unban with confirmation dialog, user deletion, and artist ↔ user linking/unlinking. Tab is only rendered when `profile.role === 'admin'`. API routes: `GET/PATCH/DELETE /api/admin/users`, `PATCH /api/admin/users/[id]/link-artist`.
- **FeatureFlagsManager** *(admin-only tab)* — toggles `portal_feature_flags` entries via `PATCH /api/admin/feature-flags/[id]`.
- **MessagesManager** *(admin-only tab)* — rich-text artist inbox manager (`label_messages`) with templates, artist-thread accordions, search/unread filters, starring, realtime updates, and soft-delete bulk actions.
- **AccreditationsManager** *(admin-only tab)* — reviews and updates journalist accreditation requests (`accreditation_requests`).
- **LogsManager** *(admin-only tab)* — three-pane log viewer: Audit Log (all `sync_logs` entries), Error Log (failed/partial sync runs), and App Errors (`app_logs`). Supports full-text search, source/status filter dropdowns, and pagination.
- **RolesManager** *(admin-only tab)* — configures per-role content permissions (`canPublishNews`, `canEditNews`, `canManageArtists`, `canManageReleases`, `canManageVideos`, `canViewAdminPanel`) stored as JSON in `site_settings` under key `role_permissions`. Admin permissions are always full and cannot be restricted.

### SOS (Statement of Sales) — Direct Server Action Upload

- Statement-of-Sales PDFs are uploaded directly via the `uploadStatement` Server Action in `app/portal/statements/_actions/uploadStatement.ts`.
- Authentication is via the caller's Supabase session (admin or editor role required) — no external webhook or shared secret needed.
- The Server Action generates a presigned R2 PUT URL, uploads the PDF, persists a `sales_statements` row, and triggers an artist email notification.
- `createSalesStatement(db, data)` DAL function in `src/lib/api/salesStatements.ts`.
- `generatePresignedUploadUrl(r2Key, contentType, deps)` in `src/lib/portal/presignedUrl.ts` (15-min PUT URL).
- `sales_statements` now carries workflow state (`draft`, `label_approved`, `artist_notified`, `acknowledged`) plus internal label notes and approval timestamps for the admin approval flow.
- `artist_billing_profiles` stores artist invoicing master data and is required before any portal invoice can be created.
- SOS-linked invoices store `statement_id`, `artist_invoice_number`, and optional notes; the portal creates §14 UStG-ready PDFs and marks approved statements as acknowledged after invoice creation.

### File Upload (Next.js Route Handler)

- `app/api/upload/route.ts` — POST Route Handler that:
  1. Verifies `Authorization: Bearer <token>` and requires `admin` or `editor` role
  2. Parses multipart/form-data (native Next.js `FormData` API), including optional `folderId` / `artistId`
  3. Computes a SHA-256 hash and returns the existing asset when the file is already stored
  4. Uploads new files to Cloudflare R2 via `@aws-sdk/client-s3`
  5. Creates the `assets` row server-side and returns `{ duplicate, asset, publicUrl, r2Key, filename, mimeType, sizeBytes }`

### Admin Form Components (`src/components/admin/forms/`)

- `ArtistForm` — auto-slug, featured/isEuNonGerman toggles, and integrated `AssetPicker` controls for image/logo fields
- `ReleaseForm` — cover art, type select, streaming URL fields
- `NewsForm` — title, auto-slug, excerpt, content, image, publish date, status, press-only toggle, and optional artist association dropdown
- `VideoForm` — youtubeId with auto-thumbnail generation

### Multi-API Sync Engine (`src/lib/sync/`)

- **`syncAll.ts`** — Multi-artist, multi-API orchestrator. Runs iTunes, Spotify, Discogs, Songkick, Bandsintown, and Odesli sync for every artist. Accepts `SyncAllDeps` (extends `SyncDeps` with optional `spotify`, `discogsToken`, `songkickApiKey`, `bandsintownApiKey`). Never throws — errors captured per-API in `SyncAllResult`.
- **`spotifyApi.ts`** — Fetches artist albums via Spotify Web API (client credentials flow). Returns `SpotifyRelease[]` with cover art URLs, popularity scores, and UPC barcodes.
- **`discogsApi.ts`** — Fetches physical releases from Discogs API (Personal Access Token). Paginated. Returns catalog numbers and barcodes.
- **`songkickApi.ts`** — Fetches upcoming concerts from Songkick API. Paginated. Returns `SongkickConcert[]` with venue, city, country, date, and ticket URL.
- **`bandsintownApi.ts`** — Fetches upcoming concerts from Bandsintown API v3. Returns `BandsintownConcert[]` with venue, city, country, date, and ticket URL.
- **`odesliApi.ts`** — Resolves any music streaming URL through Odesli (song.link) to return a universal smart link plus per-platform URLs.
- **`deduplication.ts`** — Merges Spotify (digital) and Discogs (physical) release lists using ISRC → barcode/UPC → normalised title + year as matching precedence.

### Centralized Error Handling (`src/lib/errors.ts`)

- **`ApiError`** — Structured HTTP error class with `status`, `message`, and optional `code`.
- **`withErrorHandler(handler)`** — Higher-Order Function that wraps any Next.js Route Handler. Catches `ApiError` (returns its status), `ZodError` (returns 400 with `VALIDATION_ERROR` code), and unknown errors (returns 500). All errors returned as `{ error, code, status }` JSON.

### API Routes

- **`POST /api/sync`** — Triggers full multi-API sync for all artists. Requires `Authorization: Bearer <token>`. Uses `withErrorHandler`.
- **`GET /api/health`** — Returns database connection status (latency ms), per-API last-sync timestamp and status, and rate-limit warnings. Public endpoint.

### Admin Health Dashboard

- **`SystemHealthWidget`** (`src/components/admin/SystemHealthWidget.tsx`) — Grid of status cards (DB online/offline, per-API last sync, rate-limit badges) with a "Force Sync All" button. Auto-refreshes every 60 seconds.
- Added **System Health** tab to `AdminDashboard.tsx`.

### Error Boundaries

- **`app/error.tsx`** — Next.js error boundary for route segments; shows a retry button.
- **`app/global-error.tsx`** — Global error boundary for layout-level failures; includes `<html>` and `<body>`.

### Rate Limiter (`src/lib/rateLimiter.ts`)

- `HttpError` — HTTP error class with a `status` code; used to distinguish retryable (429, 5xx) from non-retryable (4xx) failures.
- `withExponentialBackoff(fn, maxRetries, baseDelayMs)` — Retries `fn` with exponential back-off delays. Non-`HttpError` errors and non-retryable HTTP errors fail immediately.

### Image Optimisation (`src/lib/imageUtils.ts`)

All public-facing images MUST be served through wsrv.nl:

- `getOptimizedImageUrl(url, width)` — Returns a wsrv.nl URL that serves the image at the given width in WebP format.
- `getSquareThumbnail(url, size)` — Returns a wsrv.nl URL for a square cover-crop thumbnail in WebP.
Use these functions wherever `<img>` or Next.js `<Image>` displays an artist photo or release cover art.

### R2 Upload Helper (`src/lib/r2Utils.ts`)

- `createR2Client(accountId, keyId, secret)` — Creates a pre-configured AWS S3 client pointed at Cloudflare R2.
- `uploadUrlToR2(imageUrl, s3, bucket, r2PublicUrl, keyPrefix, fetchFn)` — Downloads a remote image and uploads it to R2, returning the public CDN URL.

### Sync Service Pattern

Complex sync logic lives in `src/lib/sync/` with a dependency-injected `SyncDeps` interface:

```typescript
interface SyncDeps {
  db: SupabaseClient<Database>   // Supabase service-role client
  fetch: typeof fetch             // Injectable fetch for external APIs
  uploadToR2: (imageUrl: string, keyPrefix: string) => Promise<string>
}
```

The HTTP handler in `app/api/sync-artist/route.ts` only wires real deps and calls `syncArtist()`. Tests mock all deps.

### Sync Logs DAL (`src/lib/api/syncLogs.ts`)

- `getSyncLogsByArtist(db, artistId, limit)` — Fetches recent sync history for an artist.
- `insertSyncLog(db, log)` — Records a sync result.

### Manual Sync API (`app/api/sync-artist/route.ts`)

- POST `/api/sync-artist` with body `{ artistId: string }` and `Authorization: Bearer <token>` header.
- Verifies the caller is authenticated, runs the sync pipeline, returns `SyncResult`.

---

## What Still Needs Wiring Up

| Feature | Status | Notes |
| --- | --- | --- |
| iTunes auto-sync on artist create | ✅ Implemented | Manual "Sync Now" per artist in ArtistsManager; POST /api/sync-artist |
| Image caching in R2 | ✅ Implemented | Cover art from iTunes is downloaded & uploaded to R2 via uploadUrlToR2 |
| wsrv.nl image proxy | ✅ Implemented | getOptimizedImageUrl / getSquareThumbnail in src/lib/imageUtils.ts |
| Rate limiter + exponential backoff | ✅ Implemented | withExponentialBackoff in src/lib/rateLimiter.ts |
| Sync history logging | ✅ Implemented | sync_logs table + getSyncLogsByArtist DAL |
| Spotify / Discogs / Songkick / Bandsintown sync | ✅ Implemented | `src/lib/sync/{spotifyApi,discogsApi,songkickApi,bandsintownApi,odesliApi,deduplication,syncAll}.ts`; POST `/api/sync` |
| Visual Effects overlays (noise, scanlines, vignette) | ✅ Implemented | `VisualEffectsOverlay` in `app/layout.tsx`; settings stored in `site_settings` KV table; controlled from Admin "Visual Effects" tab |
| Site settings CMS | ✅ Implemented | `site_settings` table + Admin Settings tab + Next.js ISR cache revalidation |
| Impressum page (§ 5 TMG) | ✅ Implemented | `/impressum` RSC — all mandatory German legal fields from CMS |
| Datenschutzerklärung page | ✅ Implemented | `/datenschutz` RSC — Markdown content editable in CMS |
| GDPR Consent Management | ✅ Implemented | `ConsentBanner` + `ConsentGate` — Spotify/YouTube blocked until opt-in |
| Newsletter subscription | ✅ Implemented | Double Opt-In flow: Server Action → Supabase (pending) → Edge Function (Resend email) → `/api/newsletter/verify` (subscribed) → optional MailerLite sync |
| Generic cache revalidation webhook | ✅ Implemented | `POST /api/revalidate` with `REVALIDATE_SECRET` — for Supabase webhooks |
| Release detail pages | ✅ Implemented | `/releases/[id]` RSC + Framer Motion Shared Layout Animation |
| Artist Portal — auth + routing | ✅ Implemented | `/portal/*` protected by Edge Middleware; `/portal/login` login page |
| Artist Portal — EPK profile editor | ✅ Implemented | `artist_epks` table + RLS + profile form with bio_short/medium/long, theme/layout/orientation/background settings, and photo upload via R2 |
| Artist Portal — streaming analytics | ✅ Implemented | `streaming_stats` table + RLS + StreamingChart (Recharts BarChart + platform summary cards) |
| Artist Portal — royalty statements | ✅ Implemented | `sales_statements` table + RLS + status workflow + StatementsTable + presigned URL Server Action (5 min TTL) |
| Artist Portal — billing profiles | ✅ Implemented | `/portal/billing` + `artist_billing_profiles` + completeness gating for invoice creation |
| Artist Portal — SOS-linked invoices | ✅ Implemented | `/portal/invoices?statement=...` pre-fills approved SOS amounts, stores artist invoice numbers, and generates §14 UStG-ready PDFs |
| Artist Portal — tour dates | ✅ Implemented | `/portal/tour` — artists can list/create/delete own concerts (RLS-protected) |
| Artist Portal — release management + checklist | ✅ Implemented | `/portal/releases` — `release_checklists` table + RLS + expandable release cards with progress bar + PATCH `/api/portal/checklist` + empty-state CTA |
| Artist Portal — release submission | ✅ Implemented | `/portal/releases/new` + `POST /api/portal/submit-release` (`is_visible=false` pending admin approval) + optional cover upload via `POST /api/portal/upload-release-cover` |
| Artist Portal — marketing assets | ✅ Implemented | `/portal/marketing` — assigned asset downloads + artist-owned uploads/deletes via `artist_assets` and `POST/DELETE /api/portal/upload-asset` |
| Artist Portal — label messages | ✅ Implemented | `/portal/messages` — Suspense + rich-text rendering + realtime inbox updates + mark-as-read + rich-text artist replies via `artist_replies` (`sendPortalReply`) |
| Artist Portal — account settings | ✅ Implemented | `/portal/settings` — password update (`supabase.auth.updateUser`) + locale switch (NEXT_LOCALE cookie) |
| Artist Portal — module feature flags | ✅ Implemented | `portal_feature_flags` (`artist.*`) controls nav + page availability |
| Journalist Dashboard — auth + routing | ✅ Implemented | `/press/login` + `/press/dashboard/*` protected in middleware (journalist/admin only) |
| Journalist Dashboard — feature modules | ✅ Implemented | Promo Pool, Press Kit, Press Releases, Accreditation, Download History with `journalist.*` flags |
| Journalist download logging | ✅ Implemented | `journalist_downloads` tracks all secure journalist downloads |
| SOS — Statement of Sales PDF upload | ✅ Implemented | Direct `uploadStatement` Server Action (admin/editor session auth) — no external webhook or shared secret |
| Artist Portal — multi-tenant DB security | ✅ Implemented | `artists.user_id` → `auth.users(id)`; all portal tables use row-level `auth.uid()` policies |
| Artist social/shop links | ✅ Implemented | `facebook_url`, `twitter_url`, `tiktok_url`, `bandcamp_url`, `shop_url` columns in `artists` table; icon buttons in public artist cards + modal + admin form |
| News full page + detail page | ✅ Implemented | `/news` RSC with pagination via `ContentPagination`; `/news/[slug]` RSC detail page with `getNewsPostBySlug` DAL |
| Artist-specific news on profile pages | ✅ Implemented | `news_posts.artist_id` FK; `getPublicNewsPostsByArtistId` DAL (up to 3 latest); rendered in artist detail below discography |
| News artist association (admin) | ✅ Implemented | `NewsForm` artist dropdown + dedicated edit routes `/admin/news/new` and `/admin/news/[id]`; `artist_id` stored in `news_posts` |
| Admin dashboard tab URL persistence | ✅ Implemented | Active tab synced to `?tab=` URL param via `router.replace` — supports direct links and browser back/forward |
| Contact page + API route | ✅ Implemented | `/contact` RSC with SubmitHub link; `POST /api/contact` (Zod, honeypot, Resend delivery); `CONTACT_EMAIL` env var |
| SubmitHub link | ✅ Implemented | Footer → "Submit Your Music" link + Contact page SubmitHub section |
| Shopify/Darkmerch shop link | ✅ Implemented | `shopifyStoreUrl` in `SiteSettings` (`site_settings` KV key `shopify_store_url`); conditional display in Footer |
| YouTube API video sync | ✅ Implemented | `src/lib/api/youtubeApi.ts` + `POST /api/sync-youtube`; requires `YOUTUBE_API_KEY` + `YOUTUBE_CHANNEL_ID`, supports daily Vercel cron and maps videos to artists via `videos.artist_id` title matching |
| ContentPagination component | ✅ Implemented | `src/components/ContentPagination.tsx` — reusable shadcn-based paginator with ellipsis support |
| Artist Portal — Document Vault | ✅ Implemented | `/portal/documents` — artists upload and manage PDF/DOCX contracts, GEMA forms, and splits documents; stored in R2 under `artist-documents/{artistId}/`; `artist_documents` table with RLS; `POST /api/portal/documents/upload` (20 MB max); `DELETE /api/portal/documents/[id]` |
| Artist Portal — Calendar | ✅ Implemented | `/portal/calendar` — tour date / event calendar view for the artist's own concerts |
| Artist Portal — Interviews | ✅ Implemented | `/portal/interviews` — artist-facing interview request management and scheduling |
| Artist Portal — Onboarding Wizard | ✅ Implemented | `/portal/onboarding` — first-run wizard guiding new artists through profile setup, photo upload, and social links |
| Artist Portal — Help / FAQ | ✅ Implemented | `/portal/help` — FAQ and contact form for artist support requests |
| Artist Portal — Video Submission | ✅ Implemented | `/portal/releases/videos/new` — artists submit new video entries for admin review (`is_visible=false`); stored in `videos` table pending admin approval in `/admin/video-submissions` |
| Admin — Accounting tab | ✅ Implemented | `/admin/accounting` — SOS Generator (upload royalty PDFs for any artist via `uploadStatement` Server Action) + Statement History table (`sales_statements`); admin/editor only |
| Admin — System tab | ✅ Implemented | `/admin/system` — Health dashboard, Audit/Error/App-Error logs with filtering, Media Library, and Maintenance panel (clear logs, purge orphaned releases, reset checklists, manage accreditations, clear stats) |
| Admin — Release Submissions | ✅ Implemented | `/admin/release-submissions` — review and approve/reject artist-submitted releases (`is_visible=false` → `is_visible=true`) |
| Admin — Video Submissions | ✅ Implemented | `/admin/video-submissions` — review and approve/reject artist-submitted videos |
| Supabase Read Replica | ✅ Implemented | `src/lib/supabase/replica.ts` — `createReplicaSupabaseClient()` uses `SUPABASE_REPLICA_URL` / `SUPABASE_REPLICA_ANON_KEY`; analytics queries, admin health dashboard, SOS CSV export routed to replica; silent fallback to primary when env vars unset |
| Admin Maintenance API routes | ✅ Implemented | `POST /api/admin/maintenance/clear-logs`, `purge-releases`, `reset-checklists`, `clear-accreditations`, `reset-accreditations`, `clear-stats` — all require admin/editor auth |

---

## File Reference

| File | Purpose |
| --- | --- |
| `README.md` | Project overview, quick start, scripts |
| `DEPLOYMENT.md` | Full deployment guide (Vercel, Supabase, R2) |
| `ADMIN.md` | Admin panel usage documentation |
| `AGENTS.md` | Coding conventions and agent workflow rules |
| `.env.example` | Required environment variables template |
| `vercel.json` | Vercel build/deploy configuration |
| `scripts/vercel-install.sh` | Vercel install hook (npm ci + env var check) |
| `src/lib/supabase/client.ts` | Browser Supabase client (`@supabase/ssr`, cookie-based session) |
| `src/lib/supabase/server.ts` | Server Supabase client (`@supabase/ssr`, reads auth cookies) |
| `src/lib/supabase.ts` | Legacy Supabase client (deprecated; kept for backward compatibility) |
| `src/lib/api/` | Data Access Layer (DAL) for all tables |
| `src/lib/api/assetFolders.ts` | Asset folder DAL for the admin file explorer |
| `src/lib/itunesApi.ts` | iTunes Search API client |
| `src/hooks/use*.ts` | React hooks wrapping DAL + state management |
| `src/hooks/useFileExplorer.ts` | Asset explorer state + authenticated admin mutations |
| `src/hooks/useAuth.ts` | Supabase authentication hook |
| `src/lib/component-contracts.ts` | Shared prop interfaces (SectionProps, AdminPanelProps, etc.) |
| `src/types/database.ts` | TypeScript DB types (must stay in sync with `supabase/reset.sql`) |
| `src/components/admin/forms/` | Admin CRUD form components |
| `src/lib/api/syncLogs.ts` | DAL for sync_logs table (getSyncLogsByArtist, insertSyncLog) |
| `src/lib/api/siteSettings.ts` | DAL for site_settings table (getSiteSettings, upsertSiteSetting, upsertSiteSettings) |
| `src/lib/rateLimiter.ts` | HttpError + withExponentialBackoff for resilient external API calls |
| `src/lib/imageUtils.ts` | wsrv.nl image proxy helpers (getOptimizedImageUrl, getSquareThumbnail) |
| `src/lib/r2Utils.ts` | R2 upload helper (createR2Client, uploadUrlToR2) |
| `src/lib/sync/syncArtist.ts` | Core iTunes artist sync orchestrator (IoC via SyncDeps) |
| `src/lib/sync/syncAll.ts` | Multi-API orchestrator (iTunes + Spotify + Discogs + Songkick + Odesli) |
| `src/lib/sync/spotifyApi.ts` | Spotify Web API integration (albums, popularity, cover art) |
| `src/lib/sync/discogsApi.ts` | Discogs API integration (physical releases, catalog numbers, barcodes) |
| `src/lib/sync/songkickApi.ts` | Songkick API integration (concerts, venues, ticket links) |
| `src/lib/sync/bandsintownApi.ts` | Bandsintown API v3 integration (concerts, venues, ticket links) |
| `src/lib/sync/odesliApi.ts` | Odesli API integration (universal smart links via song.link) |
| `src/lib/sync/deduplication.ts` | ISRC/barcode deduplication utility for merging Spotify + Discogs releases |
| `src/lib/errors.ts` | `ApiError` class + `withErrorHandler` HOF for centralized error handling |
| `app/api/sync/route.ts` | Manual all-artists sync trigger — POST /api/sync |
| `app/api/sync-artist/route.ts` | Manual single-artist sync trigger — POST /api/sync-artist |
| `app/api/health/route.ts` | System health check — GET /api/health |
| `app/error.tsx` | Next.js error boundary (route-segment level) |
| `app/global-error.tsx` | Next.js global error boundary (root layout level) |
| `src/components/admin/SystemHealthWidget.tsx` | Admin health dashboard widget (DB status + per-API cards + Force Sync) |
| `src/components/admin/LogsManager.tsx` | Admin log viewer: Audit Log, Error Log, and App Errors tabs with search, filters, and pagination |
| `src/components/admin/RolesManager.tsx` | Admin role-permissions configurator — per-role toggle matrix stored in `site_settings.role_permissions` |
| `app/api/revalidate-site-settings/route.ts` | Cache revalidation — POST /api/revalidate-site-settings (admin-only) |
| `src/lib/portal/presignedUrl.ts` | Presigned URL generators: download (GET, 5 min) + upload (PUT, 15 min) with injected deps |
| `app/portal/statements/_actions/uploadStatement.ts` | SOS Server Action — authenticate, generate presigned URL, upload PDF to R2, insert sales_statements row |
| `app/api/sync-youtube/route.ts` | YouTube video sync — POST /api/sync-youtube (admin bearer token or Vercel cron; optional `CRON_SECRET` check), upserts `artist_id` by case-insensitive title match against visible artists and writes `is_visible=true` for synced rows |
| `src/lib/api/youtubeApi.ts` | YouTube Data API v3 utility — `fetchYouTubeChannelVideos(channelId, apiKey, maxResults)` |
| `app/news/page.tsx` | Public news list RSC — paginated via ContentPagination |
| `app/news/[slug]/page.tsx` | Public news detail RSC — `getNewsPostBySlug` DAL |
| `app/contact/page.tsx` | Contact page RSC with SubmitHub integration section |
| `app/api/contact/route.ts` | Contact form handler — POST (Zod, honeypot, Resend delivery, `CONTACT_EMAIL`) |
| `src/components/ContentPagination.tsx` | Reusable shadcn-based page navigator with ellipsis support |
| `supabase/reset.sql` | Single idempotent SQL script — full schema source of truth |

---

## Quick Start

```bash
cp .env.example .env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, CLOUDFLARE_R2_* variables

npm ci
npm run dev
# -> http://localhost:3000 (public site)
# -> http://localhost:3000/admin (admin panel)
```

- Press portal expanded with public label/artist EPK views, press release detail pages, journalist onboarding, profile/contact pages, embargo-aware DAL queries, and admin Press Portal tooling.
