# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Product version lives in `package.json` and is shown in Admin → System Health.
Release ritual: [docs/RELEASING.md](docs/RELEASING.md).

## [Unreleased]

### Added
- **SOS Excel column presets:** Statement of Sales Excel export opens a dialog to pick sheets/columns and save named team presets on the accounting workspace.
- **Artist profile preview rows:** Admin → Settings can set how many **grid rows** of videos and news show on `/artists/[slug]` before an in-place **Show all** control (defaults: 2 rows each). Responsive columns match the existing grids (videos 1/2/3, news 1/2). Personal/Fan page unchanged.

### Fixed
- **SOS bronze hash / compilation:** Active import batches have a unique `file_hash` (failed batches may retry the same file). Compilation summary revenue is converted to EUR. Quoted CSV newlines stay in one row.
- **SOS ingest / FX / gold:** Parser records intentional skips (Bandcamp payout, empty lines, no-artist 0 €) instead of dropping them silently. Ambiguous slash dates follow the source calendar (Believe/Printful DD/MM, Bandcamp/Shopify/Darkmerch MM/DD). Historical FX no longer pre-seeds fallback rates for missing months. Empty currency is EUR with a wizard warning. Persist keeps bronze `row_count` and warns if gold revenue diverges from approved statements by more than €0.05. Reprocess uses the session FX and opening balances.
- **SOS statement workflow:** Status updates must follow `STATEMENT_TRANSITIONS` (illegal PATCH → 422). One draft per artist+period and one invoice per statement are unique in the database (race-safe). Archive still does not require a prior lock; there is no unlock/unpay in the app.
- **SOS money / ledger:** Period payout (`amount_eur` / `finalPayout`) is period activity only — opening balance is a separate line and next-period `carry_in`. Carry-forward uses ledger outstanding cents (not recomputed invoice GROSS). Track splits must total 100% or they block the wizard and do not leak residual revenue. Invoice payment does not post a second ledger row after `invoice_liability`, and sets `received_at` if it was still empty.
- **Accounting drafts crash / silent errors:** `app/error.tsx` now reports render crashes to `/api/log-error`; chunk-load reload happens at most once per error. Statement history join, invalid period dates, and draft-create failures no longer take down the admin app. Settlement register reads an existing period (no write-on-GET) and loads ledger balances in one query.

### Changed
- **Public Lenis feel:** Wheel uses lerp-only smoothing (`0.08`) so mouse notches interpolate instead of restarting a 1.1s ease. Anchor jumps keep a timed scroll. Official `lenis.css` imported.
- **Dependencies (Dependabot #554–#558):** `marked` 15→18, `@radix-ui/react-label` 2.1.15, `@radix-ui/react-menubar` 1.1.24, `@radix-ui/react-slider` 1.4.7, `@vitejs/plugin-react` 6.0.5.
- **Dependencies (Dependabot groups #562–#564):** `@radix-ui/*` patch/minor batch, `@aws-sdk/*` 3.1106.0, `eslint` 9.39.5, `eslint-config-next` 16.3.0, `typescript-eslint` 8.66.0.
- **Dependencies (Dependabot #566–#569):** `framer-motion` 12→13, `@tanstack/react-query` 5.101.4, `@tailwindcss/postcss` 4.3.3.
- **Dependencies (Dependabot #570–#571):** `@vercel/functions` 3.9.1, `vitest` 4.1.10.

## [1.6.0] — 2026-08-11

### Added
- **SemVer release process:** App version in `package.json` (no longer `0.0.0`); annotated git tags; `scripts/release.mjs` (`npm run release:check` / `release` / `release:tag`); full ritual in `docs/RELEASING.md`. Historical tags `v1.0.0`–`v1.5.0` label past product waves.
- **App identity in health:** Full health snapshot includes `app.version` + `app.commit` (`src/lib/appVersion.ts`); Admin → System Health shows `vX.Y.Z · sha`.
- **PWA Web Push + app icon badge (portal + admin):** One-tap **Enable** banner. Subscriptions in `push_subscriptions`; per-event `notification_preferences.push`; `emitNotification` sends Web Push via VAPID/`web-push` when configured. Service worker handles `push` / `notificationclick` and Badging API.
- **CI mobile layout contract:** `npm run check:mobile-layout` in `ci:contracts` — bans CSS-only hide of ResizablePanelGroup, requires `useIsLg` on builder shells, full-bleed fan-page parity, footer touch targets.
- **Portal unified calendar:** Always available for artists. Month grid shows **releases + live events** with kind toggle, ownership filter, and search. Event detail dialog; cached concerts via `getCachedCalendarConcerts`.

### Fixed
- **Admin realtime crash:** Single `AdminNavBadgesProvider` owns the postgres_changes subscription; consumers use context (fixes double-subscribe with push bootstrap).
- **E2E suite PR (#496):** Local Supabase stack; Chrome-only matrix on PRs; centralized `/login`; portal section specs for split analytics routes.
- **Portal release calendar load time:** Slim nested select + `getCachedCalendarReleases` instead of heavy `select(*)` batches.
- **Portal mailbox on mobile:** Messenger-style list OR full-screen chat; folders in sheet; 44px targets; sticky composer.
- **EPK + Personal Artist Page builders on mobile:** Mount `ResizablePanelGroup` only at `lg+` via `useIsLg()` (inline `display:flex` broke Tailwind `hidden`).
- **Homepage footer legal links (mobile):** 44px touch targets; no overflow clipping.
- **Mobile public scroll ghosting:** Lenis `syncTouch: false`; VFX lite mode; ScrollReveal clears permanent `will-change`.
- **Admin Assets storage bar:** Stale Bearer falls back to cookies; multi-strategy catalog totals; clearer zero-size UI.
- **Portal Spotify Trends — current month:** In-progress month only after public presence data exists; no invented Spotify zeros.
- **Admin messages chat:** Inline reply under conversation (not only Compose link).
- **Message reply notifications:** Label→artist and artist→staff emits for mailbox replies.

### Changed
- **Public Lenis feel:** Buttery document scroll; coverflow/related strips no longer blanket `data-lenis-prevent`.
- **Scroll VFX budget:** `html[data-scrolling]` pauses CRT/grain/chromatic and drops permanent `will-change` on glow cards.
- **Spotify embed overlay:** Wheel uses Lenis virtual scroll (`lenis.scroll + delta`).
- **Portal fan-page shell:** Full-bleed `lockScroll` + `p-0` parity with EPK builder.
- **Agent / CI process (phase-1):** `AGENTS.md` session-start; `npm run ci` phases; PR template docs checklist; schema-columns fails on `supabase/migrations/*`.
- **Portal billing:** Complete profiles open full form directly (assistant for incomplete / `?mode=assistant`).
- **Portal nav label:** **SOS Analytics** → **Sales Analytics** (route/keys unchanged).
- **Dependabot:** Weekly schedule + grouped updates (less daily version noise).

## [1.5.0] — 2026-08-07

### Security
- **Debt cleanup (overlay / over-fetch / brand UA):** Portaled HoverCard, ContextMenu, Tooltip at `z-[10000]` with CI `check:overlay`; Drawer aligned to Dialog stack; auth/role/file-explorer selects column-whitelisted; outbound User-Agents via `src/lib/brand/userAgent.ts`; residual risks in `SECURITY.md` / debt inventory.
- **Public artist DTOs:** Column whitelist only (`PUBLIC_ARTIST_COLUMNS`); no secrets/PII in public payloads.
- **`artist_private_data` table:** Secrets/PII dual-written; RLS staff/member only; cleared from `artists` after backfill.
- **RLS tighten:** Videos `is_visible` (or staff); assets/folders staff-only read; `artist_epks` not public-read; `site_settings` public key allowlist.
- **Public EPK:** Service-role server path only (`getPublicArtistEpkByArtistId`).

### Added
- **French locale (`fr`):** Flag switcher; full `src/i18n/messages/fr/*`; Accept-Language + cookie detection.
- **Mailbox as conversations:** Portal + admin thread grouping (`Re:`/`Aw:`/`Fwd:`); chat timeline; sort; drag to folders; optional chime.

### Changed
- **Sync executor continuous drain:** Self-chains across Vercel duration slices; owner-token lease; stuck-job recovery; rate-limited artists cool down while others drain.
- **Admin System Health — no infra ops UI:** Product-facing Force Sync / API Keys only; hosting/cron remains in `DEPLOYMENT.md`.
- **Personal Artist Page rename:** User-facing “Fan Page” → **Personal Artist Page** (routes/keys unchanged).
- **Assets storage bar:** Cookie+Bearer auth, robust RPC/paginated totals, file count + clearer errors.
- **Mailbox chrome i18n:** Admin/portal sort, folders, compose/sound labels (en/de/fr).
- **Newsletter confirm Edge function:** Brand name from env (no hard-coded label).
- **Dependabot batch (#518–#522):** Radix avatar/context-menu, hookform resolvers, typescript-eslint, vite plugin-react.
- **Locale UX:** Flag switcher on public/admin/portal/press; PWA install re-openable; legal i18n DE/EN/FR; higher-res logo proxy.

### Fixed
- **Homepage scroll over Videos:** Lenis prevent only for real nested scrollports.
- **Date/month pickers in modals:** Popover/DropdownMenu `z-[10000]` above Dialog.
- **Admin/editor chrome language:** Sidebar/tabs via `admin.nav` / `pwa`; exact path matching for active nav.
- **Bundle budget / homepage anchors / npm audit overrides / a11y touch targets.**
- **Locale + PWA dashboard bugs:** No NetworkFirst cache of dashboard HTML; SW install/hide standalone.
- **Health “Never” / buried last-runs:** Latest `sync_logs` per API source, not global recent-N window.
- **Cron heartbeats reliability** and **YouTube sync ops** (cap 500, structured logs, preserve admin-hidden visibility).
- **Hero promo vs site description:** Item promo/excerpt wins over global hero description.

## [1.4.0] — 2026-07-29

### Added
#### Product & compliance
- **Portal analytics split:** **Spotify Trends** + **SOS Analytics** (legacy `/portal/analytics` redirects); empty states when source has no data.
- **Portal Bandsintown credentials:** Profile → Integrations; concert sync.
- **Artist portal product feedback:** `/portal/feedback` + admin inbox `/admin/feedback` (`portal_feedback`).
- **VIES + local IBAN + ECB FX on invoices:** Live VIES for reverse charge; ISO 7064 IBAN; non-EUR FX on PDF.
- **Legal multi-tenant + §14 UStG / GoBD:** Public `/agb` templates, portal AGB opt-in, write-once invoice PDFs + `pdf_sha256`.
- **Statement source proof (chain of custody):** Trust banner, provenance, streamed source CSV.
- **Public metrics disclaimer** on portal analytics / PDF (Spotify presence vs SOS settlement truth).

#### Portal & admin product
- **Portal analytics hub polish:** Dual-axis Spotify presence, donuts, period presets, series prefs, PDF/CSV, assistant.
- **Apify Spotify public play counts:** Admin dry-run/sync; monthly URL cap; never writes SOS gold.
- **Sync control plane (Guided / Advanced):** Health checklist, live `sync_queue`, cancel/retry APIs.
- **Portal/Admin DAU assistants:** Billing SEPA, invoice-from-statement, EPK share, fan-page publish, release review, Accounting wizard + FX.
- **Admin release submissions (Eingang):** Artist, desired date, status, CSV/Excel export + column prefs.
- **Messaging M0–M2:** Pagination, receipts, rules, attachments, domain send, shared inbox (claim, priority, notes, audit, export).
- **Notification platform (Phase 1–3):** Unified `notifications` + catalog emit; bells, history, preferences.
- **Invite pipeline:** Link validity, resend, password policy, rate limits, durable `user_invites`.
- **Message compose pages:** `/admin/messages/compose`, `/portal/messages/compose`.
- **Custom role assignment** on admin user detail.
- **Portal release/video submission wizards** + server drafts + cover verification + idempotency.
- **Asset storage stats RPC** `get_assets_storage_stats()`.
- **Enterprise analytics:** Portal hub + admin Label Intelligence; gold tables; page events; merch pipeline.
- **Portal document vault, calendar, interviews, onboarding, help FAQ, video submission.**
- **Admin accounting / system / release & video submissions**; read-replica client; maintenance APIs.
- **ISR + loading skeletons + metadata** for cold public/admin routes.

### Fixed
- Portal notification bell read state (`message_receipts`); feedback always uses active artist.
- Waterfall top-track dedupe; Apify Force Sync route; Advanced sync jobs 500; Accounting FX race/field UX.
- Portal hometown 500; admin overview server-side counts; SW admin nav preload; ESLint cleanups.
- ArtistsManager create-only dialog; ColorThemeManager deps; SECURITY.md upload limits.

### Changed
- GitHub Actions speed (parallel jobs, caches, PR E2E Chrome-only).
- API SOTA contract verifies; portal membership write helpers; admin dual-auth; upload SSOT limits; rate limits.
- Invite pipeline hardening; assets storage/assign; mailbox i18n + compose draft; settlements/invoice/sync reliability.
- Health full mode requires admin Bearer or `CRON_SECRET`; SOS webhook removed (Server Action only).
- News press-only excluded from public; finance APIs admin-only; theme CSS XSS sanitization.

### Performance
- Image path cleanup: Next optimizer / CDN; `sizes` on fill images; `priority` on LCP heroes.

### Refactored
- Centralized `createPublicSupabaseClient`; press detail `React.cache()`; dead-code cleanup (legacy UI, workers, orphaned maintenance chain).

## [1.3.0] — 2026-07-11

### Added
- **Messaging foundations** and shared inbox groundwork toward M0–M2 (lists, receipts path, compose surfaces).
- **Invite pipeline** early iterations (link validity, resend, stronger password policy).
- **Portal release/video submission** schema-driven forms and admin review surfaces (mid-summer wave).
- **Admin accounting / system** product surfaces and maintenance APIs continued expansion.

### Changed
- CI and API contract tooling expansion (schema-column / API-contract verifies).
- Portal mailbox i18n and compose draft URL prefill behavior.

### Fixed
- Editor link dialog / list inline fixes; submission form schema seed columns; editor notification channel duplicates.

## [1.2.0] — 2026-07-01

### Added
- **Portal enterprise product platform:** document vault, calendar, interviews, onboarding, help FAQ foundations.
- **Release-type submission forms:** schema-driven fields + type rules (`submission_form_schema`, track count rules).
- **Admin release & video submissions** review queues.
- **Enterprise analytics foundations:** gold tables path, portal analytics hub beginnings, admin Label Intelligence groundwork.
- **ISR + loading skeletons** for previously cold routes.

### Changed
- Sync reliability improvements (R2 retries, executor lease, Odesli throttle patterns).
- Settlements/invoice idempotency and finance access hardening groundwork.

## [1.1.0] — 2026-06-06

### Added
- **Statement of Sales Email Notifications**: Artists receive an automatic email via Resend when a new statement is uploaded. Email includes period, optional amount, and link to `/portal/statements` for secure download.
- **Admin Statements Manager**: New read-only tab in Admin dashboard to monitor all uploaded statements across all artists.

### Changed
- `sendStatementNotification()` is called after every successful `sales_statements` insert (non-blocking).

## [1.0.0] — 2026-05-15

### Added
- **Initial darkTunes platform:** Public label site (hero, artists, releases, news, videos, tour, Spotify), admin CMS, artist portal foundations, Supabase auth/RBAC, Cloudflare R2 media, Vercel deploy, iTunes/Odesli-oriented catalog sync, CRT/Lenis public aesthetic.

[Unreleased]: https://github.com/Neuroklast/darktunes-website/compare/v1.6.0...HEAD
[1.6.0]: https://github.com/Neuroklast/darktunes-website/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/Neuroklast/darktunes-website/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/Neuroklast/darktunes-website/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/Neuroklast/darktunes-website/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/Neuroklast/darktunes-website/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/Neuroklast/darktunes-website/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/Neuroklast/darktunes-website/releases/tag/v1.0.0
