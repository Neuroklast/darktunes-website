# Pre-Release QA Checklist

## Functional Tests
- [ ] Validate all public routes load successfully (`/`, `/about`, `/artists`, `/releases`, `/news`, `/contact`, `/press`, `/offline`)
- [ ] Crawl internal links and confirm no broken links / 404 pages
- [ ] Validate dynamic routes for artist and release detail pages
- [ ] Homepage hero: featured release with long `promoText` shows teaser + ellipsis (not site-wide hero description); full promo on release detail; empty promo uses site `heroDescription` only
- [ ] Validate newsletter submission flow and confirmation message
- [ ] Validate media and upload features from admin/portal areas
- [ ] Admin → Releases → New Release: **Release Date** calendar opens above the modal, day selectable, form can save with today’s date
- [ ] Spot-check other modal date/month fields: Videos publish date, Expense date, Settlement period MonthField
- [ ] Homepage: wheel/trackpad scroll over **Videos** section continues page scroll (no dead zone on desktop)
- [ ] **Mobile homepage:** Footer Impressum / Datenschutz / AGB / Kontakt are tappable after dismissing consent/PWA banners; links wrap, not clipped
- [ ] **Mobile homepage scroll:** No vertical double-image / heavy stutter over Releases/Videos (native scroll on phone)
- [ ] **Portal EPK builder mobile:** Only one of Canvas / Layers / Properties; no side-by-side columns; compact toolbar + Save; canvas usable
- [ ] **Portal Personal Artist Page builder mobile:** Only one of Sections / Preview / Properties; Publish reachable; no double preview columns
- [ ] **Desktop builders ≥1024px:** Resizable three-column layout still works for EPK + Personal Artist Page
- [ ] Admin/Portal messages: open a label thread → original + replies show as chat bubbles (own on the right)
- [ ] New message while mailbox open → toast + optional chime; toggle Sound off/on persists after reload
- [ ] Inbox: multiple Re:/Aw: messages on same subject appear as **one** conversation (count badge); opening shows full chat
- [ ] Inbox sort: Newest / Unread first / Subject A–Z change list order
- [ ] Drag conversation onto a custom folder (or Trash) files/deletes the whole thread

## Security
- [ ] Verify unauthenticated users are blocked or redirected from protected routes (`/admin/*`, `/portal/*`, `/press/dashboard/*`, `/promo-pool/*`)
- [ ] Validate protected API endpoints reject missing/invalid authentication
- [ ] Confirm editor JWT cannot call finance APIs (`/api/admin/sales-statements/*`, `/api/admin/settlements/*`, `/api/admin/invoices/*`, `/api/admin/sos/*`) — expect 403
- [ ] Confirm `GET /api/health?mode=full` without auth returns 401; admin System Health widget still loads with Bearer token
- [ ] Admin System Health: a chatty API (many recent logs) does not force quieter configured APIs to “Awaiting first sync” / Never when they have older successful `sync_logs`
- [ ] After YouTube cron (or manual `/api/sync-youtube`), Health shows a youtube last-run + `sync_youtube` heartbeat; large channels do not OOM (cap 500)
- [ ] Confirm press-only news is absent from public `/news` and `/news/[slug]` but visible in press dashboard when published
- [ ] Confirm theme custom CSS cannot inject `</style><script>` breakout (sanitized to empty)
- [ ] Confirm `SUPABASE_SERVICE_ROLE_KEY` is never exposed in client HTML
- [ ] Validate RLS is enabled for sensitive database tables (apply `news_posts: public read` with `is_press_only = false` from `reset.sql`)
- [ ] Review CSP and security headers in production deployment
- [ ] Run vulnerability scan (`npm audit --production --audit-level=high`)

## Portal product feedback
- [ ] `/portal/feedback` loads form without requiring a manual artist pick; shows “Sending as {artist}”
- [ ] Single-artist account: submit works even if URL has no `artistId` (server resolve)
- [ ] Multi-artist: switcher changes active band; feedback submits for currently selected artist
- [ ] Submit requires category + message ≥20 chars; optional rating/subject; success toast + history refresh
- [ ] History expands message; status badges Received / Reviewed / Archived
- [ ] Admin `/admin/feedback` lists new by default; filters + search work; open row → mark reviewed / archive / reopen
- [ ] Unauthenticated `POST /api/portal/feedback` rejected; non-member artistId → 403
- [ ] Apply `portal_feedback` from `supabase/reset.sql` on live DB

## Portal interviews
- [ ] `/portal/interviews`: accept/reject + reply save works with `?artistId=`
- [ ] Delete interview request → confirm → removed from list; badge/count drops when it was pending
- [ ] Non-member / missing `artistId` cannot DELETE another artist's request

## Portal analytics split + Bandsintown
- [ ] Sidebar Dashboard shows **Spotify Trends** and **Sales Analytics** (flag `artist.analytics`)
- [ ] `/portal/spotify-trends` shows empty state when no presence data (not a wall of zeros)
- [ ] `/portal/sos-analytics` shows empty state when no SOS statements; tabs exclude Spotify presence
- [ ] `/portal/analytics` redirects to Sales Analytics (`/portal/sos-analytics`); `?tab=listeners` → Spotify Trends
- [ ] Profile → Integrations: save Bandsintown ID + API key; key masked after save (`hasApiKey`)
- [ ] Sync concerts from Integrations updates tour list when credentials valid

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

## Accounting wizard (DAU path)
- [ ] `/admin/accounting` shows Assistant as recommended; 5-step “what happens next” list
- [ ] Assistant: empty period → Continue disabled with plain reason; set months → Continue works
- [ ] Upload one CSV → coach checklist updates; Continue enabled only after numbers appear
- [ ] Block/throttle `/api/exchange-rates` → sticky fallback banner + Refresh; no crash on first process
- [ ] Validate step: blocking errors prevent Continue; warnings allow continue
- [ ] DE labels: Setup / Dateien / Automatik-Check / Auszahlungen / Veröffentlichen (no double “Prüfen”)
- [ ] Expense date = calendar picker; period = month picker; track owner % = percent field

## Portal / admin DAU assistants (1–5)
- [ ] `/portal/billing` assistant: legal → tax (3 statuses) → optional IBAN → invoice-ready / SEPA status
- [ ] `/portal/billing` with a **complete** profile opens the form directly (no mode chooser / setup guide); incomplete still starts assistant; `?mode=assistant` re-opens guide
- [ ] Statement CTA opens `/portal/invoices?statement=` assistant; quick-send shows confirm dialog
- [ ] Analytics + Statements invoice status parity (`label_approved` \| `artist_notified` \| `viewed`)
- [ ] `/portal/epk-builder` mode chooser → template → PDF/share → advanced editor
- [ ] `/portal/fan-page` mode chooser → template picker → checks → publish/review
- [ ] `/admin/release-submissions` assistant: queue → checklist → decision → optional draft

## Legal / billing compliance (DE/EU)
- [ ] Public `/impressum` shows company, representative, VAT-ID when set in Admin → Legal
- [ ] Public `/datenschutz` includes Artist Portal / 10-year retention section (default or CMS)
- [ ] Public `/agb` renders CMS or default templates with label placeholders filled
- [ ] Footer links: Impressum, Datenschutz, AGB/Terms
- [ ] Onboarding: AGB checkbox required before finish; skip still hits portal terms gate
- [ ] Existing artist with outdated `portal_terms_version` sees non-dismissible accept gate
- [ ] Billing: invalid IBAN rejected (local checksum only; no external bank API)
- [ ] Billing: EU VAT ID triggers VIES toast; reverse charge blocked without valid VIES
- [ ] Reverse-charge invoice blocked when VIES invalid or unavailable (422/503)
- [ ] Invoice PDF: §19 note / reverse-charge note / optional ECB FX footnote for non-EUR
- [ ] Re-issuing same invoice PDF is rejected (write-once)
- [ ] Admin Legal: AGB editors + version + label billing street/city fields save and revalidate

## Corporate Identity
- [ ] Validate only approved CI colors are hardcoded in components
- [ ] Validate primary/secondary/background colors in rendered UI
- [ ] Verify icon usage is consistent with brand guidelines
- [ ] Verify typography and font hierarchy are consistent

## Accessibility (WCAG 2.1 AA)
- [ ] Verify keyboard-only navigation for header and main journeys
- [ ] Verify visible focus state for interactive elements
- [ ] Verify mobile touch targets meet 44×44 minimum (Consent banner, PWA dismiss, Videos pagination, Contact submit, header menu)
- [ ] Contact form: invalid fields expose `aria-invalid` + error text via `aria-describedby`
- [ ] Verify reduced motion preference is respected
- [ ] Run automated accessibility checks and manual spot checks

## Security (public data / roles)
- [ ] Anon Supabase: `artists` select does not return `bandsintown_api_key` / email secrets after reset.sql apply
- [ ] Anon: `artist_epks` select denied or empty for `epk_password_hash`
- [ ] Anon: `videos` with `is_visible=false` returns no rows
- [ ] Role=`user` cannot list non-press assets; admin/editor file explorer still loads
- [ ] Artist detail HTML/Flight payload has no `bandsintownApiKey`
- [ ] Portal Bandsintown still shows `hasApiKey` and sync works after private-data migration

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
- [ ] Admin → System → **Advanced**: job table lists pending/running; cancel pending removes work; cancel running sets cancel-requested then job ends cancelled; retry failed re-queues
- [ ] Force Sync / Sync All: many artists drain continuously (executor self-chains); no manual re-kick every ~5 min while due jobs remain; rate-limited artists pause with cooldown while others proceed
- [ ] Stuck `running` jobs recover within ~6 minutes and stats GET unblocks re-kick
- [ ] Admin → System → Health: **no** infra setup (no CRON_SECRET / Supabase Cron / Edge Function / Vercel / R2 operator docs); speaking issues stay product-facing (Force Sync / technical operator), never expose secrets or cron schedules
- [ ] `vercel.json` has no `crons` key

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
- [ ] Flag language switcher in public header shows current language; choosing DE/EN/FR persists via NEXT_LOCALE cookie
- [ ] Same flag switcher works in admin sidebar, portal sidebar, and press dashboard
- [ ] **Admin sidebar labels update on language switch:** e.g. EN “Artists” / “Sign Out” → DE “Künstler” / “Abmelden” → FR “Artistes” / “Déconnexion” after reload (no leftover English menu)
- [ ] **Editor `/editor` chrome:** flag switcher present; tab labels + Sign Out follow locale after switch
- [ ] **Mailbox chrome (admin + portal):** sort options, system folder labels (Inbox/Starred/Sent/Trash), search placeholder, compose/sound toggles follow locale (not stuck in English)
- [ ] French UI: public shell + portal/admin strings load from `messages/fr`
- [ ] All UI strings use dictionary keys (no hard-coded EN strings visible in DE/FR mode)
- [ ] Locale-specific legal pages (/impressum, /datenschutz, /agb) reflect correct language (Impressum labels DE/EN/FR; CMS body DE/EN with FR→EN fallback)

## Overlay stack (modals)
- [ ] In Admin → Releases → New/Edit, Release Date calendar opens **above** the dialog (usable click targets)
- [ ] Select / dropdown menus inside dialogs are clickable (not hidden under overlay)
- [ ] Tooltips on controls inside dialogs remain visible

## PWA
- [ ] /manifest.webmanifest is accessible and valid
- [ ] Service worker registers without errors (DevTools → Application → Service Workers)
- [ ] Offline page /offline is served when network is unavailable
- [ ] PWA install prompt appears on Android/Chrome after 3 seconds (no errors in console)
- [ ] Install prompt copy is generic (no artist-only tour planner claims)
- [ ] After dismiss, Footer “Install app” / portal Settings / admin sidebar re-opens the prompt

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
- [ ] `/portal/sos-analytics` tabs load (streaming, website, merch) when `artist.analytics` is enabled
- [ ] Admin → API Keys can store Apify token; Accounting dry-run lists only **visible** artists/releases with Spotify links; live sync respects 1200 URL/month budget and shows clear errors if token missing/budget exhausted
- [ ] Portal Listeners tab shows Spotify (public) series after Apify sync (disclaimer: not settlement data)
- [ ] Spotify Trends: before this month’s public scrape, current calendar month is **not** shown as zeros (hint about pending refresh); after scrape, current month KPIs/trend include the new period
- [ ] Overview intelligence panel shows insights with working deep links

## Messaging (chat + notifications)
- [ ] Admin → Messages: open a conversation → reply box under the thread; send appears in chat without leaving the page
- [ ] Artist portal → reply to label message → staff get in-app notification / bell
- [ ] Admin compose or inline reply → artist gets portal message badge / toast / `label_message` notification when offline then returns

## Personal Artist Page
- [ ] `/portal/fan-page` accessible when `artist.fan_page` flag is enabled; UI labels say **Personal Artist Page**
- [ ] Editor saves sections, title, bio content
- [ ] Publish flow: draft → pending_review (or direct publish when `landing_publish_trusted` is set)
- [ ] Public URL `/@{slug}` renders the page; returns 404 for unpublished pages
- [ ] Admin review queue labels say Personal Artist Page Reviews
- [ ] Admin → Assets **Catalog storage** bar shows DB catalog total (Σ `assets.size_bytes`); refreshes after upload/delete
- [ ] Storage bar still loads after access token expiry (cookie fallback / retry without Bearer)
- [ ] If some assets have `size_bytes = 0`, bar shows “size unknown” warning (not silent undercount only)

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
