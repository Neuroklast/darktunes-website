# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

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

### Fixed
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
