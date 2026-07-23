# Pre-Release QA Checklist

## Functional Tests
- [ ] Validate all public routes load successfully (`/`, `/about`, `/artists`, `/releases`, `/news`, `/contact`, `/press`, `/offline`)
- [ ] Crawl internal links and confirm no broken links / 404 pages
- [ ] Validate dynamic routes for artist and release detail pages
- [ ] Validate newsletter submission flow and confirmation message
- [ ] Validate media and upload features from admin/portal areas

## Observability (Sentry — optional)
- [ ] Without DSN: app builds and runs; no Sentry network calls required
- [ ] With staging DSN: forced 500 on an API route appears in Sentry with `request_id` tag
- [ ] API error JSON includes `requestId` and response has `x-request-id` header
- [ ] Client UI error boundary (authenticated) still posts to `/api/log-error`
- [ ] Sentry events do not contain `Authorization` / `Cookie` headers

## Security
- [ ] Verify unauthenticated users are blocked or redirected from protected routes (`/admin/*`, `/portal/*`, `/press/dashboard/*`, `/promo-pool/*`)
- [ ] Validate protected API endpoints reject missing/invalid authentication
- [ ] Confirm editor JWT cannot call finance APIs (`/api/admin/sales-statements/*`, `/api/admin/settlements/*`, `/api/admin/invoices/*`, `/api/admin/sos/*`) — expect 403
- [ ] Confirm `GET /api/health?mode=full` without auth returns 401; admin System Health widget still loads with Bearer token
- [ ] Confirm press-only news is absent from public `/news` and `/news/[slug]` but visible in press dashboard when published
- [ ] Confirm theme custom CSS cannot inject `</style><script>` breakout (sanitized to empty)
- [ ] Confirm `SUPABASE_SERVICE_ROLE_KEY` is never exposed in client HTML
- [ ] Validate RLS is enabled for sensitive database tables (apply `news_posts: public read` with `is_press_only = false` from `reset.sql`)
- [ ] Review CSP and security headers in production deployment
- [ ] Run vulnerability scan (`npm audit --production --audit-level=high`)

## Portal release submission
- [ ] `/portal/releases/new` stepped wizard; `?step=` updates; progress + Back/Continue work
- [ ] Cover: public Drive JPEG 3000×3000 verifies; private/wrong size/format show clear errors
- [ ] Cover token allows submit without re-download fail; double-click Submit does not create two rows
- [ ] Album: track focus mode + show-all; copy-from-previous / apply-to-all; incomplete tracks block review
- [ ] Draft: refresh restores from server when online; Start over clears local + server draft
- [ ] Review completeness bar, clickable URLs, cover preview when verified
- [ ] Prefill from last submission; video form uses wizard shell
- [ ] Admin wizard group maps to artist step; apply `submission_form_drafts` from reset.sql

## Settlements / invoices
- [ ] Approve draft statement once → single `statement_payout`; second approve fails
- [ ] Create correction → original still visible to artist; approve correction → original superseded, ledger delta only
- [ ] Statement-linked invoice + full payment → open balance / carry-forward ~ 0 (no double negative)
- [ ] Invoice with 19% USt: payment can record gross PDF total
- [ ] Portal invoice against locked settlement period returns 422

## Corporate Identity
- [ ] Validate only approved CI colors are hardcoded in components
- [ ] Validate primary/secondary/background colors in rendered UI
- [ ] Verify icon usage is consistent with brand guidelines
- [ ] Verify typography and font hierarchy are consistent

## Accessibility (WCAG 2.1 AA)
- [ ] Verify keyboard-only navigation for header and main journeys
- [ ] Verify visible focus state for interactive elements
- [ ] Verify mobile touch targets meet 44×44 minimum
- [ ] Verify reduced motion preference is respected
- [ ] Run automated accessibility checks and manual spot checks

## Responsive Design
- [ ] Validate mobile navigation behavior and menu access
- [ ] Validate key layouts on desktop/tablet/mobile breakpoints
- [ ] Verify touch interactions and scrolling remain functional
- [ ] Verify no horizontal overflow issues

## Performance
- [ ] Verify homepage LCP remains below budget threshold
- [ ] Verify shared root bundle remains under configured budget
- [ ] Run Lighthouse CI assertions
- [ ] Validate performance tests in CI (`npm run perf:test`)

## Database & Sync
- [ ] Validate schema parity with `supabase/reset.sql`
- [ ] Validate artist/release/news sync jobs and cron triggers
- [ ] Validate RLS and role permissions for new tables/features
- [ ] Admin → Releases → "Sync All APIs": progress climbs with backlog (not stuck at 100% mid-run); spinner stays until drain or ~5 min timeout; toast reflects drained vs still-running; cover art lands on CDN without `getaddrinfo EBUSY` spam in sync logs; Odesli job reschedules cleanly under rate limit
- [ ] After release sync, public `/releases` and home release section show new visible non-promo releases (hard refresh OK; no need to wait full 1h TTL)
- [ ] Admin → Videos → "Sync YouTube Channel": admin list updates; public `/videos` updates after revalidation
- [ ] Full artist sync does **not** claim to update videos (YouTube is a separate action)
- [ ] `GET /api/sync/queue` with admin Bearer returns `{ pending, running, done, failed }` and does **not** enqueue jobs

## Documentation
- [ ] README reflects current setup and QA commands
- [ ] DEPLOYMENT guide is up to date
- [ ] AGENTS.md conventions remain aligned with implementation

## Test Execution
- [ ] Run unit tests (`npm run test`)
- [ ] Run E2E tests (`npm run test:e2e`)
- [ ] Run performance tests (`npm run perf:test`)
- [ ] Review visual regression outputs when relevant

## GDPR & Consent
- [ ] Cookie consent banner appears on first visit
- [ ] Spotify and YouTube iframes are blocked until consent is given
- [ ] Accepting consent loads embedded players
- [ ] Declining keeps embeds blocked indefinitely (until browser storage cleared)
- [ ] Page views are NOT sent to `/api/page-events` until consent is accepted
- [ ] Admin/portal/press routes are excluded from page-event tracking

## Internationalisation (i18n)
- [ ] Language switch EN↔DE in header works and persists via NEXT_LOCALE cookie
- [ ] All UI strings use dictionary keys (no hard-coded EN strings visible in DE mode)
- [ ] Locale-specific legal pages (/impressum, /datenschutz) reflect correct language

## PWA
- [ ] /manifest.webmanifest is accessible and valid
- [ ] Service worker registers without errors (DevTools → Application → Service Workers)
- [ ] Offline page /offline is served when network is unavailable
- [ ] PWA install prompt appears on Android/Chrome after 3 seconds (no errors in console)

## Newsletter DOI Flow
- [ ] Subscribe form submits → success message shown (no error)
- [ ] Pending row created in newsletter_subscribers table with status='pending'
- [ ] DOI email arrives within 2 minutes (check Resend dashboard)
- [ ] Clicking confirmation link flips status to 'subscribed'
- [ ] Re-submitting same email shows silent success (anti-enumeration)

## Artist Portal
- [ ] Artist user can log in at /portal
- [ ] PortalAccessGate shown for unlinked users (role=user)
- [ ] Profile edit saves bio, photo uploads to R2
- [ ] Feature-flagged modules hidden when flag is disabled
- [ ] `/portal/calendar` blocked when `artist.calendar` is disabled (direct URL shows disabled message)
- [ ] `/portal/analytics` tabs load (streaming, website, merch) when `artist.analytics` is enabled
- [ ] Overview intelligence panel shows insights with working deep links

## Fan Page
- [ ] `/portal/fan-page` accessible when `artist.fan_page` flag is enabled; shows disabled message otherwise
- [ ] Fan page editor saves sections, title, bio content
- [ ] Publish flow: draft → pending_review (or direct publish when `landing_publish_trusted` is set)
- [ ] Public URL `/@{slug}` renders the fan page; returns 404 for unpublished pages
- [ ] Admin review at `/admin/fan-page/review/[artistId]` accessible by admin only

## TRACK Tour Planner
- [ ] `/portal/tour-planner` accessible when `artist.tour_planner` flag is enabled; shows disabled message otherwise
- [ ] Create a tour; add stops; drag-reorder stops
- [ ] Stop detail: per-diems, rooming, hotel geocode, merch count-in/out/sold
- [ ] Tour settings: vehicle, planning mode, fuel/tolls budget lines
- [ ] Day sheet PDF and show settlement PDF export successfully
- [ ] Concert bridge: import a concert event → stop; publish stop → concert
- [ ] Admin read-only view at `/admin/tour-planner` loads for admin role

## Analytics & SOS Persist
- [ ] Accounting → Save to Portal persists territory metrics after CSV processing
- [ ] Merch tab shows data after Shopify/Darkmerch CSV + Save to Portal
- [ ] `/admin/analytics` Label Intelligence Hub loads (admin role only)
- [ ] Website engagement appears after accepting cookies on public artist pages

## ISR & Loading
- [ ] `/releases/[id]` and `/news/[slug]` pre-render at build time (`generateStaticParams`)
- [ ] Navigating to `/artists`, `/events`, `/news/[slug]`, `/fan/[slug]` shows loading skeleton before content
- [ ] Admin sub-pages (`/admin/features`, `/admin/settings`, etc.) show skeleton during navigation

## Journalist Dashboard
- [ ] /press/login accessible, /press/dashboard/* redirects to login when unauthenticated
- [ ] Role=journalist can access dashboard, role=user cannot
- [ ] Promo track stream URL expires after 5 minutes
- [ ] Global `promoPool` off hides `/promo-pool` and `/press/dashboard/promo-pool`
- [ ] `press.applications` off blocks `/press/apply` and journalist application API
- [ ] `press.contact` off blocks press inquiry form and `/press/dashboard/contact`
- [ ] `/admin/features` shows Global site toggles + Portal module flags sections

## Schema Parity
- [ ] Every column in supabase/reset.sql exists in src/types/database.ts
- [ ] Every table in database.ts has a corresponding CREATE TABLE in reset.sql

## Security
- [ ] Open DevTools Network tab — confirm SUPABASE_SERVICE_ROLE_KEY is never in any response
- [ ] /admin redirects to /admin/login for unauthenticated requests
- [ ] /portal/* redirects to /portal/login for unauthenticated requests
- [ ] /promo-pool/* requires journalist or admin role

## Edge Function
- [ ] Supabase Edge Function 'newsletter-confirm' is deployed and active
- [ ] Edge Function appears in Supabase Dashboard → Edge Functions
