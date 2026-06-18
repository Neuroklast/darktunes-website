# Developer & Agent Guidelines (AGENTS.md)

MANDATORY: All developers and AI agents working on this project MUST strictly adhere to the following guidelines. This ensures code quality, security, legal compliance (GDPR), perfect UI/UX, and maintainability.

Clean Code & Architecture (ISO/IEC 25010)
Single Responsibility Principle (SRP): No "God Objects". Files like App.tsx must not contain thousands of lines of code. Split functionality into small, focused, and reusable components.
Separation of Concerns: Keep UI components (React), state management (Hooks/Context), and business logic (API calls/Lib functions) separate.
Code Splitting & Lazy Loading: Use React.lazy() and Suspense for heavy components (e.g., 3D models, admin panels, complex galleries) to keep the initial JavaScript bundle small and performant.
Strict Typing: Avoid the use of any in TypeScript. All variables, function parameters, API responses, and test mocks MUST be strictly typed.
Dry Principle: Do not repeat code. Use reusable hooks and utility functions.

Test Driven Development (TDD): Define conditions through tests before implementing complex logic.
Avoid Anti-Patterns: Absolutely avoid anti-patterns like prop-drilling over more than two levels and massive monolithic files.
YAGNI (You Aren't Gonna Need It): Do not generate speculative code for hypothetical features. Keep the codebase lean.
KISS (Keep It Simple, Stupid): Prefer native HTML/JS solutions over the importation of heavy NPM packages.

Artist Navigation — Architecture Rule
ALL components that display an artist card, tile, or list item MUST navigate to `/artists/[slug]` using Next.js `<Link href={`/artists/${artist.slug}`}>`. Opening a modal instead of navigating to the artist detail page is FORBIDDEN for artist roster components. The dedicated artist page at `app/artists/[slug]/page.tsx` is the single point of truth for artist detail. This rule applies across the homepage, the artists grid page, the footer, and any future section.

Technology Stack & Styling
Core Infrastructure: Next.js 15 (App Router), React 19, Supabase (PostgreSQL & Auth), Cloudflare R2, Vercel deployment. The project was migrated from Vite SPA to Next.js 15 App Router in 2025.
UI & Design: Exclusively use Tailwind CSS v4 (PostCSS) and ensure the CSS output is minified.
Motion & UX: Implement fluid page transitions and shared layout animations with Framer Motion, and utilize Lenis for smooth scrolling. Use Phosphor Icons for all vector graphics.

CI Color System (darkTunes Brand)
The following exact hex values MUST be used. They are mapped to CSS custom properties in src/index.css and must not be replaced with approximations:
  --primary / --accent / --ring: #493687  (violet – primary CTAs, active nav, focus rings)
  --secondary:                   #7e1e37  (pink – secondary buttons, hover effects, promo badges)
  --background:                  #101010  (near-black – global page background, immersive dark mode)
  --card / --muted / --popover:  #292929  (surface – cards, modals, dropdowns, player bar)
  --border / --input:            #383838  (subtle borders, input frames, disabled states)
  --foreground / text:           #ffffff  (primary text – maximum contrast on dark surfaces)

Smooth Scrolling (Lenis)
The LenisProvider (src/components/animations/LenisProvider.tsx) is the single global smooth-scroll implementation.
It is mounted once at the root level in app/_components/Providers.tsx and wraps the entire React tree.
Do NOT add a second LenisProvider instance anywhere else in the tree.
Do NOT use CSS scroll-behavior: smooth as a replacement – Lenis overrides this at the JS layer.
LenisProvider uses ReactLenis from lenis/react (root mode) so any component can call useLenis() to get the Lenis instance for programmatic scrolling.
useLenis is re-exported from src/components/animations/LenisProvider.tsx. Import from there (not directly from lenis/react) for consistency.
For anchor-based scrolling in Header/Footer, use: const lenis = useLenis(); lenis?.scrollTo(href, { offset: -140 })
CRITICAL — overflow containers inside the admin/portal/press layouts: Lenis runs in root mode and intercepts ALL wheel/touch events at the document level. Any element that uses overflow-y-auto or overflow-auto INSIDE a layout that sets overflow-hidden on the root container (like AdminClientLayout) MUST carry the `data-lenis-prevent` HTML attribute. Without it Lenis grabs the event, tries to scroll the (non-scrollable) window, and mouse-wheel scrolling is silently blocked. This attribute is already set on the main content div (app/admin/_components/AdminClientLayout.tsx) and the sidebar nav (src/components/admin/AdminSidebarNav.tsx). Apply the same attribute to any future overflow-y-auto containers added to admin/portal/press layouts.

WCAG 2.1 AA/AAA Accessibility — MANDATORY
COMPLIANCE IS NON-NEGOTIABLE: Every public-facing page and component MUST comply with WCAG 2.1 AA as a hard requirement. Strive for AAA where feasible. Any new UI element introduced without meeting at minimum AA criteria is considered a defect and must be fixed before merging. Violations found in existing code must be remediated immediately.
Skip Navigation: app/layout.tsx includes a sr-only skip link (<a href="#main-content">) as the first focusable element. The <main> element in HomePageContent.tsx carries id="main-content".
Semantic HTML: Content grids (Artists, News, Videos, Releases) use <ul>/<li> with list-none to allow grid styling while preserving list semantics for screen readers. Use <section> with aria-labelledby for major page sections.
Reduced Motion (WCAG 2.3.3 – AAA): Import useReducedMotion from framer-motion in every animated component. When prefersReducedMotion is true, set duration: 0 and skip initial offset transforms.
ARIA on dialogs: All Dialog components must set aria-labelledby pointing to the modal title's id. Close buttons must have a descriptive aria-label (e.g. "Close ${artist.name}"). Icons inside interactive elements must carry aria-hidden="true".
Icon-only links: Any link that renders only an icon MUST have a descriptive aria-label (e.g. aria-label="`${artist.name} on Spotify`").
Touch Targets (WCAG 2.5.5 – AAA): Icon-only interactive elements must include min-w-[44px] min-h-[44px] on the anchor/button element.
Navigation ARIA: Desktop <nav> must have aria-label="Main navigation". Mobile toggle button must have aria-expanded and aria-controls="mobile-menu". Mobile <nav> must have id="mobile-menu" and aria-label="Mobile navigation".
Alt text: Images must have descriptive alt text, e.g. "${artist.name} – artist photo", "${release.title} by ${artistName} – cover art", "${video.title} – video thumbnail".
Decorative elements (e.g. animated scroll-down indicator) must carry aria-hidden="true".
Focus Visible (WCAG 2.4.7 – AA): Every interactive element (buttons, links, inputs) MUST display a visible focus indicator. Use focus-visible:outline or focus-visible:ring-2 ring-accent Tailwind utilities. Never use focus:outline-none without providing an equivalent focus-visible style.
Toggle/Filter Buttons (WCAG 4.1.2 – AA): Stateful buttons that toggle or filter content MUST use aria-pressed="true|false" so screen readers can announce the pressed state. Do NOT use role="tab"/aria-selected for standalone toggle buttons that are not part of a tab panel widget.
Color Contrast (WCAG 1.4.3 – AA): Foreground/background pairs must meet 4.5:1 for normal text and 3:1 for large text (≥18pt regular or ≥14pt bold). The project's `text-muted-foreground` (#a0a0a0 on #101010) provides ~7:1 and is AA-compliant. Do not reduce contrast below these thresholds.
Language (WCAG 3.1.1 – A): The `<html>` element must always carry a `lang` attribute. The current value is resolved dynamically from the locale (app/layout.tsx). Never remove or hard-code it to an empty string.
External Links (WCAG 2.4.4 – AA): External links that open in a new tab must carry rel="noopener noreferrer". If the link text alone is not descriptive, add an aria-label.

Single Source of Truth (SSOT) / Server State Synchronization / Reactivity — MANDATORY
All data displayed in the UI must originate from a single authoritative source — the Supabase database. The following principles are non-negotiable:
SSOT: Each piece of data has exactly one owner. The Supabase `site_settings` table is the sole source for CMS settings (Impressum, Datenschutz, Hero, SEO, etc.). Admin UI components read and write exclusively to the DB via DAL functions; they must never maintain a separate in-memory copy as the primary record.
Server State Synchronization: After any write to the database (upsert, insert, delete), the UI must immediately reflect the updated server state. For Next.js ISR pages (`unstable_cache`), the write path MUST call `/api/revalidate-site-settings` (or the relevant revalidation endpoint) so the ISR cache is purged and the next render shows fresh data. Stale data after a save is a defect.
Reactivity / Data Binding: Client components that display persisted data MUST react to server state changes. Use optimistic updates sparingly and only where latency matters; always reconcile with the server response. Hooks that fetch data (e.g., `useSiteSettings`) must re-fetch after a successful mutation so local state stays in sync with the DB.
Impressum & Datenschutz pages specifically: both pages use `unstable_cache` to fetch `site_settings`. The cache is invalidated by POSTing to `/api/revalidate-site-settings` after each admin save. The cache callback MUST use a cookie-free Supabase client (see the `unstable_cache` rule above) so that it works correctly during on-demand revalidation where no request-scoped cookies are available.

Unit Testing & Quality Assurance
Unit Testing: Write unit tests for all new utilities, API routes, and complex hooks using Vitest.
Test runner: `npm test` (runs `vitest run --config vitest.config.ts`), watch mode: `npm run test:watch`.
Test setup file: src/test/setup.ts – imports @testing-library/jest-dom matchers.
Test files live alongside their source files: src/**/*.{test,spec}.{ts,tsx}.
Test Isolation: Tests must not rely on external network requests. Mock all external APIs (including iTunes, Bandsintown, Odesli, Spotify, and Discogs).
Supabase Mock Pattern: In DAL tests, create a mock builder where all chain methods (select, order, insert, update, delete, upsert, eq, single) return `this` via `vi.fn().mockReturnThis()`. The builder object has `then`, `catch`, `finally` bound to a `Promise.resolve({data, error})`. This makes the entire chain thenable — `await db.from('x').select().order()` resolves correctly.

E2E & Visual Regression Testing (Playwright)
E2E test runner: `npm run test:e2e` (runs `playwright test` using `playwright.config.ts`).
Test files live in `tests/e2e/` — one spec file per concern:

- `visual.spec.ts`      — full-page & section screenshots for visual regression.
- `responsive.spec.ts`  — shrinking header, hamburger menu, grid stacking.
- `interactions.spec.ts`— touch-target sizes (≥ 44×44 px on mobile), video/artist modals, swipe-to-close.
- `edgecases.spec.ts`   — skeleton ↔ card dimension parity (CLS), long-name truncation, slow-network.
Three browser projects: `Desktop Chrome` (1920×1080), `Mobile Safari` (iPhone 13), `Mobile Chrome` (Pixel 5).
CRT/noise/scanline overlays MUST be hidden via CSS injection (`page.addStyleTag`) before any `toHaveScreenshot` call to prevent flaky diffs from animated noise.
The webServer block in `playwright.config.ts` runs `npm run build && npm run preview` automatically; set `SKIP_BUILD=1` to reuse an existing build artifact.
Tests that require Supabase data gracefully skip via `test.skip(true, reason)` when the relevant DOM section is absent (i.e. Supabase is unconfigured).
Never commit `.playwright-snapshots/` baselines — they are regenerated with `playwright test --update-snapshots` on each environment.

Performance Monitoring & Budget Enforcement
Performance tests live in `tests/performance/` and are run by the `Performance Chrome` project in `playwright.config.ts`. Run with `npm run perf:test`.
CI-aware timing budgets: GitHub Actions shared runners are significantly slower than production hardware. All timing-based Playwright assertions MUST use the `budget(production, ci)` helper pattern so that CI uses a generous threshold (default 15 000 ms) while the production target is documented inline. NEVER hardcode a single timing constant for both CI and local runs.
LCP measurement: Always call `page.waitForLoadState('networkidle')` before reading LCP from `PerformanceObserver` with `buffered: true`. Using only `requestAnimationFrame` is insufficient — the LCP entry may not be buffered yet.
Bundle size assertions: Measure `rootMainFiles` from `.next/build-manifest.json` as uncompressed bytes on disk. The `next build` output shows gzipped sizes (~3× smaller). The current shared bundle budget is 450 KB uncompressed (≈ 104 KB gzipped).
Lighthouse CI: Use `node_modules/.bin/lhci collect` followed by `node_modules/.bin/lhci assert` as separate workflow steps. Do NOT use `lhci autorun` — it attempts static-site auto-detection and fails on Next.js server-rendered projects. Config lives in `lighthouserc.js` (ESM, `export default`). Remove or omit the `upload` section unless an LHCI server is configured.
Bundle budget script (`scripts/check-bundle-budget.js`): Measures route-specific JS (excluding shared rootMainFiles) from `app-build-manifest.json`. Route keys use the URL segment path format (e.g. `/page`, `/artists/[slug]/page`). Chunk-name-based size checks (e.g. searching for "framer-motion" in filenames) will ALWAYS return 0 KB because Next.js uses hash-based chunk names — do NOT add such checks. Budget thresholds reflect uncompressed on-disk sizes; update them (with a comment) whenever a deliberate new dependency is added.
Performance scripts summary:

- `npm run analyze` / `npm run perf:analyze` — bundle analyzer (ANALYZE=true next build)
- `npm run perf:lighthouse` — run `lhci collect && lhci assert` locally (requires prior build)
- `npm run perf:test` — Playwright performance suite
- `npm run perf:build` — profiling build (`next build --profile`)

Data Access Layer (DAL)
All database queries live in `src/lib/api/` — one file per table (artists.ts, releases.ts, news.ts, videos.ts, assets.ts, artistAssets.ts, labelMessages.ts, artistReplies.ts, siteSettings.ts, artistProfiles.ts, streamingStats.ts, salesStatements.ts, newsletter.ts, pressPhotos.ts, promoTracks.ts, journalistApplications.ts).
Every DAL function receives `SupabaseClient<Database>` as its first argument. Never import the global `supabase` singleton inside a DAL file.
DAL functions throw `new Error(error.message)` when Supabase returns an error. For `.single()` queries, error code `PGRST116` (not found) returns `null` instead of throwing.
Row-to-domain mappers: Use `rowTo*` functions to convert snake_case DB rows to camelCase domain types. Nullables map to `undefined` (optional fields) or `''` (required string fields) using `?? undefined` / `?? ''`.
Shared mappers: `src/lib/api/artistRowMapper.ts` exports `rowToArtist()` — used by both `artists.ts` and `artistProfiles.ts` to avoid duplication.
Site Settings DAL: `siteSettings.ts` uses `rowsToSettings()` (flat key-value rows → typed `SiteSettings` domain object) with hardcoded defaults as fallback. Use `upsertSiteSettings(db, record)` for batch saves from the Admin CMS. The `feature_toggles` key stores a JSON object (`FeatureToggles`) for global feature flags.
Hook Pattern: Hooks in `src/hooks/` wrap DAL functions. Each hook checks `isSupabaseConfigured` at load time — if false, immediately sets `isLoading = false` and returns empty data. This prevents Supabase calls when env vars are not set.
Next.js Route Handlers: API endpoints live at `app/api/*/route.ts`. The upload handler (`app/api/upload/route.ts`) requires admin or editor role. Never use the legacy `api/` directory for new endpoints.
Server-side Supabase Clients: Use `src/lib/supabase/server.ts` (createServerSupabaseClient) in Server Components and Route Handlers. Use `src/lib/supabase/client.ts` (createBrowserSupabaseClient) in Client Components.
Build stability note: `app/layout.tsx` uses CSS custom-property fallback font stacks (`--font-sans`, `--font-serif`, `--font-mono`) instead of `next/font/google` so CI and offline builds do not depend on external font fetches. Keep root typography deterministic and network-independent.
Server Env Validation: Import `src/lib/env.server.ts` in Route Handlers to get Zod-validated server-side environment variables. This module throws at startup if any required server var is missing.
Next.js Caching: In app/page.tsx, data is fetched using `unstable_cache` with explicit `revalidate: 60` and `tags`. This is required because Next.js 15 no longer caches fetch/GET by default.
CRITICAL — unstable_cache and Dynamic APIs: In Next.js 15, dynamic APIs such as `cookies()`, `headers()`, and `params` CANNOT be called inside `unstable_cache` callbacks. Any call to `createServerSupabaseClient()` (which calls `cookies()`) inside an `unstable_cache` callback will throw at runtime, causing `.catch(() => null)` guards to silently return null and trigger `notFound()` → 404. ALWAYS use a cookie-free client inside `unstable_cache`: `createClient<Database>(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)`. For public read operations (artists, releases, site settings) the anon key + RLS is sufficient; no session cookie is needed.
Public vs Admin DAL: The public homepage (app/page.tsx) uses `getPublicArtists()`, `getPublicReleases()`, and `getPublicConcerts()` which filter by `is_visible = TRUE` and cascade that filter via artist linkage. `getPublicArtists()` is ordered by `featured DESC, name ASC` so the homepage Artists section can guarantee featured artists in the visible six-card shuffle. `getPublicReleases()` must also exclude promo-only content with `is_promo = FALSE` so Promo Pool releases never appear on the public homepage/Hero/carousels. Admin hooks use the unrestricted `getArtists()` / `getReleases()` / `getConcerts()` to see all records including hidden ones.

Detail Page Data API Waterfall
app/releases/[id]/page.tsx — Data API Waterfall:

  1. URL segment `id` → UUID of the release
  2. `getReleaseById(client, id)` → SELECT * FROM releases WHERE id = ? (RLS: anon sees visible releases with visible artists)
  3. `getDictionary(locale)` → resolved from NEXT_LOCALE cookie / Accept-Language header
  Steps 2+3 run in parallel via Promise.all. Cookie-free public client used inside unstable_cache (revalidate: 60, tag: 'releases').

app/artists/[slug]/page.tsx — Data API Waterfall:

  1. URL segment `slug` → artist slug
  2. `getArtistBySlug(client, slug)` → Stage 1 direct slug match; Stage 2 fallback scans rows with NULL/empty slug and matches the mapper-generated slug from artist name (RLS: anon sees visible artists)
  3. `getReleasesByArtistId` + `getConcertsByArtistId` + `getVideosByArtistId` + `getPublicNewsPostsByArtistId` → four parallel queries using the resolved artist.id (news capped at 3 most recent)
  4. `getDictionary(locale)` → locale resolution
  Steps 2+3+4 run concurrently after step 1 resolves. Cookie-free public client used with route-segment `revalidate = 60` (ISR) and `dynamicParams = true`.

Inversion of Control (IoC) & Component Contracts
Props Over State: UI components MUST receive all data and callbacks as props — they must not directly access global state, context, or external stores.
No Direct Context Reads: Components that render UI (sections, cards, widgets) must receive their data via props. Context access is only permitted in top-level wiring components (e.g., App.tsx, AdminPanel.tsx, use-app-state.ts).
Section Contracts: All page sections must extend SectionProps (or EditableSectionProps<T>) from src/lib/component-contracts.ts. The editMode, sectionLabels, and onLabelChange props are mandatory.
Admin Panel Contracts: All admin sub-forms must extend AdminPanelProps<T> from src/lib/component-contracts.ts. No sub-form should import or read AdminSettings directly from storage/context.
Dialog Contracts: All modals must extend DialogProps (with open / onClose). No dialog should manage its own visibility state internally.

Admin Route Auth Pattern
All admin API routes MUST use the shared auth helpers from `src/lib/adminAuth.ts`:

- `extractBearerToken(authHeader)` — extracts the JWT from `Authorization: Bearer <token>`, throws ApiError(401) if missing.
- `verifyAdminOrEditor(token)` — verifies the token and asserts `admin` or `editor` role. Throws ApiError(401) for invalid tokens, ApiError(403) for insufficient role.
- `verifyAdmin(token)` — like `verifyAdminOrEditor` but requires the `admin` role specifically. Use for admin-only mutations (e.g. modifying role permissions).
- `verifyPermission(token, permission)` — verifies the token and checks a specific permission column in the `role_permissions` table. Admin role always passes. Use this instead of `verifyAdminOrEditor` for content-specific routes so granular permissions are enforced end-to-end.

Available `RolePermissionKey` values: `can_publish_news`, `can_edit_news`, `can_manage_artists`, `can_manage_releases`, `can_manage_videos`, `can_view_admin_panel`.

Route → permission mapping:

- fetch-artist-image, prefill-artist*, enrich-artist-discogs → `can_manage_artists`
- resolve-release-smart-link → `can_manage_releases`
- fetch-youtube-info → `can_manage_videos`
- `/api/admin/assets/*`, `/api/admin/media/*` → `can_view_admin_panel`
- `/api/admin/roles/permissions` GET → `verifyAdminOrEditor`, PATCH → `verifyAdmin`

Do NOT duplicate `verifyTokenAndRole` inline in individual route files — use the shared helper.
Every admin route MUST be wrapped with `withErrorHandler` from `src/lib/errors.ts` for uniform error responses.

Domain Layer (src/domain/)
Repository Interfaces: `src/domain/repositories/` contains TypeScript interfaces (IArtistRepository, IReleaseRepository, INewsRepository, IAssetRepository) that define what the application needs from persistent storage without depending on Supabase. Concrete implementations live in `src/lib/api/`. This enforces the Dependency Inversion Principle.
Event Bus: `src/domain/events/eventBus.ts` provides a typed pub/sub Event Bus for decoupled domain event communication. Import the singleton `eventBus` for application-wide use or `createEventBus()` for isolated test buses. DomainEvent union includes: artist.synced, release.synced, asset.uploaded, asset.deleted, user.role.changed, sync.completed. Use `eventBus.on(type, handler)` to subscribe and `eventBus.emit(event)` to publish. Async handler errors are caught and logged — they never propagate to the emitter.

Web Workers (src/workers/)
CPU-intensive image operations (resize, format conversion) MUST use `src/workers/imageProcessor.worker.ts` via `createImageProcessorWorker()` from `src/workers/index.ts` so the main thread stays responsive.
Worker instances are lazily created per component/operation and MUST be terminated (`processor.terminate()`) when done. Create in component mount effect, terminate in cleanup.
ImageBitmap objects are transferred (not copied) to the worker via the Transferable API — do not reuse a bitmap after calling `resize()` or `toBlob()`.

Server-side external API calls MUST use `withExponentialBackoff()` from `src/lib/rateLimiter.ts`.
Throw `HttpError(status, message)` for HTTP errors to distinguish retryable (429, 5xx) from non-retryable failures.
Non-HTTP errors (e.g. network errors) are not retried — they fail immediately.

Image Optimisation
All public-facing images MUST be served via `getOptimizedImageUrl(url, width)` or `getSquareThumbnail(url, size)` from `src/lib/imageUtils.ts`.
These functions proxy through wsrv.nl and output WebP format, preventing origin load.
Use `getOptimizedImageUrl` for rectangular/banner images and `getSquareThumbnail` for cover art / profile photos.

Next.js `<Image>` Component – ALWAYS use `<Image />` from `next/image` instead of bare `<img>` tags. Raw `<img>` causes the `@next/next/no-img-element` lint error and degrades LCP.

- Images already proxied through wsrv.nl: add `unoptimized` so Next.js does not double-process them.
- Images in position:relative containers: use `fill` prop (e.g. carousels, hero, thumbnails).
- Logos and images with known natural dimensions: use `width` / `height` props + `style={{ width: 'auto' }}` CSS override to preserve aspect ratio.
- Unknown dimensions at render time (e.g. markdown content): use `width={0} height={0} sizes="100vw" className="max-w-full h-auto" unoptimized`.
- Priority images above the fold: add `priority` prop (equivalent to `fetchPriority="high" loading="eager"`).
- Naming conflict with icon libraries (e.g. `@phosphor-icons/react` exports `Image`): import the icon as `ImageIcon` to avoid a clash with `import Image from 'next/image'`.

Sync Service Pattern
Complex sync logic lives in `src/lib/sync/` with a dependency-injected `SyncDeps` interface (db, fetch, uploadToR2).
The HTTP handler in `app/api/sync-artist/route.ts` only wires deps and calls `syncArtist()`. Tests mock all deps.
Sync functions MUST NOT throw — capture all errors in `SyncResult.errors` and return gracefully.
Every sync run writes a `sync_logs` entry with status 'success', 'partial', or 'error'.
`sync_logs` also records `api_source` (itunes | spotify | discogs | songkick | bandsintown | odesli | all) and `rate_limited` (boolean) per run.
The full multi-API orchestrator lives in `src/lib/sync/syncAll.ts` (SyncAllDeps extends SyncDeps with optional spotify/discogsToken/songkickApiKey/bandsintownApiKey). Called by `POST /api/sync`.
Release deduplication: `src/lib/sync/deduplication.ts` merges Spotify + Discogs releases using ISRC → barcode/UPC → normalised title + year precedence.
`syncAllReleases()` in `useReleases.ts` returns the full `SyncAllResult` (typed import from `src/lib/sync/syncAll.ts`). `ReleasesManager` parses the result: on success shows a toast with total items synced; on errors shows a warning toast and a "View Errors" button that opens a dialog with per-API error details.

Cron Jobs (Vercel):
  Three cron jobs are configured in `vercel.json`:

- `/api/sync-youtube` — daily at 06:00 UTC: fetches latest YouTube channel videos.
- `/api/sync` — daily at 03:00 UTC: enqueues async sync jobs for all artists into `sync_queue` and returns immediately.
- `/api/process-sync-queue` — every 5 minutes: picks one pending job from `sync_queue`, syncs that artist (iTunes), marks it done/failed. maxDuration: 60s.
  All routes accept either a ****** (manual trigger) or a Vercel cron call (`x-vercel-cron: 1` header) optionally guarded by `CRON_SECRET` env var.
  The `isValidCronSecret` helper uses `timingSafeEqual` to prevent timing attacks.

Async Sync Queue (`sync_queue` table):
  `POST /api/sync` enqueues one row per artist with `status='pending'` — it does NOT run the sync inline.
  `POST /api/process-sync-queue` claims one job at a time (atomic UPDATE to `status='running'`) to prevent double-processing.
  Failed jobs are retried up to 3 times (`attempt_count`) with exponential backoff managed in `markSyncJobFailed()`.
  DAL: `src/lib/api/syncQueue.ts` exports `enqueueArtistSyncJobs`, `claimNextSyncJob`, `markSyncJobDone`, `markSyncJobFailed`, `getSyncQueueStats`, `getRecentSyncJobs`.
  The Admin Health tab shows queue progress via `getSyncQueueStats()`.

Idempotency Keys (`idempotency_keys` table):
  Financial and submission endpoints accept an optional `idempotencyKey` (UUID) in the request body.
  DAL: `src/lib/api/idempotency.ts` exports `checkAndClaimIdempotencyKey(db, key, resourceType)` (atomic INSERT ... ON CONFLICT DO NOTHING) and `updateIdempotencyKeyResourceId(db, key, id)`.
  Applied to: `/api/portal/submit-release`.
  Keys older than 24h are cleaned up on each check. Only service-role client can access this table (no public RLS).

Spotify Sync Notes:
  `fetchSpotifyArtistReleases` builds the URL as a manual template literal to avoid `URLSearchParams` encoding commas in `include_groups` as `%2C`, which Spotify rejects with HTTP 400.
  `deriveFormat` in `discogsApi.ts` accepts `string | undefined | null` and returns `'other'` for missing format fields (prevents TypeError on undefined Discogs releases).

Odesli Sync Notes:
  The Odesli batch in `syncAll.ts` tracks `artistsProcessed` (counts release attempts) and captures API errors per-release into `odesliResult.errors`. Rate-limit errors (HTTP 429) set `rateLimited = true`. 404/no-match responses are silently skipped (expected for unlisted tracks).

Admin Utility Routes (admin/editor auth required):
  `POST /api/admin/cleanup-orphaned-releases` — deletes all releases where `artist_id IS NULL` (uses service-role client). Returns `{ deleted: number }`. Triggered by the "Clean Orphaned" button in ReleasesManager.
  `POST /api/admin/fetch-youtube-info` — resolves a YouTube URL or video ID to `{ videoId, title, channelTitle, thumbnailUrl }` via YouTube oEmbed (no API key needed). Called by the "Fetch Info" button in VideoForm.
  `DELETE /api/admin/assets/[id]` — permanently deletes an asset record from Supabase AND its corresponding object from Cloudflare R2 via `deleteObjectFromR2()` from `src/lib/r2Utils.ts`. The R2 object is deleted first; if that fails the DB record remains. Returns `{ success: true }`.

Admin Asset Explorer
The admin Assets tab is a folder-based file explorer backed by the `asset_folders` table and the enriched `assets` schema (`folder_id`, `artist_id`, `tags`, `sha256_hash`, `original_filename`).
`app/api/upload/route.ts` is the single admin upload entry point: it verifies admin/editor auth, computes a SHA-256 hash, returns the existing asset on duplicate upload, uploads new files to R2, and inserts the asset row server-side.
Folder/list/search/batch mutations live under `app/api/admin/assets/*`; destructive deletes must remove the R2 object(s) before deleting database rows.
`src/hooks/useFileExplorer.ts` is the client-side orchestration hook for the explorer, and `src/components/admin/file-explorer/AssetPicker.tsx` is the reusable selector used by `ArtistForm` for image/logo assignment.

Video Admin UX:
  VideoForm accepts full YouTube URLs (watch?v=, youtu.be/, /shorts/, /embed/) and auto-extracts the 11-char video ID on input.
  "Fetch Info" button calls `/api/admin/fetch-youtube-info` to auto-fill title, channel name, and thumbnail.
  VideosManager has a "Sync YouTube Channel" button that calls `POST /api/sync-youtube` and shows synced count in toast.

Artist Import (Spotify + Apple Music):
  ArtistForm has a single Spotify URL field (no duplicated quick-import field) with an "Import" button that pre-fills name, image, genres, spotifyId, and spotifyUrl via `POST /api/admin/prefill-artist`.
  ArtistForm also has an Apple Music URL field with an "Import" button that pre-fills name, image, genres, and appleMusicUrl via `POST /api/admin/prefill-artist-itunes`.

Cascade Deletes:
  `releases.artist_id` uses `ON DELETE CASCADE`. When an artist is deleted, all their releases are automatically deleted by the DB.
  The delete confirmation dialog in ArtistsManager explicitly states this to the user.

Discogs Artist Enrichment (manual):
  `src/lib/sync/discogsApi.ts` exports two functions:
    - `fetchDiscogsArtistReleases(id, token, fetch)` — paginated release list (used by syncAll).
    - `fetchDiscogsArtistProfile(id, token, fetch)` — fetches artist bio, primary image, and URLs from `GET /artists/{id}`. Token is optional (higher rate limit when provided).
  `cleanDiscogsMarkup(text)` strips Discogs wiki markup ([a=Name], [l=Label], `[url=…][/url]`, etc.) and is exported for standalone use and testing.
  Admin route `POST /api/admin/enrich-artist-discogs` (body: `{ discogsId }`) verifies admin/editor role, calls `fetchDiscogsArtistProfile`, and returns `{ name, bio, imageUrl, urls }`. It does NOT write to the DB — the admin UI applies the data via the normal artist update flow.
  The "Enrich from Discogs" button in `ArtistForm` only fills empty fields (bio, imageUrl) — it never overwrites data the admin has already entered.

Odesli (song.link) Smart Links:
  `src/lib/sync/odesliApi.ts` exports `resolveOdesliSmartLink(musicUrl, fetch)` which resolves any streaming URL to a universal smart link page.
  During the full `syncAll` run, Odesli is called for every newly synced release to populate `releases.smart_url`.
  Admin route `POST /api/admin/resolve-release-smart-link` (body: `{ releaseId }`) lets editors manually resolve the Odesli link for a single release and persists it to `releases.smart_url`.
  The "Resolve Smart Link" (link icon) button in ReleasesManager triggers this route. The button is disabled when the release has no Spotify or Apple Music URL.
  On the public release detail page (`app/releases/[id]`), a "Listen Everywhere" button links to `release.smartUrl` when populated (shown first, above platform-specific links).

Centralized Error Handling
All Next.js Route Handlers MUST be wrapped with `withErrorHandler` from `src/lib/errors.ts`.
`withErrorHandler` catches `ApiError` (returns its status code), `ZodError` (returns 400 with VALIDATION_ERROR code), and unknown errors (returns 500). All responses follow `{ error, code, status }` shape.
Throw `new ApiError(status, message, code?)` inside route handlers instead of manually returning `NextResponse.json({ error })`.
`app/error.tsx` and `app/global-error.tsx` are the Next.js rendering error boundaries.

R2 Image Caching
When syncing external content, always download cover/artwork images and upload to Cloudflare R2 via `uploadUrlToR2()` from `src/lib/r2Utils.ts`.
`src/lib/r2Utils.ts` also exports `createR2Client()` and `deleteObjectFromR2(r2Key, s3, bucket)` — use `deleteObjectFromR2` whenever a DB record that carries an `r2_key` is deleted, to keep R2 storage in sync.
Store the R2 public URL (not the external URL) in the database. The public website reads only from Supabase + R2.
If R2 upload fails during sync, fall back to the external URL and log the error — do not abort the sync.

Internationalisation (i18n)
The site supports English (`en`) and German (`de`). German is the default locale.
Dictionary files live in `src/i18n/dictionaries/en.json` and `src/i18n/dictionaries/de.json`.
The shared type `Dictionary` in `src/i18n/types.ts` is structurally derived from the English baseline — add new keys there first.
Locale resolution order: 1) `NEXT_LOCALE` cookie, 2) `Accept-Language` request header, 3) `de` default.
Server-side loading: call `getLocale()` then `getDictionary(locale)` from `src/i18n/getDictionary.ts` inside Server Components. Never call these from Client Components.
Prop injection (IoC): RSC parents fetch the dictionary and pass relevant sub-objects (e.g. `dict.navigation`, `dict.consent`) to Client Components as props. Client Components MUST NOT import or call dictionary functions themselves.
Locale switching: the Header writes `document.cookie = 'NEXT_LOCALE=...'` on the client and calls `router.refresh()` to trigger a server re-render with the new locale.
When adding new user-facing strings: add the English key to `en.json`, add the German translation to `de.json`, update the `getDictionary` return type (auto-inferred), then thread the new key through the RSC → Client Component prop chain.

Agent Workflow Requirements
These rules apply specifically to AI agent runs on this project:
Update AGENTS.md: AGENTS.md is the living specification of this project and serves as a dedicated, predictable place for context. If new conventions, patterns, or architectural decisions were introduced, add or update the relevant section in this file after every run.
Iterative CI Self-Healing — MANDATORY: After every code change, the agent MUST run
the full local check suite and iterate until ALL commands exit with code 0.
Never open a pull request while any check is still failing.

Check sequence (run ALL in order after every fix, then restart from step 1):

  1. `npm run lint`       — ESLint: read ALL errors before fixing any. Fix all, then re-run.
  2. `npx tsc --noEmit`  — TypeScript strict check: fix all type errors. No `any` shortcuts.
  3. `npm test`           — Vitest: all unit tests must pass green.
  4. `npm run build`      — Next.js production build: fix all build errors.

Iteration rules:

- After EVERY individual fix, re-run the FULL sequence from step 1 — never just the one
    step that previously failed.
- Read ALL errors output by a command in one pass, then fix ALL of them before re-running.
    Do not fix one error, re-run, fix the next — batch the fixes per command.
- A PR MUST NOT be opened until all four commands exit with code 0 in a single clean run.
- If fixing one check introduces a regression in a previously passing check, resolve the
    regression before continuing.
- Suppression shortcuts (`as any`, `@ts-ignore`, `// eslint-disable`) added purely to
    silence a failing check are FORBIDDEN — always fix the root cause.
Review & Update All Docs and Scripts: At the END of EVERY agent session, review each of the following files for accuracy and update any section that is stale or inconsistent with the actual codebase:
- README.md (quick start, scripts table, env-var table, project structure)
- DEPLOYMENT.md (env-var names must match .env.example and scripts/vercel-install.sh exactly)
- INTEGRATION-SUMMARY.md (reflect the current implemented vs. pending state)
- ADMIN.md (admin panel features and setup steps)
- SECURITY.md (security practices relevant to the actual code)
- scripts/vercel-install.sh (env-var list must match .env.example)
- .env.example (must list every variable the app actually reads)
This review is MANDATORY, not optional, even when no documentation changes were part of the original task.
Update Documentation: If new public APIs, components, or utilities were added, update the relevant docs in the docs/ directory or inline JSDoc comments.
Minimal Changes Principle: Make the smallest possible change that fully addresses the requirement. Do not refactor unrelated code in the same PR. Do not add new dependencies unless absolutely necessary — check npm audit for any new package.
Tested Modules (unit test files exist): `spotifyEmbedPath`, `utils/cn`, `syncLogs`, `youtubeApi`, `artistRowMapper`, `featureFlags`, `accreditations`, `labelMessages`, `artistReplies`, `journalistDownloads`, `r2Utils`, `platformUrlParser`, `slugify`, `ipRateLimit`.

Database Schema Management
⛔ MIGRATION SCRIPTS ARE STRICTLY AND ABSOLUTELY FORBIDDEN. Never create files in `supabase/migrations/` or any incremental SQL patch files. Every agent or developer who creates a migration script violates this rule and must immediately delete it and move the change into `supabase/reset.sql`.
`supabase/reset.sql` and `src/types/database.ts` are the ONE AND ONLY source of truth for the database structure. They MUST always be in sync. There is only ONE schema script — the idempotent reset script.
Full schema requirements (3NF, naming conventions, RLS rules, idempotency patterns, audit rules) are documented in `supabase/DB_REQUIREMENTS.md`. Read it before making any schema changes.

MANDATORY RULE — Schema Change Checklist:
Every PR that adds, removes, or renames a column / table / enum MUST include ALL of the following:

  1. Updated `supabase/reset.sql` — add the column/table to the CREATE TABLE definition AND add an idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` guard so existing databases are updated safely.
  2. Updated `src/types/database.ts` to reflect the new schema (Row, Insert, Update shapes).
  3. If applicable: updated application hooks (src/hooks/use*.ts) that query the affected table.
  4. Verified compliance with `supabase/DB_REQUIREMENTS.md` (3NF, no transitive dependencies, RLS enabled).

Apply the schema to Supabase cloud: paste `supabase/reset.sql` into the Supabase SQL Editor and run it (fully idempotent — safe on fresh and existing databases).
Visibility & Cascading Deletes: `artists.is_visible` and `releases.is_visible` (both BOOLEAN DEFAULT TRUE) control public visibility. `releases.artist_id` uses `ON DELETE CASCADE` so deleting an artist removes all their releases automatically. RLS policies enforce visibility at the DB level for the public role; the DAL public functions (`getPublicArtists`, `getPublicReleases`, `getPublicConcerts`) enforce it additionally at the application layer.
Video ownership: `videos.artist_id UUID REFERENCES artists(id) ON DELETE SET NULL` links synced label-channel videos to artists. Artist profile pages fetch videos via `getVideosByArtistId()`; when no match exists, `artist_id` remains NULL and the homepage still shows latest videos globally.

Artist Portal (Multi-Tenant)
The Artist Portal lives at `/portal/*` — a secure dashboard for the label's bands.
Auth: `middleware.ts` protects all `/portal/*` routes (except `/portal/login`) using the same Supabase session-cookie pattern as `/admin/*`.
Multi-tenancy: `artists.user_id UUID REFERENCES auth.users(id)` links each artist row to a Supabase Auth user. One auth user ↔ one artist.
Portal DAL functions: `getArtistByUserId(db, userId)` in `src/lib/api/artistProfiles.ts` resolves the current user's linked artist. Always call this before accessing artist-scoped data.
RLS enforcement: `artist_profiles`, `streaming_stats`, `sales_statements`, `release_checklists`, `artist_replies`, and `artist_assets` all have artist-scoped RLS policies using `auth.uid()` + artist linkage. Security is at the DB layer; no middleware-only filtering.
Presigned URL pattern: `src/lib/portal/presignedUrl.ts` exposes two injectable functions:

- `generatePresignedDownloadUrl(r2Key, deps)` — 5-minute GET URL for artist downloads (`PresignedUrlDeps`)
- `generatePresignedUploadUrl(r2Key, contentType, deps)` — 15-minute PUT URL for the SOS PDF generator to upload directly to R2, bypassing Vercel's 4.5 MB body limit (`PresignedUploadUrlDeps`)
  The Server Action `app/portal/statements/_actions/presignedUrl.ts` wires real deps for artist-facing downloads.
Photo upload: `app/api/portal/upload-photo/route.ts` accepts `multipart/form-data`, verifies auth, confirms artist ownership, then uploads to `profile-photos/{artistId}/{uuid}.{ext}` in R2. Max 5 MB, image types only.
Release submission: `POST /api/portal/submit-release` creates a new release with `is_visible = FALSE` (pending admin approval). Optional cover uploads use `POST /api/portal/upload-release-cover` (max 5 MB images) into `release-covers/{artistId}/`. After a successful insert, the route fires a fire-and-forget call to `sendSubmissionNotificationEmail()` (see Submission Notifications below) and creates `editor_notifications` rows for all admins and editors so the bell icon in the admin sidebar highlights the new submission.
Artist-owned marketing uploads: `POST /api/portal/upload-asset` stores files in `artist-assets/{artistId}/` and inserts into `artist_assets`; `DELETE /api/portal/upload-asset` deletes own rows. Allowed MIME types: JPEG, PNG, WebP, PDF, ZIP (max 20 MB).
Label replies: `artist_replies` stores artist-side responses to inbox messages. The portal uses `sendPortalReply` Server Action + `src/lib/api/artistReplies.ts`.
Messaging upgrade: `label_messages` supports `body_html`, `read_at`, `starred`, `deleted_at`, and a generated `search_vector`; `artist_replies` supports `body_html` + `deleted_at`; admin-only `message_templates` stores reusable rich-text subjects/bodies. Admin messaging UI is split into `src/components/messaging/*` (RichTextEditor, MessageComposer, MessageSearch, MessageActions, ThreadView), and all rendered message HTML must be sanitized with DOMPurify in client components.
Admin asset visibility: `AssetsManager` (admin Assets tab) shows both the general `assets` table and a second "Artist Assets" section that lists all `artist_assets` rows (joined with `artists.name` for identification). Admins can copy URLs; artists manage their own rows via the portal.
IoC in portal: Every portal page is a Server Component that fetches data and passes it as props to a `"use client"` leaf component. Leaf components never call `fetch` or Supabase directly.
Release checklists: `src/lib/api/releaseChecklists.ts` provides `getOrCreateReleaseChecklist(db, artistId, releaseId)` (seeds DEFAULT_RELEASE_TASKS on first call) and `toggleChecklistItem(db, id, isCompleted)`. The PATCH `/api/portal/checklist` route handler uses Bearer token auth and relies on RLS for artist-scoped enforcement.
Bio lengths: `artist_profiles` has three bio columns — `bio_short` (≤100 words), `bio_medium` (≤300 words), `bio_long` (≤1000 words) — in addition to the general `bio` field. The profile form exposes all four.
Portal nav items are now feature-flag aware (`portal_feature_flags`): Overview, Profile, Analytics, Releases (`/portal/releases`), Tour (`/portal/tour`), Calendar (`/portal/calendar`), Marketing (`/portal/marketing`), Documents (`/portal/documents`), Interviews (`/portal/interviews`), Statements, Messages (`/portal/messages`), Help (`/portal/help`). Settings (`/portal/settings`) is always visible (not flag-gated). Onboarding (`/portal/onboarding`) is shown only for new artists who have not completed the first-run wizard.
Billing master data lives in `artist_billing_profiles` and is edited at `/portal/billing`. Portal invoice creation MUST call `isBillingProfileComplete()` before generating PDFs. SOS-linked invoices pass through `/portal/invoices?statement={id}`, store the artist’s own bookkeeping number in `artist_invoice_number`, and set `sales_statements.status = 'acknowledged'` after successful creation.

Portal Analytics page (`app/portal/analytics/page.tsx`) has two tabs:

- **Streaming** tab: monthly stream counts from `streaming_stats`, rendered by `StreamingChart` / `StreamingChartInner` using Recharts.
- **Einnahmen** (Earnings) tab: royalty earnings from `sales_statements`, rendered by `EarningsChart` / `EarningsChartInner`. Shows KPI cards (total earned, last payout, pending count) and a bar chart of `amount_eur` per `period`. The default tab can be pre-selected via the `?tab=earnings` query param.
  Both charts are loaded lazily via `next/dynamic` (`ssr: false`) to exclude Recharts from the initial bundle.
  Data fetch follows IoC: the Server Component fetches both `getStreamingStatsByArtistId` and `getSalesStatementsByArtistId` in parallel (`Promise.all`) and passes results as props to the leaf client components.

Document Vault (Artist Portal)
`/portal/documents` — artists upload and manage PDF/DOCX contracts, GEMA registration forms, and royalty splits documents.
Table: `artist_documents` — columns: `id`, `artist_id`, `filename`, `original_filename`, `r2_key`, `file_size`, `mime_type`, `created_at`. RLS: artists can only read/insert/delete their own rows.
Upload: `POST /api/portal/documents/upload` — accepts `multipart/form-data`, verifies auth, confirms artist ownership, uploads to `artist-documents/{artistId}/{uuid}_{filename}` in R2, inserts `artist_documents` row. Max 20 MB. Allowed MIME types: `application/pdf`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`.
Delete: `DELETE /api/portal/documents/[id]` — verifies auth and artist ownership (via RLS), deletes R2 object first, then deletes DB row.
Download: documents are served as short-lived presigned R2 GET URLs generated in a Server Action — the raw R2 key is never sent to the browser.
Client component: `app/portal/documents/_components/DocumentVault.tsx`. The `artistId` prop is received for type safety but the upload API derives the artist from the session cookie — the prop is intentionally not forwarded to the API (rename to `_artistId` in destructuring if ESLint flags it).

Video Submission Portal
`/portal/releases/videos/new` — artists submit new video entries for admin review.
Submission creates a `videos` row with `is_visible = FALSE` (pending admin approval). The route fires `sendSubmissionNotificationEmail()` and creates `editor_notifications` rows for all admins and editors.
Admin review: `app/admin/video-submissions/page.tsx` renders `VideoSubmissionsManager` — lists all `is_visible=false` video rows, lets admins approve (set `is_visible=true`) or reject (delete) each submission.
API: `POST /api/portal/submit-video` (artist auth, creates pending video row); `PATCH /api/admin/video-submissions/[id]` (admin/editor auth, approve or reject).

Admin Accounting Tab
`/admin/accounting` — admin-only route with two tabs:

- **SOS Generator**: Upload royalty statement PDFs for any artist directly from the admin panel. Runs the `uploadStatement` Server Action (same action as the portal flow). Requires admin/editor session.
- **Statement History**: Read-only table of all `sales_statements` rows (same data as `StatementsManager` in the admin dashboard), sorted newest-first. Shows artist name, period, amount (EUR), filename, and status.

Admin System Tab (Health, Logs, Maintenance)
`/admin/system` — admin-only route with multiple sub-sections:

- **Health dashboard**: sync queue stats, DB connectivity, Vercel cron status.
- **Audit Log**: all `sync_logs` entries with full-text search, `api_source` filter, and `status` filter.
- **Error Log**: failed and partial sync runs (`sync_logs.status IN ('error','partial')`).
- **App Errors**: `app_logs` entries with `level = 'error'` or `level = 'warn'`.
- **Media Library**: R2 media file browser (`/api/admin/media` routes), separate from the Assets asset manager.
- **Maintenance panel** (`MaintenanceManager.tsx`): destructive one-shot admin operations:
  - `POST /api/admin/maintenance/clear-logs` — truncates `sync_logs` older than N days.
  - `POST /api/admin/maintenance/purge-releases` — deletes orphaned releases (`artist_id IS NULL`).
  - `POST /api/admin/maintenance/reset-checklists` — deletes all `release_checklists` rows for a given artist.
  - `POST /api/admin/maintenance/clear-accreditations` — deletes pending `accreditation_requests` older than N days.
  - `POST /api/admin/maintenance/reset-accreditations` — resets a journalist's accreditation status.
  - `POST /api/admin/maintenance/clear-stats` — deletes `streaming_stats` rows for a given artist + period.
  All maintenance routes require admin/editor auth via `verifyAdminOrEditor`. All are wrapped with `withErrorHandler`.

Supabase Read Replica Client
`src/lib/supabase/replica.ts` exports `createReplicaSupabaseClient()`.
When `SUPABASE_REPLICA_URL` and `SUPABASE_REPLICA_ANON_KEY` are set (Supabase Pro plan, configure via Dashboard → Database → Replicas), this client is used for read-heavy queries: portal analytics charts, admin health dashboard, admin logs, SOS CSV exports. Falls back silently to the primary DB via `createBrowserSupabaseClient()` / `createServerSupabaseClient()` when env vars are unset — safe for all environments.
Never use the replica client for write operations (INSERT/UPDATE/DELETE) — it is read-only. Never use it inside `unstable_cache` callbacks (use the cookie-free anon client there instead).

SOS (Statement of Sales) — Direct Server Action Upload
Statement-of-Sales PDFs are uploaded directly via the `uploadStatement` Server Action in `app/portal/statements/_actions/uploadStatement.ts`. Authentication is via the caller’s Supabase session (admin or editor role required) — no external webhook or shared secret is needed.
The Server Action: (1) verifies admin/editor role via `createServerSupabaseClient` + `getUserRoleWithClient`, (2) generates an R2 key (`statements/{artistId}/{uuid}_{filename}`), (3) generates a 15-minute presigned R2 PUT URL via `generatePresignedUploadUrl`, (4) uploads the PDF blob (received as Base64) directly to R2, (5) calls `createSalesStatement()` with the service-role client to bypass RLS, (6) calls `sendStatementNotification()` non-blocking.
DAL: `createSalesStatement(db, data)` in `src/lib/api/salesStatements.ts` inserts the record. MUST be called with a service-role client to bypass RLS.
PDF encoding: The client hook (`useSosExports`) converts the PDF Blob to Base64 via `blobToBase64()` (uses `blob.arrayBuffer()` + `btoa`) before calling the Server Action — Server Actions do not support raw Blob transfer.
Validation helpers: `isValidArtistId` and `isValidPeriod` live in `src/lib/sos/validation.ts`.
Email notification: After a successful `sales_statements` insert, the Server Action calls `sendStatementNotification()` from `src/lib/email/sendStatementNotification.ts`. Failure is logged but does NOT block the response (graceful degradation). Skipped silently when `RESEND_API_KEY` is not set.
Admin statements overview: `StatementsManager` component (`src/components/admin/StatementsManager.tsx`) provides a read-only table in the Admin dashboard (Statements tab, admin-only) showing all `sales_statements` rows joined with `artists.name`. Columns: Artist Name, Period, Amount (EUR), Filename (monospace), Created At. Sorted newest first.

Submission Notifications (artist portal → admin)
When an artist submits a release or video, two notification paths are triggered in parallel:

1. In-app bell: `editor_notifications` rows are inserted for every user with role `admin` or `editor` (query uses `.in('role', ['admin', 'editor'])`). The `EditorNotificationBell` component in `AdminSidebarNav` highlights unread notifications — it is shown in both the desktop sidebar brand header and the mobile header.
2. Email: `sendSubmissionNotificationEmail()` in `src/lib/email/sendSubmissionNotificationEmail.ts` sends an HTML notification via Resend to `LABEL_NOTIFICATION_EMAIL`. Follows the same non-throwing, fire-and-forget pattern as `sendStatementNotification.ts` — failure is logged but never blocks the portal response. Silently skipped when `RESEND_API_KEY` or `LABEL_NOTIFICATION_EMAIL` are unset.
The `sendSubmissionNotificationEmail` function is dependency-injected (`SendSubmissionEmailDeps`) to remain fully testable without network calls. 7 unit tests in `src/lib/email/sendSubmissionNotificationEmail.test.ts`.

Admin Live Shows (EventManager in admin context)
`EventManager` (`app/portal/events/_components/EventManager.tsx`) accepts two optional props:

- `concertsApiPath?: string` (default: `/api/portal/concerts`) — the API base URL for CRUD operations. Set to `/api/admin/concerts` in the admin context.
- `hideIcsExport?: boolean` (default: `false`) — hides the ICS export button (portal-specific, not applicable in admin).
`AdminConcertsManager` (`src/components/admin/AdminConcertsManager.tsx`) wraps `EventManager` with an artist-selector dropdown so admins can manage concerts for any artist. It is rendered under the **Events** tab of `AdminDashboard` (Calendar icon, visible to both admins and editors).
Admin concerts API (`app/api/admin/concerts/route.ts`) uses `verifyAdminOrEditor` + `extractBearerToken`. POST requires `artistId` in the request body (unlike the portal route which resolves the artist from the session cookie). The concerts table RLS already allows admins and editors to insert/update/delete any row — no schema changes were needed.

Vercel Deployment
Install script: scripts/vercel-install.sh runs npm ci and validates all required environment variables.
Required env vars are split into two groups:

- Client-side (must have NEXT_PUBLIC_ prefix to be exposed to the browser):
      NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
- Server-side (never exposed to the browser; used only in Vercel Route Handlers / Edge Functions):
      SUPABASE_SERVICE_ROLE_KEY,
      CLOUDFLARE_R2_ACCOUNT_ID, CLOUDFLARE_R2_ACCESS_KEY_ID,
      CLOUDFLARE_R2_SECRET_ACCESS_KEY, CLOUDFLARE_R2_BUCKET_NAME,
      CLOUDFLARE_R2_PUBLIC_URL
- Optional (external API sync — required for Spotify / Discogs / Songkick artist sync):
      SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET,
     DISCOGS_TOKEN, SONGKICK_API_KEY,
     BANDSINTOWN_API_KEY
- Optional (YouTube sync):
     YOUTUBE_API_KEY, YOUTUBE_CHANNEL_ID, CRON_SECRET
- Optional (Newsletter DOI — required for sending Double Opt-In confirmation emails):
     RESEND_API_KEY, RESEND_FROM_EMAIL, NEXT_PUBLIC_SITE_URL
- Optional (MailerLite — adds verified subscribers to the marketing list after DOI confirmation):
     MAILERLITE_API_KEY, MAILERLITE_GROUP_ID
- Optional (ISR webhook revalidation — required for Supabase webhook-triggered cache busting):
     REVALIDATE_SECRET
- Optional (Supabase Read Replica — Supabase Pro plan; routes heavy analytics reads off the primary DB):
     SUPABASE_REPLICA_URL, SUPABASE_REPLICA_ANON_KEY
Configure all variables in Vercel Dashboard → Project → Settings → Environment Variables.
See DEPLOYMENT.md for full variable descriptions and setup instructions.

Newsletter Double Opt-In (DOI) Flow
newsletter_subscribers stores each signup with status='pending' and a UUID verification_token until the user confirms.
Subscription entry point: `subscribeToNewsletter(formData)` Server Action in `src/actions/newsletter.ts`. The form in `NewsletterSection.tsx` calls this via React 19 Server Action invocation (no fetch, no route handler).
Email delivery: a Supabase Edge Function (`supabase/functions/newsletter-confirm/index.ts`, Deno runtime) is triggered by a Database Webhook on INSERT to `newsletter_subscribers`. It sends the DOI confirmation email via the Resend API.
Verification: `GET /api/newsletter/verify?token=<uuid>` looks up the pending row, flips status to 'subscribed', optionally syncs to MailerLite, and redirects to `/newsletter/confirmed`.
Anti-enumeration: duplicate email submissions return a silent success — the user is never told whether the address is already registered.
Legacy REST fallback: `POST /api/newsletter` (Route Handler) still accepts subscriptions for server-to-server integrations and testing; it follows the same pending+token pattern.
DAL: `createPendingSubscriber(db, email, token, name?)` and `verifySubscriberToken(db, token)` in `src/lib/api/newsletter.ts`. Both require a service-role client to bypass RLS.
Edge Function secrets (set in Supabase Dashboard → Edge Functions → Secrets): RESEND_API_KEY, RESEND_FROM_EMAIL, NEXT_PUBLIC_SITE_URL.

Responsive Design & Layout Integrity
MANDATORY: All UI components MUST follow the rules below.

Mobile-First Only: Always build the mobile layout first using base Tailwind classes (without prefixes). Only scale up using sm:, md:, and lg: breakpoints. Never use desktop-first hacks like max-md:.

Fluidity over Fixed Dimensions: Never use hardcoded pixel dimensions (e.g., w-[500px], h-[300px]) for structural containers. Always use fluid utility classes (w-full, max-w-7xl, min-h-screen) or aspect ratios (aspect-video, aspect-square).

Bento/Grid Strategies: For high-density information (like the Artist Dashboard or Release Radar), use CSS Grid. Implement grid-auto-flow: dense to prevent "swiss cheese" empty gaps when grid items wrap on different screen sizes.

Zero Cumulative Layout Shift (CLS): Loading states (using shadcn/ui Skeletons) MUST use the exact same grid and flex structures as the fully loaded content.

Defensive Overflow: Prevent horizontal scrolling on mobile at all costs. Handle long texts or overflowing images gracefully using truncate, overflow-hidden, or break-words.

Modal & Dialog Quality Standards — MANDATORY
Seven enforceable principles for consistent modal/layout quality. All new and updated modals/dialogs MUST comply.

**1. Responsive Modal Sizes (Viewport-relative)**
ALL modals/dialogs MUST use viewport-relative sizing with responsive breakpoints. Hard-coding a single `max-w-*` class without breakpoints is forbidden.

- ✅ Correct: `className="max-w-[calc(100%-2rem)] sm:max-w-lg md:max-w-xl lg:max-w-2xl"`
- ❌ Forbidden: `className="max-w-lg"` (fixed size without responsive context)

Default breakpoints for new modals:

- Mobile (<640px): `max-w-[calc(100%-2rem)]` (1 rem side margin)
- sm (≥640px): `sm:max-w-lg` (32 rem / 512 px)
- md (≥768px): `md:max-w-xl` (36 rem / 576 px)
- lg (≥1024px): `lg:max-w-2xl` (42 rem / 672 px)

Documented exceptions (must be noted in a code comment):

- Video/gallery modals: `sm:max-w-[95vw]` (maximum width for 16:9 content)
- Forms with many fields: `lg:max-w-4xl`
- Confirmation dialogs (text only): `sm:max-w-sm`

**2. Vertical Height Limiting (max-h + Scroll)**
EVERY modal body MUST enforce a maximum height with internal scrolling so long content never overflows the viewport.

- ✅ Required pattern: `<div className="overflow-y-auto max-h-[70vh] p-6">{children}</div>`
- `max-h-[70vh]` leaves 30 % of viewport for header / footer / close button.
- `overflow-y-auto` enables vertical scrolling on overflow.
- `p-6` prevents content from touching the edge.

`max-h` values by modal type:

- Standard forms: `max-h-[70vh]`
- Video / media modals: `max-h-[92vh]` (maximise space for 16:9)
- Confirmation dialogs: `max-h-[50vh]`

**3. Spacing System (8 px Grid)**
USE ONLY multiples of `0.5rem` (8 px) from the standard Tailwind spacing scale for all padding and margin inside modals and dialogs.

Allowed values:

- Tight:     `p-2` (8 px), `p-3` (12 px), `p-4` (16 px)
- Standard:  `p-6` (24 px) — default for modal bodies
- Generous:  `p-8` (32 px), `p-12` (48 px)

Forbidden:

- Off-grid values: `p-5`, `p-7`, `p-9`
- Pixel literals: `style={{ padding: '13px' }}`

```tsx
// ✅ Consistent
<DialogContent className="p-0">
  <div className="p-6">{/* header */}</div>
  <div className="overflow-y-auto max-h-[70vh] p-6">{/* body */}</div>
  <div className="p-4 border-t border-border">{/* footer */}</div>
</DialogContent>
```

**4. Z-Index Stacking**
Modals/dialogs are managed by Radix UI's `Dialog` primitive and live at Tailwind `z-50` by default. Do NOT manually override the z-index of a `DialogContent` or `DialogOverlay` unless there is a documented conflict (e.g., a custom full-screen overlay component that is not a Radix Dialog). The VisualEffectsOverlay layers occupy `z-[9996]`–`z-[9998]` and must always sit above modals; never raise a modal's z-index above `z-[9900]`.

When building a fully custom modal (like `TacticalModal`) that does not use Radix `Dialog`, use `z-50` for both the backdrop and the panel container and document the reason.

**5. Backdrop Pattern**
Every modal MUST render a visible semi-transparent backdrop so the rest of the page is visually dimmed.

- ✅ Standard: `bg-black/80` with `transition={{ duration: 0.12, ease: 'linear' }}` (skip transition when `prefersReducedMotion`)
- Use `pointer-events-auto` on the backdrop and attach `onClick={onClose}` to it so clicking outside the panel dismisses the modal.
- The `Dialog` primitive from `@/components/ui/dialog` (Radix) handles the backdrop automatically — do NOT add a second backdrop overlay on top of it.

**6. Enter/Exit Animation**
Use a consistent spring animation for panel entrance. The preferred preset ("blade snap") matches `TacticalModal` and `VideoModal`:

```ts
const MODAL_SPRING = { type: 'spring', stiffness: 400, damping: 40 } as const
```

- Entrance: opacity 0 → 1 + scale 0.96 → 1 (or `clipPath` blade-slice for panel-style dialogs).
- When `prefersReducedMotion` is `true`: set `duration: 0` on all transitions — skip all transforms.
- Import `useReducedMotion` from `framer-motion` in every animated modal.
- Do NOT use `animate-bounce` or `animate-pulse` on modal panels — reserved for loading indicators.

**7. Close / Dismiss Behaviour**
Every modal MUST support all three standard dismiss paths without exception:

1. **Close button**: visible `×` button in the top-right corner, `min-w-[44px] min-h-[44px]`, `aria-label="Close [context]"`.
2. **ESC key**: handled automatically by Radix `Dialog`; for custom modals add a `keydown` listener on `document` that calls `onClose()` when `event.key === 'Escape'`.
3. **Backdrop click**: `onClick={onClose}` on the backdrop element (Radix handles this via `onOpenChange`).

Use `onOpenChange={(isOpen) => { if (!isOpen) onClose() }}` on `<Dialog>` so all dismiss paths funnel through a single `onClose` callback — never handle each path separately.

Visual Effects (Industrial Aesthetic)
The public site renders three non-interactive overlay layers — animated noise/grain, CRT scanlines, and a vignette — controlled by CMS settings.
The VisualEffectsOverlay component (src/components/VisualEffectsOverlay.tsx) is a dumb Client Component mounted in app/layout.tsx. It receives noiseOpacity, crtScanlinesEnabled, and vignetteIntensity as props from the Server Component parent (IoC).
All overlays use pointer-events: none and z-index 9996–9998 so they never block user interactions.
Settings are stored in the site_settings KV table (keys: noise_opacity, crt_scanlines_enabled, vignette_intensity, shopify_store_url, youtube_channel_id) and managed via the Admin CMS "Visual Effects" tab (Slider + Switch controls).
CSS animation keyframes (.noise-overlay, .scanlines-overlay) live in app/globals.css. Opacity/visibility is controlled via inline style props — never hardcoded.
CRITICAL DESIGN RULE: Do NOT use neon glows, bright highlights, or flashy cyberpunk effects. Keep the aesthetic raw, dark, industrial, and subtle.
ADMIN/PORTAL/PRESS ROUTES — NO VISUAL EFFECTS: VisualEffectsOverlay and ThemeEffectsClient are both wrapped in NavHidingWrapper in app/layout.tsx. They are NOT rendered on /admin/*, /portal/*, /press/*, or /editor/* routes. Do NOT move these components outside the NavHidingWrapper. ThemeEffectsClient also removes all data-fx-* attributes from <html> in its useEffect cleanup (on unmount), so navigating from a public page to admin never leaves stale effect attributes behind.

Color Theme Admin (ColorThemeManager)
`src/components/admin/ColorThemeManager.tsx` is the admin editor for the CI Color System. Key architectural rules:

- All mutable editor state lives in a SINGLE `useReducer` (`ThemeDraft` + `ThemeAction` union). Do NOT add individual `useState` hooks per field — use `dispatch({ type: ... })` instead.
- Live preview is DECLARATIVE: `buildPreviewCss(draft)` produces a `:root { … }` CSS string which is rendered as `<style data-id="ctm-live-preview" dangerouslySetInnerHTML={{ ... }} />` in JSX. React mounts/unmounts it automatically. Do NOT reintroduce `document.documentElement.style.setProperty` / `removeProperty` calls — they cause hydration mismatches.
- `ThemeStyleInjector` (app/_components/ThemeStyleInjector.tsx) handles the SSR side: it injects the SAVED theme as a `<style>` tag in `<head>` at server-render time to prevent FOUC. ColorThemeManager handles the live preview only.
- `handleCancel` restores the original draft in one `dispatch({ type: 'SET_DRAFT', draft: originalDraft.current })` call — no imperative cleanup needed.
- `handleSave` diffs the draft against `value` props and calls `onChange` with only the changed fields.
- After a successful save, `handleSave` posts `{ type: 'theme-updated' }` to `BroadcastChannel('theme-updates')` so any open public-site tabs pick up the new theme within ~1 second.
- ColorThemeManager NO LONGER owns a Google Font loading useEffect — that responsibility was moved to `TypographyTab` so the font tab is self-contained and standalone-safe.

Typography System (state-of-the-art)
`ThemeTypography` (src/config/themeConfig.ts) exposes the following CSS tokens, all admin-configurable:

- `fontFamily`           → `--font-family-body`
- `headingFamily`        → `--font-family-heading`
- `serifFamily`          → `--font-serif` (dedicated serif/accent override; if unset, inherits body font)
- `headingSize`          → `--heading-size` (h1 base size in rem)
- `headingScale`         → `--heading-scale` (ratio; h2 = h1×scale, h3 = h1×scale²)
- `bodySize`             → `--body-size`
- `bodyWeight`           → `--body-weight`
- `headingWeight`        → `--heading-weight`
- `lineHeight`           → `--line-height-body`
- `lineHeightHeading`    → `--line-height-heading`
- `letterSpacing`        → `--letter-spacing-body`
- `letterSpacingHeading` → `--letter-spacing-heading`

`--font-serif` wiring (critical): The Tailwind `font-serif` utility maps to `font-family: var(--font-serif)`. There are 27+ usages in Hero, Artist bios, MarkdownContent, etc. ThemeStyleInjector emits `--font-serif` as follows:

- `serifFamily` set → `--font-serif: 'serifFamily', serif` (dedicated accent typeface)
- `serifFamily` empty + `fontFamily` set → `--font-serif: var(--font-family-body)` (all serif elements follow body font)
- Both empty → token not emitted (falls back to globals.css default: `var(--font-family-body, Georgia, serif)`)
  ⛔ Do NOT restore `--font-serif` as an inline style on `<html>` in layout.tsx — inline styles override ThemeStyleInjector's `<style>` tag.

`buildGoogleFontSpec(fontName, weights)` (exported from ThemeStyleInjector.tsx):

- Converts a font name + weight array into a Google Fonts CSS2 API family spec fragment
- Strips CSS fallback stacks (splits on `,`), strips surrounding quotes
- Returns `null` for empty strings and http/https URLs
- Auto-constructs URL for unknown names (`spaces → +`) — any valid Google Font works without a map entry
- Always includes 400 as safety weight; deduplicates and sorts weights numerically
- Used by both ThemeStyleInjector (SSR) and TypographyTab (client-side preview font loading)

Font loading strategy:

- ThemeStyleInjector (SSR): emits `<link rel="stylesheet">` + `<link rel="preconnect">` for configured fonts; weight-subsets to only bodyWeight + headingWeight (reduces CSS payload ~60% vs. loading 300;400;500;600;700).
- Adds `<link rel="preload" as="style">` for the primary body font weight to improve FCP.
- TypographyTab (client): owns a self-contained `useEffect` that calls `loadGoogleFonts()` whenever body/heading/serif font selection changes. Works standalone in any context (Storybook, testbed, future refactors) without depending on a parent's useEffect.

Real-time cross-tab theme sync:

- `src/components/ThemeBroadcastListener.tsx` is a `"use client"` component (returns null) mounted in `app/_components/Providers.tsx`.
- It opens `BroadcastChannel('theme-updates')` and calls `router.refresh()` when it receives `{ type: 'theme-updated' }`.
- The admin tab that triggered the save does NOT receive its own broadcast (BroadcastChannel sender exclusion is spec behaviour).
- Gracefully skips when BroadcastChannel is unsupported (private Safari, some Webviews).
- NEVER add a second ThemeBroadcastListener instance.

Press & Media Ecosystem
Public EPK page: `app/press/page.tsx` (Server Component) fetches press_photos, artist profile bios (short/medium/long), concerts, and press_quote from Supabase. All photo display URLs pass through `getOptimizedImageUrl()` (wsrv.nl proxy); download links point to the original R2 public CDN URL.
Promo Pool: `/promo-pool/*` is a dual-gated journalist-only area.

- Gate 1 (Edge Middleware): unauthenticated users are redirected to `/promo-pool/login`.
- Gate 2 (Layout Server Component): authenticated users without role `journalist` or `admin` see `PromoPoolAccessGate` (shows application status or application form).
Anti-leak audio: `promo_tracks` stores only the R2 object key — NO public URL. The `getPromoTrackStreamUrl(r2Key)` Server Action in `src/actions/promoTrack.ts` verifies the journalist/admin role and returns a 15-minute presigned GET URL. The URL is only generated on explicit user click, never in initial HTML.
Admin EPK upload: `getEpkUploadUrl(category, filename, contentType)` in `src/actions/epkUpload.ts` generates a 15-minute presigned PUT URL for direct browser-to-R2 upload, bypassing Vercel's 4.5 MB limit. Categories: `press-photos` | `promo-tracks`.
Journalist applications: `journalist_applications` table; `POST /api/journalist-applications` lets anyone submit. `PATCH /api/journalist-applications/[id]` (admin-only) approves/rejects and updates `profiles.role` to `journalist` / `user`. Admin UI is in `src/components/admin/PressManager.tsx` (Press Portal page).
DAL: `src/lib/api/pressPhotos.ts`, `src/lib/api/promoTracks.ts`, `src/lib/api/journalistApplications.ts` — each with Vitest tests.
user_role enum: includes `journalist`, `artist` in addition to `admin`, `editor`, `user`. The `UserProfile` type in `src/types/index.ts` reflects all five values.
DB: All tables for journalist role, press_photos, promo_tracks, and journalist_applications are defined in `supabase/reset.sql` (the only schema source of truth).

Admin User Management
The **Users** tab in the AdminDashboard (`src/components/admin/AdminDashboard.tsx`) is only visible when `profile.role === 'admin'`. It renders `<UsersManager />`.
The **Features** tab is also admin-only — it renders `<FeatureTogglesManager />` to toggle `promoPool`, `sosStatements`, and `editorTools` globally.
Editor restriction: Editors (`role === 'editor'`) see only artists, releases, news, and videos tabs in the admin dashboard. Admin-only tabs (assets, settings, health, media, users, features) are hidden for editors. If `editorTools` feature toggle is disabled, editors are blocked from admin entirely with an "Editor Tools Disabled" gate.
Types: `UserRole` and `UserWithProfile` are in `src/types/users.ts`.
DAL: `src/lib/api/users.ts` exports `listUsersWithProfiles`, `updateUserRole`, `banUser`, `deleteUser`, `linkArtistToUser`, `unlinkArtistFromUser`. All functions accept a service-role `SupabaseClient`. Supabase Auth Admin API methods (`listUsers`, `updateUserById`, `deleteUser`) are called via the `adminClient.auth.admin` namespace.
Hook: `src/hooks/useUsers.ts` fetches from `GET /api/admin/users` and exposes `updateRole`, `toggleBan`, `deleteUser`, `linkArtist`, `unlinkArtist` with optimistic updates and toast notifications.
API Routes (all admin-only, use service-role client):

- `GET /api/admin/users` — lists all users merged with profile roles and linked artist names.
- `PATCH /api/admin/users/[id]` — updates `role` and/or `ban` status; rejects self-modification.
- `DELETE /api/admin/users/[id]` — deletes user from Auth; profiles cascade. Rejects self-deletion.
- `PATCH /api/admin/users/[id]/link-artist` — links or unlinks (`artistId: null`) an artist to a user. Validates no double-linking.
Security: Every route verifies `profiles.role = 'admin'` server-side via `createServerSupabaseClient()` before using the service-role client. The service-role key never reaches the browser.

Feature Toggles
There are now two feature-flag systems:

1) Global JSON toggles in `site_settings` key `feature_toggles` (`promoPool`, `sosStatements`, `editorTools`) managed by `FeatureTogglesManager`.
2) Role-targeted portal/journalist module flags in `portal_feature_flags` (e.g. `artist.tour`, `journalist.press_kit`) managed by `FeatureFlagsManager` and `PATCH /api/admin/feature-flags/[id]`.
Enforcement: Portal and press dashboard nav/routes read `portal_feature_flags`; legacy promo-pool/editor gates still read `site_settings.feature_toggles`.

Artist Portal Access Gate
Portal layout (`app/portal/layout.tsx`) enforces role-based access BEFORE rendering the portal UI:

- Roles `artist` or `admin` → portal accessible (user must also have a linked artist record).
- Role `user` (unassigned/new) → `PortalAccessGate` component shown — explains how to request access.
- Other roles (`editor`, `journalist`) → `PortalAccessGate` shown with role explanation.
`PortalAccessGate` lives at `app/portal/_components/PortalAccessGate.tsx`.
New users default to `user` role = zero portal/admin access until an Admin explicitly assigns a role and links their artist profile.

Artist Preview
`PortalSidebar` accepts `artistSlug: string | null`, `featureFlags: Record<string, boolean>`, and `unreadMessages: number` props from the layout Server Component.
When `artistSlug` is set, a "Preview Public Profile" link is shown under the artist name (opens `/artists/{slug}` in a new tab).
The same preview link/button appears at the top of `ProfileForm` (passed via `artistSlug` prop from `portal/profile/page.tsx`).

Journalist Dashboard
Protected routes live at `/press/dashboard/*` with dedicated `/press/login`.
Middleware enforces auth and role (`journalist` or `admin`) before access.
Feature-flag-gated modules: promo pool, press kit, press releases, accreditation, download history.

Schema note
`supabase/reset.sql` is the sole, canonical, idempotent schema script. ⛔ There are NO migration files — `supabase/migrations/` MUST NOT exist. If any file exists there, delete it and fold the change into `reset.sql`.
Tables `artist_assets` and `artist_replies` are defined at the bottom of `reset.sql`.

Hero Section (src/components/Hero.tsx + app/_components/HomePageContent.tsx)
The Hero component accepts a single `heroItem?: Release | NewsPost` prop (union type). Use the exported `isRelease(item)` type guard to distinguish between the two.
`HomePageContent` builds a unified `heroItems: (Release | NewsPost)[]` array combining all featured releases plus the latest news post. The carousel index (`heroIndex`) cycles through ALL items every 6 seconds with dot-indicators shown when `heroItems.length > 1`.
The "Explore" scroll button scrolls to `#releases` for release items and `#news` for news items — the `#artists` anchor does NOT exist on the home page.
The hero background gradient uses `rgba(var(--background-rgb), 0.55)` → `0.85` (bottom) to keep titles legible without fully obscuring the background image.

PWA (Progressive Web App)
The site is a fully installable PWA powered by @serwist/next (v9) + serwist.
Service Worker: `app/sw.ts` — compiled by serwist's Next.js plugin into `public/sw.js` (gitignored). Uses `CacheFirst` for static assets and wsrv.nl images (30-day TTL), `StaleWhileRevalidate` for R2 assets, `NetworkFirst` for HTML pages, and serves `app/offline/page.tsx` as a document fallback when offline.
next.config.ts is wrapped with `withSerwistInit` from `@serwist/next`. The `exclude` list prevents the service worker from intercepting `/api/*`, `/admin/*`, `/portal/*`, `/press/*`, `/promo-pool/*` routes.
Manifest: `app/manifest.ts` (Next.js 15 `MetadataRoute.Manifest`) — served at `/manifest.webmanifest`. `display: 'standalone'`, `background_color / theme_color: '#101010'`. Requires icon files in `public/icons/` (see `public/icons/README.md`).
Apple PWA meta tags (theme-color, apple-mobile-web-app-capable, apple-touch-icon) are injected in `app/layout.tsx`.
Custom install prompt: `src/components/PWAInstallPrompt.tsx` — listens for `beforeinstallprompt` (Android/Chrome) and shows an on-brand banner after 3 seconds. iOS users see a manual "Share → Add to Home Screen" hint. Dismissal is persisted in localStorage (`pwa-install-dismissed`). Mounted once in `app/_components/Providers.tsx`.
NEVER add a second `PWAInstallPrompt` instance. NEVER intercept admin/portal/press routes in the service worker.

Gallery Performance (ReleasesCoverflow Virtual Windowing)
`ReleasesCoverflow` supports catalogues of any size without degrading performance.
All slide *containers* are rendered so Embla measures the full carousel width correctly (they are lightweight empty `<div>` elements with `aspect-square`).
Only slides within `VIRTUAL_BUFFER = 3` positions of the active index have their actual image/link content rendered. Off-window slides render a placeholder `<div>`.
The rendered window (`renderedIndices: Set<number>`) grows monotonically as the user navigates — once an index enters the window it is never evicted, acting as a natural browser image cache. Maximum DOM-heavy nodes at any time: 7.
Images use `loading="lazy" decoding="async"` and pass through `getOptimizedImageUrl(url, 600)` (wsrv.nl → WebP).
Artist images in `Artists.tsx` also use `loading="lazy" decoding="async"` + `getSquareThumbnail`.

3D Coverflow Clip Architecture: The outer wrapper has `overflow: hidden` to prevent horizontal page scroll. The Embla viewport div (emblaRef) uses `overflow: visible` so perspective-rotated adjacent slides are fully visible and not cropped at the viewport edge. The perspective (1200px) is on a middle wrapper between the two. This three-layer structure — [clip] → [perspective] → [embla-visible] — is required; do NOT collapse layers or move overflow-hidden onto the perspective/embla elements.

robots.txt & llms.txt Maintenance
Two auto-generated discovery files are served by Next.js at build/request time — no static files to edit manually:

`app/robots.ts` — generates `/robots.txt` via the Next.js Metadata API.

- To BLOCK a new private route prefix (e.g. `/members/`): add `'/members/'` to the `disallow` array in the `rules[0]` entry.
- To BLOCK an additional AI training crawler: add its user-agent string to the `userAgent` array in the second rules entry.
- To add a NEW sitemap URL: add the full URL to the `sitemap` property.
- ⛔ Never add allow rules for routes protected by middleware — middleware already blocks them; allow rules would be misleading.

`app/llms.txt/route.ts` — generates `/llms.txt` dynamically from live Supabase data (ISR revalidate: 300 s).

- New artists and releases appear automatically — no manual update needed.
- To ADD a new public section (e.g. `/merch`): add a line to the `## Sections` block inside `buildLlmsTxt()`.
- To REMOVE a section: delete its line from the `## Sections` block and its corresponding data fetch/render block.
- To ADD extra metadata (e.g. label social links): add it to the header block in `buildLlmsTxt()`.
- ⛔ Never list admin, portal, press, or promo-pool routes in `llms.txt` — those are restricted by robots.txt.
- Cache tags: the route uses `artists` and `releases` tags — it is automatically refreshed when those caches are invalidated by the sync cron jobs.

## Server vs. Client Component Decision Matrix — MANDATORY

Default to React Server Components (RSC). Add `"use client"` ONLY when the component:

- Uses browser event handlers (onClick, onChange, onSubmit)
- Uses browser-only APIs (window, localStorage, navigator, IntersectionObserver)
- Uses React hooks: useState, useEffect, useReducer, useRef, useContext
- Uses framer-motion animation primitives (motion.*, AnimatePresence)
- Uses useLenis() for programmatic scroll
- Uses Supabase Realtime subscriptions

NEVER add `"use client"` to a component just to avoid a TypeScript error or for
"convenience". Prop-drill server data down to client leaf components instead.

Pattern — RSC parent → "use client" leaf:

```tsx
// ✅ Correct: Server Component fetches, Client Component animates
// app/artists/[slug]/page.tsx (Server Component)
const artist = await getArtistBySlug(client, slug)
return <ArtistHero artist={artist} /> // ArtistHero is "use client"
```

## CQRS Convention (Command Query Responsibility Segregation)

Read operations belong in React Server Components (RSC) or `unstable_cache`-wrapped
DAL calls. Write operations from the React client context run exclusively as
`"use server"` Server Actions or JWT-authenticated Route Handlers.

| Context | Pattern | Examples |
| --- | --- | --- |
| Portal forms (artist, profile, checklist) | Server Action (`"use server"`) | `src/actions/portal/*.ts` |
| Admin forms (artists, releases, news) | Route Handler + JWT | `/api/admin/artists`, `/api/admin/releases` |
| External systems (cron, webhooks) | Route Handler | `/api/sync`, `/api/webhooks/*` |
| SOS statement upload | Server Action (`"use server"`) | `app/portal/statements/_actions/uploadStatement.ts` |
| Public reads | RSC + `unstable_cache` | `app/artists/[slug]/page.tsx` |

**Why admin writes use Route Handlers (not Server Actions):** The Admin UI
communicates via `fetch()` with a JWT ****** which is not the Next.js
RSC request context. This is architecturally correct and should NOT be changed.

**Why portal writes should use Server Actions:** Portal pages are RSC-rendered
and the user session is available via cookies, making Server Actions the natural
fit. Migrations from Route Handlers to Server Actions happen incrementally.

## Server Actions vs. Route Handlers

| Use Case | Use |
| --- | --- |
| Form submissions from Client Components (portal, newsletter, EPK) | Server Action (`"use server"`) |
| External API consumers (cron jobs, webhooks, SOS generator) | Route Handler (`route.ts`) |
| Admin JWT-protected mutations called from JS `fetch()` | Route Handler |
| File uploads > 4.5 MB (use presigned URL flow instead) | Route Handler with presigned R2 URL |

Server Actions CANNOT be called from outside the Next.js app.
Route Handlers MUST be wrapped with `withErrorHandler`.

## Tailwind Configuration — Source of Truth

The project uses Tailwind CSS v4 (PostCSS). CSS custom properties in
`app/globals.css` (via `@theme {}` block) are the ONLY source of truth for
design tokens.

`tailwind.config.js` exists ONLY for IDE IntelliSense. Do NOT add new color
tokens, spacing, or breakpoints there — they will NOT be picked up at runtime
with Tailwind v4's PostCSS pipeline.

Rule: Any new design token → add ONLY to `app/globals.css` inside `@theme {}`.
Never approximate: use the exact hex values defined in the CI Color System section.

## Class Name Composition

ALWAYS use `cn()` from `@/lib/utils` for conditional or merged class names.
Never use plain string template literals for Tailwind classes.
Never import `clsx` or `tailwind-merge` directly.

```tsx
// ✅
import { cn } from '@/lib/utils'
<div className={cn('base-classes', isActive && 'active-class', className)} />

// ❌ Wrong — bypasses tailwind-merge deduplication
<div className={`base-classes ${isActive ? 'active-class' : ''}`} />
```

## Deprecated Code — FORBIDDEN Imports

`src/lib/supabase.ts` — DEPRECATED. Creates a browser-singleton Supabase client.
DO NOT import from this file in any new code.

Replace with:

- Client Components: `createBrowserSupabaseClient()` from `@/lib/supabase/client`
- Server Components / Route Handlers: `createServerSupabaseClient()` from `@/lib/supabase/server`
- Service-role operations: pass `createServerSupabaseClient()` with SUPABASE_SERVICE_ROLE_KEY

## ISR Cache Tag Naming Convention

Tags follow the pattern: lowercase table name as-is.
Multi-resource pages combine tags: `['artists', 'releases']`
Single-resource pages: `['releases', \`release-${id}\`]`

### List-level tags (invalidate all pages of this type)

  'artists' | 'releases' | 'news' | 'videos' | 'concerts'
  'site-settings' | 'artist-profiles' | 'sync-logs'

### Entity-level tags (invalidate only one specific page)

  `'artist-${slug}'`   → use in `app/artists/[slug]/page.tsx`
  `'release-${id}'`    → use in `app/releases/[id]/page.tsx`
  `'news-${slug}'`     → use in `app/news/[slug]/page.tsx`

All pages use BOTH a list-level and an entity-level tag so that either a
full-list revalidation or a targeted single-entity revalidation will bust them:
  `app/artists/[slug]`  → tags: `['artists', 'artist-${slug}']`
  `app/releases/[id]`   → tags: `['releases', 'release-${id}']`
  `app/news/[slug]`     → tags: `['news', 'news-${slug}']`

When calling revalidateTag() in a Route Handler after a write:

- Artist update: `revalidateTag('artists')` + `revalidateTag('artist-${slug}')`
- Release update: `revalidateTag('releases')` + `revalidateTag('release-${id}')`
- News update: `revalidateTag('news')` + `revalidateTag('news-${slug}')`

`POST /api/revalidate-content` accepts an optional `entityTags` array for
targeted Supabase Database Webhook-driven revalidation.
Adding an undocumented tag silently does nothing.

## Next.js Metadata API — MANDATORY for every page.tsx

Every `page.tsx` MUST export either a static `metadata` object or a
`generateMetadata()` async function. NEVER use `<title>` or `<meta>` in JSX.

Static pages (e.g. /impressum):

```tsx
export const metadata: Metadata = {
  title: 'Impressum | darkTunes Music Group',
  description: '...',
}
```

Dynamic pages (e.g. /artists/[slug]):

```tsx
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const artist = await getArtistBySlug(client, params.slug)
  return {
    title: `${artist.name} | darkTunes Music Group`,
    openGraph: { images: [{ url: artist.imageUrl }] },
  }
}
```

## loading.tsx — Required for all async route segments

Every route segment with async data fetching MUST have a `loading.tsx` sibling.
The loading skeleton MUST use the EXACT same grid/flex layout as the loaded
content (skeleton dimension parity — prevents CLS).

Skeleton components live in `src/components/skeletons/`.
Use shadcn/ui `<Skeleton>` as the primitive. Never use a spinner as a full-page replacement.

## generateStaticParams — Required for known dynamic routes

These routes MUST export `generateStaticParams()` to enable ISR pre-rendering:

- `app/artists/[slug]/page.tsx`
- `app/releases/[id]/page.tsx`
- `app/news/[slug]/page.tsx`

Set `export const dynamicParams = true` so ISR can serve unknown slugs at runtime.
Set `export const revalidate = 60` at the route segment level.

## Cloudflare R2 Object Key Naming Convention

ALL R2 keys MUST be stored in the corresponding DB column (`r2_key`) so that
`deleteObjectFromR2(r2Key)` can clean up when the DB record is deleted.

Key prefixes (NEVER deviate):
  artists/{artistId}/{uuid}.{ext}                         → artist images / logos
  releases/{releaseId}/{uuid}.{ext}                        → release cover art
  profile-photos/{artistId}/{uuid}.{ext}                   → portal profile photos
  release-covers/{artistId}/{uuid}.{ext}                   → portal-submitted release covers
  statements/{artistId}/{filename}                         → SOS royalty PDFs
  artist-assets/{artistId}/{uuid}.{ext}                    → artist-uploaded marketing files
  artist-documents/{artistId}/{uuid}_{originalFilename}    → portal document vault (PDF/DOCX contracts, GEMA, splits)
  press-kit/{category}/{uuid}.{ext}                        → EPK assets (press photos, etc.)
  promo-tracks/{uuid}.{ext}                                → journalist promo audio

## Naming Conventions

Files:

- React components:   PascalCase.tsx    (ArtistCard.tsx)
- Pages:              page.tsx          (enforced by Next.js)
- Hooks:              useCamelCase.ts   (useArtists.ts)
- DAL functions:      camelCase.ts      (artists.ts, siteSettings.ts)
- Utilities:          camelCase.ts      (imageUtils.ts, r2Utils.ts)
- Types:              camelCase.ts      (database.ts, users.ts)
- Server Actions:     camelCase.ts      (newsletter.ts, presignedUrl.ts)
- Route Handlers:     route.ts          (enforced by Next.js)
- Tests:              *.test.ts /*.spec.ts (co-located with source)

Components:

- All React component function names: PascalCase
- Hooks: always prefixed with `use`
- DAL functions: `verb + Noun` pattern (getArtistBySlug, upsertRelease, deleteVideo)
- Boolean props: `is` or `has` prefix (isVisible, hasError, isLoading)

## Directory Structure

```text
app/                      → Next.js App Router (pages, layouts, API routes)
app/_components/          → App-level wrappers (Providers.tsx, HomePageContent.tsx)
app/api/                  → Route Handlers (HTTP API endpoints)
app/admin/                → Admin route segment
app/portal/               → Artist Portal route segment
app/press/                → Journalist Dashboard route segment
src/
  actions/                → Next.js Server Actions ("use server")
  components/             → Shared UI components
  components/admin/       → Admin-only components (NOT imported by public pages)
  components/admin/forms/ → Admin CRUD form components
  components/ui/          → shadcn/ui primitives — NEVER EDIT DIRECTLY
  components/skeletons/   → Loading skeleton components
  components/animations/  → Animation wrappers (LenisProvider)
  domain/                 → Repository interfaces + Event Bus
  hooks/                  → React hooks (wrap DAL + React state)
  i18n/                   → i18n dictionaries (en.json, de.json)
  lib/                    → Business logic, utilities
  lib/api/                → Data Access Layer (one file per DB table)
  lib/sync/               → External API sync integrations
  lib/supabase/           → Supabase client factories
  lib/portal/             → Portal-specific utilities (presigned URLs)
  lib/email/              → Email sending utilities
  types/                  → TypeScript type definitions
  workers/                → Web Workers
supabase/
  reset.sql               → SINGLE schema source of truth
  functions/              → Supabase Edge Functions (Deno)
tests/
  e2e/                    → Playwright E2E tests
  performance/            → Playwright performance tests
scripts/                  → Build/deploy scripts
```

## shadcn/ui Component Policy

Files in `src/components/ui/` are generated by the shadcn CLI.
⛔ NEVER edit them directly — changes will be overwritten by `npx shadcn@latest add`.

To extend a primitive: wrap it in a NEW component in `src/components/`.
To add a new shadcn component: `npx shadcn@latest add [component-name]`
Check `components.json` for the project's shadcn configuration before adding.

## Package Manager — npm ONLY

This project uses npm exclusively. NEVER use yarn, pnpm, or bun.
The `package-lock.json` is the lock file — committing a second lock file (yarn.lock,
pnpm-lock.yaml) will break CI.

CI uses `npm ci` (strict install from lock file). Never run `npm install` in CI.

## TypeScript Import Paths

`@/` maps to `./src/` (configured in tsconfig.json paths).
Always use `@/` for cross-directory imports instead of relative `../../..` paths.
Exception: Same-directory imports use `./` (e.g., `./utils`).
Exception: Files under `app/` must be imported via relative paths, not `@/app/...`.

Import order (enforced by ESLint):

1. Node built-ins (node:fs, node:path)
2. External packages (react, next/image, framer-motion)
3. Internal absolute imports (@/components/..., @/lib/...)
4. Relative imports (./Button, ../utils)

## Notifications / Toasts

Use `sonner` exclusively (installed via shadcn).
Import: `import { toast } from 'sonner'`

Usage:
  toast.success('Artist saved.')
  toast.error('Failed to sync.')
  toast.loading('Syncing...', { id: 'sync' }); toast.dismiss('sync')

NEVER use: alert(), window.confirm(), console.error() for user-facing feedback.
NEVER import react-hot-toast, react-toastify, or any other toast library.

## State Management Policy

No global state library (Redux, Zustand, Jotai, Recoil) is used in this project.
Do NOT add one without team agreement.

State rules:

- Persisted server state → RSC + ISR (no React Query / SWR / TanStack)
- Shared UI state (locale, consent) → React Context in app/_components/Providers.tsx
- Component-local state → useState / useReducer
- Smooth-scroll instance → useLenis() from LenisProvider (singleton via ReactLenis)
- Form state → react-hook-form (admin/portal forms only)

## Form Validation

Admin and Portal forms: use `react-hook-form` with `@hookform/resolvers/zod`.
Zod schemas: co-locate with the form file OR in `src/lib/schemas/`.
Validate BOTH client-side (for UX) AND server-side in the Route Handler / Server Action.

Public forms (newsletter, contact): Server Actions with Zod + honeypot field.
Never trust client-side validation alone for security-relevant inputs.

## HTML Sanitization (XSS Prevention)

Any content rendered via `dangerouslySetInnerHTML` MUST be sanitized with DOMPurify.
DOMPurify requires the DOM — only use in `"use client"` components.

```tsx
import DOMPurify from 'dompurify'
// ✅
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(rawHtml) }} />
// ❌ NEVER
<div dangerouslySetInnerHTML={{ __html: rawHtml }} />
```

Applies to: label_messages.body_html, artist_replies.body_html, any CMS rich-text field.

## Application Error Logging (app_logs table)

Log to `app_logs` for errors that need admin visibility but are non-fatal:

- Failed email deliveries (SOS notification, newsletter DOI)
- Failed R2 upload/delete operations during sync
- External API timeouts that fall back to cached data

Use the service-role client; never expose app_logs to anon/public.
Schema: { level: 'error'|'warn'|'info', message: string, context: JSONB, created_at }
Visible in Admin → Logs tab (AppErrors sub-view).

## Database Schema Management (supabase/reset.sql) — MANDATORY

### Definition Order

Helper Functions MUST be defined BEFORE their first use in CREATE TABLE / CREATE POLICY / TRIGGER.
Required order in reset.sql:

  1. EXTENSIONS
  2. ENUM TYPES
  3. ALL HELPER FUNCTIONS (set_updated_at, handle_new_auth_user, handle_oauth_artist_verification,
     get_my_role, has_permission, and any future SECURITY DEFINER helpers)
  4. TABLES (CREATE TABLE IF NOT EXISTS + ALTER TABLE … ADD COLUMN IF NOT EXISTS guards)
  5. RLS POLICIES
  6. DATA BACKFILLS (INSERT … ON CONFLICT DO NOTHING)

### has_permission — Correct Call Signature

`public.has_permission(perm TEXT)` takes EXACTLY ONE ARGUMENT.
The function retrieves auth.uid() internally.
NEVER call `public.has_permission(auth.uid(), 'permission_name')` — that is the wrong signature.
  ✅ Correct:  public.has_permission('can_manage_releases')
  ❌ Wrong:    public.has_permission(auth.uid(), 'can_manage_releases')

### No Duplicate Column Declarations

If a column is already declared inside the CREATE TABLE block, do NOT add a redundant
ALTER TABLE … ADD COLUMN IF NOT EXISTS guard for the same column.
Guards are ONLY for columns added after the initial CREATE TABLE definition.

## Task Decomposition & Multi-Agent Pattern — RECOMMENDED

### Large-Task Decomposition

Before starting any task with >3 distinct concerns, the agent MUST:

  1. Enumerate all sub-tasks as a numbered list in the PR description.
  2. Commit each sub-task as a SEPARATE atomic commit (one concern per commit).
  3. Run `npm run typecheck && npm test && npm run build` after EACH sub-task commit.
  This ensures partial work is always in a passing, mergeable state.

### Parallel Agent Sessions (Multi-Agent Pattern)

For large features spanning multiple independent modules, PREFER splitting the work into
separate GitHub Issues (one per module) rather than one monolithic PR.
Each issue/PR must be independently mergeable and must not block sibling branches.

Example split for a schema + DAL + UI task:

- Issue A: supabase/reset.sql + src/types/database.ts  (schema layer)
- Issue B: src/lib/api/*.ts DAL functions + unit tests  (data layer, depends on A)
- Issue C: src/components/ + app/ UI changes            (presentation layer, depends on B)

Mark blocking relationships using GitHub's "blocking" issue feature.
A coding agent session should be started per issue for true parallel execution.

### Subtask Handoff in AGENTS.md

When an agent completes a subtask that another agent depends on, it MUST leave a summary
comment in the PR describing the exact exports / DB schema changes it introduced,
so the dependent agent can pick up accurately.
