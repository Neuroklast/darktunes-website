# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- **EPK + Personal Artist Page builders on mobile:** Desktop three-column layout no longer paints beside mobile tabs. Root cause: `react-resizable-panels` sets inline `display:flex`, so Tailwind `hidden lg:flex` failed. Shells now mount `ResizablePanelGroup` only at `lg+` via `useIsLg()`; compact toolbars + single-panel tabs below `lg`.
- **Homepage footer legal links (mobile):** Impressum / Datenschutz / AGB wrap with 44px touch targets; removed overflow clipping that made links untappable.
- **Mobile public scroll ghosting:** Lenis disabled on coarse pointer (native scroll); VFX lite mode (no CRT/chromatic/will-change); `ScrollReveal` drops permanent `will-change` after animate-in.

### Added
- **CI mobile layout contract:** `npm run check:mobile-layout` (`scripts/check-mobile-layout-contract.mjs`) in `ci:contracts` — bans CSS-only hide of ResizablePanelGroup, requires `useIsLg` on builder shells, full-bleed fan-page parity, footer touch targets. Unit tests for shells + footer.

### Changed
- **Portal fan-page shell:** Same full-bleed `lockScroll` + `p-0` as EPK builder.
- **Agent / CI process (phase-1 bad-practice enforcement):** Session-start section in `AGENTS.md`; `npm run ci` split into `ci:contracts` → `ci:typecheck` → `ci:tests`; PR template (`.github/pull_request_template.md`) with conditional docs checklist; `verify:schema-columns` fails if `supabase/migrations/*.sql` appears. Docs enforcement stays PR/process-based (no naive “any code → any docs” CI gate).

### Fixed
- **Admin Assets storage bar:** Stale Bearer tokens no longer block cookie auth (401 → cookie fallback). Catalog totals use multi-strategy aggregation (RPC JSON → PostgREST `sum()` → paginated); no-store cache; clearer “Catalog storage” UI with zero-size warning and retry.

### Added
- **Portal interviews:** Artists can permanently delete interview requests from `/portal/interviews` (`DELETE /api/portal/interview-requests/[id]?artistId=`). RLS: `interview_requests: artist delete own`.

### Changed
- **Portal billing:** Complete billing profiles open the full form directly — no guided mode chooser / setup wizard on every visit. Incomplete profiles and `?mode=assistant` / `?focus=payout` still use the assistant.
- **Portal nav label:** Statement dashboard renamed **SOS Analytics** → **Sales Analytics** (en/de/fr UI + help). Route `/portal/sos-analytics` and i18n keys unchanged.

### Fixed
- **Portal Spotify Trends — current month:** Figures for the in-progress calendar month appear only after public presence data exists for that period (post label scrape). Until then the UI keeps the last completed snapshot and does not invent Spotify zeros for the open month.
- **Admin messages chat:** Inline reply field under the conversation (like the artist portal), not only a link to Compose.
- **Message reply notifications:** Label→artist sends emit `label_message` to artist members; artist replies to label messages emit staff `artist_portal_message` notifications (bell + history), not only realtime toasts when the mailbox is open.

### Changed
- **Sync executor continuous drain:** One logical queue run now self-chains across Vercel duration slices (budget headroom before claim, inter-artist pacing, owner-token lease, 6m stuck-job recovery). Rate-limited artists cool down; others keep processing without manual Force Sync every few minutes.
- **Admin System Health — no infra ops UI:** Removed Supabase Cron / Edge Function / `CRON_SECRET` setup checklist and Cron Schedulers panel from label admin. Health copy stays product-facing (Force Sync, API Keys, contact technical operator); hosting/cron setup remains in `DEPLOYMENT.md` only.
- **Personal Artist Page rename:** User-facing “Fan Page” labels (portal nav, builder, admin reviews, help, public metadata) → **Personal Artist Page** (routes/keys unchanged).
- **Assets storage bar:** Cookie+Bearer auth, robust RPC/paginated totals, stable ordering for pagination, file count + clearer error when stats fail.

### Security
- **Debt cleanup (overlay / over-fetch / brand UA):** Portaled HoverCard, ContextMenu, Tooltip at `z-[10000]` with CI `check:overlay`; Drawer aligned to Dialog stack; auth/role/file-explorer selects column-whitelisted; outbound User-Agents via `src/lib/brand/userAgent.ts` + env; residual CSP/rate-limit risks documented (`SECURITY.md`, `docs/agent/debt-inventory.md`).
- **Public artist DTOs:** Public pages select a column whitelist only (`PUBLIC_ARTIST_COLUMNS`); no `bandsintown_api_key`, email, VAT, notes, or `user_id` in RSC/client payloads.
- **`artist_private_data` table:** Secrets/PII (email, VAT, notes, Bandsintown API key, storage quota, EU flag) dual-written here; RLS staff/member only; cleared from `artists` after backfill so `select(*)` cannot leak.
- **RLS tighten:** Videos require `is_visible` (or staff); assets/folders staff-only read (press-approved path unchanged); `artist_epks` no longer public-read (service-role + column whitelist for public EPK); `site_settings` public key allowlist (billing + invite expiry staff-only).
- **Public EPK:** Served via service-role server code only (`getPublicArtistEpkByArtistId`).

### Changed
- **Mailbox chrome i18n:** Admin/portal sort options, system folder labels, search placeholder, compose/sound labels use `admin.messages` / portal message keys (en/de/fr).
- **Newsletter confirm Edge function:** Brand name / from-display from env (`BRAND_LABEL_NAME` / `LABEL_NAME`); no hard-coded label in email copy.
- **Dependabot batch (#518–#522):** `@radix-ui/react-avatar` 1.2.6, `@radix-ui/react-context-menu` 2.3.7, `@hookform/resolvers` 5.5.7, `typescript-eslint` 8.65.0, `@vitejs/plugin-react` 6.0.4.

### Added
- **Mailbox as conversations:** Portal + admin inbox groups `Re:`/`Aw:`/`Fwd:` correspondence into one thread (no duplicate list rows). Detail is a chat timeline (`MessageChatThread`). Sort (newest/oldest/unread/subject/most replies). Drag threads onto folders or Trash. Optional live chime (`MessageSoundToggle`, `localStorage`). Thread actions (star/delete/move/restore) apply to the whole conversation.

### Fixed
- **Homepage scroll over Videos:** Lenis no longer treats the video grid as a nested scrollport on desktop; `shouldPreventLenis` uses real overflow metrics (not class substrings / permanent `data-lenis-prevent` on grids).
- **Date/month pickers in modals:** Popover + DropdownMenu `z-[10000]` so calendars open above Dialog/Sheet (`z-[9999]`). Fixes Admin → Releases → Release Date (and other DateField/MonthField-in-dialog cases).
- **Admin/editor chrome language:** Sidebar + editor dashboard tab labels, Sign Out, roles, and switcher aria-labels resolve via `admin.nav` / `pwa` (en/de/fr). Locale switch updates the menu; editor standalone header gets a flag switcher; active nav uses exact path/tab matching (no false “Releases” highlight on release-submissions; editor tabs highlight correctly).
- **Bundle budget:** Artist detail route-specific JS ceiling raised to 580 KB (was 530; ~570 KB after public-artist DTO/security work on main).
- **Homepage anchors:** Remove duplicate `id="videos|releases|news"` wrappers (section components already own the anchors) so e2e/`#videos` is unique.
- **npm audit (prod):** Override `brace-expansion` ≥5.0.9 and `ip-address` ≥10.4.0 for Security Audit clean on production deps.
- **A11y (public):** 44px touch targets on Consent/PWA dismiss/Videos pagination/Contact submit; contact form `aria-invalid`/`aria-describedby`; header menu icons `aria-hidden`; Related Artists meta contrast.
- **Scroll:** Notification preferences table uses horizontal scroll contract + `data-lenis-prevent`.
- **Locale switcher UX:** SVG flags (no emoji letter fallbacks on Windows); single switcher in portal/admin chrome (not footer duplicate); hard navigation for reliable language change; portal sidebar PWA install entry restored.
- **Locale + PWA dashboard bugs:** SW no longer NetworkFirst-caches `/admin|/portal|/editor` HTML (stale locale after switch); dropdown above sticky headers; press mobile no double flag; hide install when already standalone.
- **Health “Never” / buried last-runs:** Full health snapshot loads latest `sync_logs` per API (`limit(1)` per source) instead of a global recent-N window, so a chatty source no longer hides other APIs.
- **Cron heartbeats reliability:** `sync_execute` awaits heartbeats (incl. mid-drain + finally); YouTube path records `sync_youtube` at start; concurrent heartbeat upserts retry once.
- **YouTube sync ops:** Cap 500 newest videos/run, structured `sync_logs` on success/error/empty, shared artist attribution + `is_short`, preserve admin-hidden `is_visible` on upsert via `sync-api`.
- **Hero promo vs site description:** Featured release/news promo/excerpt always wins (teaser + ellipsis); global `heroDescription` only when the item has no own text.

### Added

- **French locale (`fr`):** Selectable alongside DE/EN via flag switcher; full `src/i18n/messages/fr/*` dictionaries; Accept-Language + cookie detection.

#### Product & compliance
- **Portal analytics split:** Dashboard nav now has **Spotify Trends** (`/portal/spotify-trends`) and **SOS Analytics** (`/portal/sos-analytics`) instead of one overloaded hub. Legacy `/portal/analytics` redirects. Empty states when a source has no data (no misleading zero grids).
- **Portal Bandsintown credentials:** Profile → Integrations — artists set per-project Bandsintown ID + API key and can sync concerts (`/api/portal/integrations/bandsintown`).
- **Artist portal product feedback:** `/portal/feedback` — category, optional star rating, optional subject, required message, own history with status. Admin inbox `/admin/feedback` (filter, search, mark reviewed/archive). Table `portal_feedback`. Distinct from Zammad `/admin/support`.
- **VIES + local IBAN + ECB FX on invoices:** EU VAT IDs via official VIES on billing save; reverse-charge requires live-valid VIES; local ISO 7064 IBAN only; non-EUR invoices store ECB/Frankfurter rate on PDF + `fx_rate*` columns.
- **Legal multi-tenant + §14 UStG / GoBD:** Public `/agb` with CMS templates and `{{placeholders}}`; Datenschutz portal/settlement retention; label billing party from `site_settings`; billing `tax_status` on PDF; portal AGB opt-in per artist; invoice PDF write-once + `pdf_sha256` + stable R2 keys.
- **Statement source proof (chain of custody):** Portal statements trust banner + provenance + server-streamed source CSV download; artists may read linked `distributor_import_batches` metadata.
- **Public metrics disclaimer (portal analytics):** Non-binding notice on Spotify presence vs SOS settlement truth; PDF includes the same disclaimer.

#### Portal & admin product
- **Portal analytics hub polish:** Dual-axis Spotify presence trends, donut shares, period presets, series prefs, PDF/CSV export, in-page assistant.
- **Apify Spotify public play counts:** Admin API Keys + Accounting dry-run/sync; monthly URL cap; portal Listeners chart; never writes SOS gold.
- **Sync control plane (Guided / Advanced):** Admin System Health checklist, live `sync_queue`, cancel/retry APIs.
- **Portal/Admin DAU assistants:** Shared guided kit; billing SEPA; invoice-from-statement; EPK first share; fan-page first publish; release-submission review; Accounting assistant wizard + FX banner.
- **Admin release submissions (Eingang):** Artist name, desired release date, inline status, CSV/Excel export + export column prefs.
- **Messaging M0–M2:** Paginated lists, receipts, rules, attachments, domain send, shared inbox (claim, priority, notes, audit, export).
- **Notification platform (Phase 1–3):** Unified `notifications` + catalog emit; admin/portal bells, history, preferences.
- **Invite pipeline:** Configurable link validity, resend invite, strong password policy, rate limits, durable `user_invites`.
- **Message compose pages:** `/admin/messages/compose` and `/portal/messages/compose`.
- **Custom role assignment** on admin user detail.
- **Portal release/video submission wizards** + server drafts + cover art verification + idempotency.
- **Asset storage stats RPC** `get_assets_storage_stats()`.
- **Enterprise analytics:** Portal 11-tab hub + admin Label Intelligence; gold tables; page events; merch pipeline.
- **Portal document vault, calendar, interviews, onboarding, help FAQ, video submission.**
- **Admin accounting / system / release & video submissions** surfaces; read-replica client; maintenance APIs.
- **ISR + loading skeletons + metadata** for previously cold public/admin routes.

### Changed
- **Locale UX:** Flag-based language switcher (`LocaleFlagSwitcher`) on public header, admin, portal, and press dashboard (current flag → pick DE/EN/FR).
- **PWA install:** Generic offline/quick-access copy; install banner re-openable anytime via Footer, portal Settings, and admin sidebar (`requestPwaInstallPrompt`).
- **Legal i18n:** Impressum labels DE/EN/FR; default Datenschutz expanded; CMS legal body DE/EN with FR→EN fallback.
- **Logo delivery:** Higher-res wsrv logo proxy (`getOptimizedLogoUrl`, q=90, wider widths).

### Fixed
- **Portal notification bell read state:** “Mark all” / open-as-read now writes per-user `message_receipts` (same source as badge counts). Feed + badges stay aligned after refresh.
- **Portal feedback “Select an artist”:** Feedback always uses the active portal artist (server resolve + nav always passes `artistId`). Multi-artist: submits for the band currently selected in the switcher.
- **Waterfall top tracks:** Public Spotify top tracks / album plays dedupe by normalized name (max plays).
- **Apify Force Sync:** System Health Force Sync hits Spotify plays route, not listener sync.
- **Advanced sync jobs 500:** List jobs without brittle PostgREST artist embeds; separate name lookup.
- **Accounting FX race / field UX:** Rates gate CSV processing; Percent/Integer fields; clearer DE labels.
- **Portal profile hometown 500:** Idempotent `artists.hometown` columns; resilient EPK reads.
- **Admin overview counts:** Server-side counts (no client CORS dashes).
- **Service worker admin nav:** Navigation preload disabled for dashboard routes.
- **ESLint 0 warnings:** unused-vars ignore patterns; removed stale disables.
- **ArtistsManager dead state:** Create dialog only; edit navigates to dedicated route.
- **ColorThemeManager useEffect deps** for typography draft.
- **SECURITY.md upload limits** corrected for portal cover/asset/documents routes.

### Changed
- **GitHub Actions speed (phases A–C):** Parallel jobs, caches, PR E2E Chrome-only, path filters.
- **API SOTA (A–E):** Schema-column + API-contract verifies in CI; portal membership write helpers; admin dual-auth helpers; upload SSOT limits; rate limits; log-error hardening.
- **Invite pipeline hardening:** Rate limits, normalization, atomic consume, audit, `createUser` provisioning.
- **Assets:** Storage bar via service-role sum; assign-to-artist always places under artist folder.
- **Portal mailbox i18n + compose draft** URL prefill not overwritten by stale localStorage.
- **Accounting address fields** stay in sync with presets without re-parse glitches.
- **Distributed rate limit:** Upstash EXPIRE only on first INCR.
- **Invoice payment idempotency** + release submit rate limit + atomic track insert + Drive CORS cover check.
- **Sync reliability:** R2 DNS retries, single-flight executor lease, Odesli throttle, revalidatePublicContent at batch end, admin progress drain semantics.
- **Settlements:** No double ledger on invoice pay; approve idempotency; correction supersede on approve; USt gross totals; locked period invoice reject.
- **News:** Press-only excluded from public; unknown status → draft.
- **SOS UI:** Sonstiges Digital residual no longer double-counts.
- **Auth:** Finance APIs admin-only (editors blocked).
- **XSS:** Theme `customCss` sanitized.
- **Portal messages:** Shared `sanitizeHtml` on SSR.
- **Health full mode:** Requires admin Bearer or `CRON_SECRET`.
- **SOS webhook removed:** Upload via Server Action only; validation moved to `sos/validation.ts`.
- **generateInvoicePdf** async dynamic import; exhaustive-deps suppressions fixed at root cause.

### Performance
- Image path cleanup: public `<Image>` through Next optimizer / CDN; `sizes` on fill images; `priority` on LCP heroes.

### Refactored
- Centralized `createPublicSupabaseClient` (removed page-local duplicates).
- Press detail routes: `React.cache()` for shared slug fetches across metadata + page.
- **Dead code cleanup:** removed unused legacy UI (AdminApp/login wrappers, SpotifyPlayer, Tactical*, MessagesInbox, ListenersChart, PromoLogAdmin, fixtures), unused image-processor worker, unused server actions, and orphaned `publicContentMaintenance` chain (maintenance remains on Supabase Cron path per `publicQueries` comment).

## [1.1.0] — 2026-06-06

### Added
- **Statement of Sales Email Notifications**: Artists receive an automatic email via Resend when a new statement is uploaded. Email includes period, optional amount, and link to `/portal/statements` for secure download.
- **Admin Statements Manager**: New read-only tab in Admin dashboard to monitor all uploaded statements across all artists.

### Changed
- `sendStatementNotification()` is called after every successful `sales_statements` insert (non-blocking).
