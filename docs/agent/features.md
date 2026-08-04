# Portal, Press & Product Features

## Artist Portal (`/portal/*`)

| Topic | Rule |
|-------|------|
| Auth | Edge middleware + Supabase session; membership via `hasPortalArtistMembership()` (`artist_members`), not JWT metadata |
| Tenancy | `resolvePortalArtist(db, userId, artistId)` with `?artistId=`; `getArtistByUserId()` deprecated for portal |
| IoC | RSC pages fetch data; `"use client"` leaves receive props — no direct `fetch`/Supabase in leaves |
| Nav | `portal_feature_flags` gates modules; Settings always visible; onboarding when profile incomplete |
| Presigned URLs | `src/lib/portal/presignedUrl.ts` — 5 min GET, 15 min PUT; wired in `statements/_actions/presignedUrl.ts` |
| Bearer auth | Portal route handlers use `authenticatePortalBearer()` from `src/lib/portal/bearerAuth.ts` |
| Writes | Membership first; many routes then use **service role** (pragmatic). Target: user JWT + RLS — see [portal-write-auth.md](portal-write-auth.md) |

**Billing & invoices:** `artist_billing_profiles` at `/portal/billing`. `tax_status` (`standard` | `small_business` | `reverse_charge`) drives §14 UStG PDF tax lines. `isBillingProfileComplete()` required before PDF generation. `InlineBillingProfileStep` gates: `/portal/invoices` (`InvoiceForm`, `FreeInvoiceGenerator`), `/portal/analytics` (Earnings), `/portal/statements` (quick invoice). SOS-linked flow: `/portal/invoices?statement={id}` → `artist_invoice_number` + `sales_statements.status = 'invoiced'`. Label recipient party from `site_settings` via `resolveLabelBillingParty()` (never hardcode). Issued PDFs are write-once (`pdf_sha256`, stable R2 key `invoices/{artistId}/{invoiceId}.pdf`). Billing profile changes log to `financial_audit_events` (IBAN masked).

**VIES / IBAN / FX (compliance helpers):**
- **EU VAT (VIES):** `checkVatWithVies()` → Commission REST API on billing save; reverse-charge requires live valid VIES at save **and** invoice create. Snapshot: `vat_vies_*` columns.
- **IBAN:** local only — `src/lib/sos/iban-validator.ts` (ISO 7064). Enforced on `POST /api/portal/billing-profile`. **Never** call third-party IBAN APIs (DSGVO).
- **ECB FX:** Frankfurter already powers SOS (`/api/exchange-rates`). Non-EUR invoices fetch `getEcbRateForCurrency()` and store `fx_rate` / `fx_rate_date` / `fx_rate_source` + PDF footnote.

**Legal (multi-tenant):** Public `/impressum`, `/datenschutz`, `/agb`. CMS keys `agb_content` / `agb_content_en`, `portal_terms_version`, label billing address fields. Templates support `{{labelName}}`, `{{address}}`, `{{vatId}}`, … via `renderLegalTemplate`. Portal AGB opt-in per **artist** (`portal_terms_*` on `artists`); onboarding terms step + layout gate when version mismatches.

**Key routes:** profile, analytics (11 tabs + intelligence + dual-axis Spotify presence, period presets, CSV/PDF export), statements, billing, invoices, releases, tour (events), **tour-planner** (TRACK production), calendar, marketing, documents, messages, interviews, epk-builder, onboarding, help.

### Portal analytics hub (`/portal/analytics`)

| Topic | Rule |
|-------|------|
| Sources | SOS **statement streams** vs public **Spotify presence** never mixed into one total |
| Disclaimer | Presence tab: high-visibility non-binding / liability notice (`PublicMetricsDisclaimer`) — public/third-party figures approximate & unreconciled; statements + settlement only for payouts. PDF includes same disclaimer. Never name scrape vendors in UI. |
| Waterfall | Top tracks / album play totals dedupe by normalized track name (`publicSpotifyPresence.ts`) — max plays, no double-count |
| Trends | Dual Y-axis (audience left, plays right) or index-100 mode; series toggles in Customize |
| Prefs | `viewPreferences.ts` localStorage: tabs + chart mode + series + period preset |
| Export | CSV (`reportExport.ts`) + PDF summary (`analyticsReportPdf.ts`, jsPDF) |

### Messaging (M0 hardening)

| Topic | Rule |
|-------|------|
| List limits | DAL uses `MessageListOptions` + caps in `src/lib/messaging/constants.ts` (default 50, max 100) |
| Per-user read | `message_receipts` via `upsertMessageReceipt`; pass `userId` into mark-read / badge counts |
| Rules | `applyMessageRulesOnInsert` / `applyPortalMessageRulesOnInsert` after send (server-side) |
| Attachments | `assertMessageAttachmentAllowed` + `isAllowedAttachmentUrl` before metadata insert |
| Domain send | Prefer `src/lib/messaging/send.ts` (`sendLabelMessage`, `sendPortalDomainMessage`) — sets `sender_user_id` + optional `client_message_id` |
| Unified search | `searchArtistMailbox` in `src/lib/messaging/search.ts` |
| Shared inbox (M2) | Portal `to_label` messages: `assignee_user_id`, `priority`, `tags`; staff notes (`message_internal_notes`); audit (`message_events`); APIs under `/api/admin/messages/[id]/{ops,notes,export}`; UI `SharedInboxPanel` |

### TRACK Tour Planner (`/portal/tour-planner`)

Enterprise tour production module (ported from artist-tour-planner). **Distinct from** `/portal/events` + `concerts` — public events and Bandsintown/Songkick sync stay there; tour planner is optional production planning with a bridge via `tour_stops.concert_id`.

| Topic | Rule |
|-------|------|
| Flag | `artist.tour_planner` in `portal_feature_flags` (seed `supabase/reset.sql`) |
| Route | `/portal/tour-planner?artistId=` — gated in RSC + sidebar |
| Data | Parallel tables: `tours`, `tour_stops`, `tour_contacts`, `tour_tasks`, `tour_crew_members`, `tour_merch_items`, `tour_merch_settlements` |
| DAL | `src/lib/api/tours.ts`, `tourStops.ts`, `tourContacts.ts`, `tourTasks.ts`, `tourCrew.ts`, `tourMerch.ts`, `tourConcertBridge.ts` |
| APIs | `app/api/portal/tour-planner/*` — bearer + `?artistId=` via `authenticatePortalBearerWithArtist` |
| Offline | Dexie sync queue (`src/lib/tour-planner/offline/`) + TanStack Query persist (tour-planner keys only) |
| PDF | Day sheet, show settlement, merch settlement, **tour itinerary** — `src/lib/tour-planner/pdf.ts` (jsPDF) |
| Guided | Mode chooser + `TourProductionWizard` (basics → import concerts → defaults → readiness → share/export). Readiness: `tourReadiness.ts`. |
| Tour mode | Show-day fullscreen UI (`TourModeView`, `?mode=tour`) — next stop, schedule, maps, day sheet, checks; offline via cached queries. No push. |
| Public share | `tour_share_links` + `/tour/share/[token]` — logistics + deal framework only (`publicTourShare.ts`) |
| Admin | Read-only `/admin/tour-planner` — `AdminTourPlannerView`, RLS `"*: admin all"` |

**Concert bridge:** import event → stop (`stops/import-concert`); publish stop → concert (`publishConcert`); sync linked concert (`syncConcert` when `concertId` set). Logic in `tourConcertBridge.ts`.

**Portal API surface (representative):**

| Path | Methods |
|------|---------|
| `tours`, `tours/[id]` | GET/POST, PATCH/DELETE (archive, duplicate) |
| `stops`, `stops/[id]` | GET/POST (create, reorder), PATCH/DELETE |
| `stops/import-concert` | POST |
| `tasks`, `tasks/[id]` | GET/POST, PATCH/DELETE |
| `contacts`, `contacts/[id]` | GET/POST, PATCH/DELETE |
| `crew`, `crew/[id]` | GET/POST, PATCH/DELETE |
| `merch`, `merch/settlement` | GET/POST |
| `merch/[id]` | PATCH/DELETE |
| `route`, `geocode`, `import` | POST |

**Stop production UI:** per-diems, rooming, travel manifest, full finance deal fields, hotel geocode, merch count-in/out/sold per variant with comps, drag-reorder stops.

**Tour settings UI:** route settings (vehicle, planning mode, geocoding provider, fuel/tolls), budget JSONB line items + total, tech document PDF upload (`/api/portal/tour-planner/tech-documents/upload`).

## Settlement & Abrechnungszentrale

Enterprise SOS + invoice lifecycle. Workflow helpers: `src/lib/sos/statementWorkflow.ts`, UI: `statementWorkflowUi.tsx`.

**Shared guided kit:** `src/components/guided/` (`GuidedModeChooser`, `GuidedStepShell`, `GuidedStepCoach`) + `src/lib/guided/guidedSteps.ts`. Used by portal billing/invoice/EPK/fan-page assistants and admin release review.

**Portal DAU assistants:**
| Flow | Entry | Steps |
|------|--------|--------|
| Billing | `/portal/billing` | Legal → Tax → Payout (SEPA) → Done |
| Invoice from Statement | `/portal/invoices?statement=` (CTA from Statements/Analytics) | Confirm → Billing if needed → Send |
| EPK first share | `/portal/epk-builder` mode chooser | Template → PDF/Share → Done |
| Fan page first publish | `/portal/fan-page` mode chooser | Layout template → Checks → Publish |

**Admin release review assistant:** `/admin/release-submissions` mode chooser → Queue → Checklist → Decision → optional draft.

**Admin accounting (`/admin/accounting`):** Default **Guided** mode with **Assistant-first** chooser (`SosWizardModeChooser`). Assistant: Setup → Upload → Checks → Payouts → Publish. Quick: Upload → Payouts → Publish (experts). Step coach (`SosWizardStepCoach`) + `guidedContinueBlockedReason` explain why Continue is disabled. **Advanced** mode: all sub-tabs.

**FX / ECB:** Spot + historical rates via `/api/exchange-rates` (Frankfurter). Processing is gated until rates are non-empty (`useSosCSVProcessor`). Sticky `CurrencyRatesBanner` for loading / live ECB / fallback + refresh. Missing currency throws (no silent €0).

| Module | Role |
|--------|------|
| `AccountingGuidedWizard` + `SosWizardStepCoach` | DAU step UI, progress, blocked reasons |
| `CurrencyRatesBanner` | Sticky FX status + refresh |
| `SettlementCenterPanel` | Shell: overview, toolbar, register, dialogs |
| `useSettlementCenter` | Register fetch, bulk actions, correction/payment/lock/archive |
| `SettlementWorkflowOverview` | Workflow + ledger mismatch warning (`settlementReconciliation`) |
| `SettlementActionToolbar`, `SettlementRegisterTable`, `SettlementCenterDialogs` | Actions + table + modals |
| `settlementCenterModel.ts` | Types, labels, `registerToMasterRow` |
| `useSosWorkspaceSync` | Period-keyed rules workspace auto-save |
| `settlementReconciliation.ts` | Pure ledger invariant checks |
| `trackAssignmentSplits.ts` | Multi-owner revenue splits in `data-processor.ts` |
| `runPersistSosAnalytics.ts` | Client wrapper for portal analytics persist |

**7-step workflow:** review → draft upload → label approve → artist viewed → invoice created → received → paid.

**Tables:** `settlement_periods`, `artist_settlement_ledger`, `period_carry_forwards`, `financial_audit_events`; extended `sales_statements`, `artist_invoices`.

**DAL:** `settlementPeriods.ts`, `settlementLedger.ts`, `settlementRegister.ts`, `financialAudit.ts`; extended `salesStatements.ts`, `artistInvoices.ts`.

**Admin APIs:** `GET /api/admin/settlements/register`, periods lock/archive, bulk-approve, correction, invoice received/payment.

**Bronze CSV:** Never browser `fetch()` to presigned R2. Upload ≤45 MB via `…/upload`; 45–200 MB via `…/multipart/*`; download via `…/download`. Limits: `bronzeUploadLimits.ts`. UI: `ImportBatchesPanel`.

**Portal statement provenance (chain of custody):** `/portal/statements` shows a trust banner + per-statement “source proof” (distributor, period, SHA-256, batch id, archive time). Download via `GET /api/portal/statements/[id]/source-csv?artistId=` (membership + stream from R2, never browser→presigned). DAL: `getStatementProvenanceByStatementIds` / `toStatementSourceProvenance`. Statements map `batch_id`; RLS `distributor_import_batches: artist read linked` in `reset.sql`. Manual PDF-only statements show “no batch linked”.

## Document vault

`/portal/documents` — PDF/DOCX to `artist-documents/{artistId}/`. Upload `POST /api/portal/documents/upload` (20 MB). Download via presigned Server Action. Component: `DocumentVault.tsx`.

## Release submission form

`/portal/releases/new` — **guided wizard** over schema-driven fields from `submission_form_schema` + per-type rules.

| Piece | Location |
|-------|----------|
| Field schema | `submission_form_schema` (`field_scope`: `release` \| `track`; `field_group` drives wizard steps; optional `type_rules` JSONB per release type) |
| Track count rules | `submission_release_type_rules` (`fixed_1` for single; `user_specified` + min/max for album/ep/compilation) |
| Wizard steps | `src/lib/submissions/wizardSteps.ts` — type → groups (`metadata` / `distribution` / `rights` / custom) → tracks → review |
| Cover art | Public URL (Drive etc.). `POST /api/portal/cover-art-check` → JPEG 3000×3000 + short-lived HMAC token. Submit accepts token or re-verifies. No R2 during form. |
| Drafts | Server: `submission_form_drafts` (`form_type` release\|video) via `GET/PUT/DELETE /api/portal/submission-form-drafts`; local IndexedDB cache |
| Idempotency | Required `idempotencyKey` UUID on release submit; 409 returns prior `submissionId` when known |
| Wizard UX | `?step=` URL sync; track focus mode for multi-track; review completeness; template from last submission |
| Rule resolution | `src/lib/submissions/fieldTypeRules.ts` — shared by portal UI + submit route |
| Admin UI | `SubmissionFormManager` — Fields (incl. wizard group), Track rules, Rules per type |
| Admin APIs | `PUT /api/admin/submission-form-schema`, `PUT /api/admin/submission-release-type-rules` |

Artists are guided step-by-step; only fields visible/required for the selected type appear. Admins assign **wizard group** per field so custom fields land on the right step without code changes. Video form uses the same wizard shell.

**Draft catalog release:** Admin POST `/api/admin/release-submissions/[id]` `{ action: 'create_draft_release' }` → hidden `releases` row + `release_submissions.release_id` link + `sync_policy=manual_until_street`. Accept status alone does **not** create a catalog row.

**Sync protection:** `releases.sync_policy` — `auto` | `manual_until_street` | `locked`. Fuzzy iTunes/Spotify/Discogs merge skips protected rows until street date (or forever if locked).

## Video submission

`/portal/releases/videos/new` → `video_submissions` row only (not a `videos` catalog entry until a future promote feature). Admin: `/admin/video-submissions`. APIs: `POST /api/portal/submit-video`, `PATCH /api/admin/video-submissions/[id]`.

## Portal access gate

`PortalAccessGate` for unlinked roles. Onboarding: `shouldRedirectToOnboarding()` → `/portal/onboarding?artistId=…`.

## Portal help (`/portal/help`)

| Topic | Rule |
|-------|------|
| **Admin FAQ (top block)** | `/admin/portal-faq` — `portal_faq_categories` + `portal_faq_items`; EN required, DE optional; TipTap HTML answers; ISR tag `portal-faq` |
| Structure | `src/lib/portal/helpManifest.ts` — categories, topics, section types, glossary IDs (static help below FAQ) |
| i18n | `portalHelp` namespace — UI chrome in `src/i18n/messages/{en,de}/portalHelp.json`; FAQ copy lives in DB |
| Page UI | `PortalFaqSection` (DB) + `HelpPanel` — sticky search, nested accordions, glossary, `?faq=` / `?topic=` / `?section=` deep links |
| Global search | `PortalHelpPalette` in portal layout — **Ctrl+K** (Cmd+K); FAQ group first; disabled on `/portal/epk-builder` and `/portal/fan-page` |
| Search hook | `src/lib/portal/useHelpSearch.ts` + `src/lib/portal/faqSearch.ts` |
| Offline | `/portal/help` is offline-readable after first visit (`portalRoutes.ts`; FAQ SSR-cached via `getCachedPortalFaq`) |

## EPK

- **Legacy:** browser print via `printEpkDocument.ts` / `EPKPreview` (`forceMount` on EPK tab)
- **Canvas builder:** `/portal/epk-builder` — JSON v2 on `artist_epks.epk_document`; server PDF `POST /api/portal/epk/export`; share links `/epk/share/[token]`; analytics `epk_download_events`

API surface: document, versions, fonts, share, templates, press export. DAL: `epkDocument.ts`, `epkFonts.ts`, `epkShareLinks.ts`.

## Fan Page (`/portal/fan-page`, public `/@{slug}`)

Distinct from EPK (press/PDF) and the fixed `/artists/[slug]` profile. One customizable fan landing page per artist.

| Topic | Rule |
|-------|------|
| Flag | `artist.fan_page` in `portal_feature_flags` |
| Storage | `artist_landing_pages` (1:1 `artist_id`, JSON `LandingPageDocumentV1`) |
| Editor | Section-based builder (`@dnd-kit`), TipTap bio blocks, shared image crop from EPK |
| Public URL | Rewrite `/@:slug` → `/fan/:slug`; ISR tag `fan-page-{slug}` |
| Publish | `draft` → `pending_review` (default) or direct when `artists.landing_publish_trusted` |
| Assets | Upload `source=landing` → `asset_folders/landing`, tag `landing_editor` |

DAL: `fanPageDocument.ts`, `publicFanPage.ts`. APIs: `app/api/portal/fan-page/document`, `publish`; admin `fan-page/review/[artistId]`.

## Journalist dashboard (`/press/dashboard/*`)

Role `journalist` or `admin`. Feature flags: `journalist.*` and `press.*`. Promo pool dual-gate (middleware + layout).

## Feature flags (admin `/admin/features`)

Two independent systems — do not conflate with **Settings → Roles** (`role_permissions`), which gates CRUD inside modules.

| System | Storage | Scope | Helpers |
|--------|---------|-------|---------|
| **Global toggles** | `site_settings.key = 'feature_toggles'` (JSON) | Whole roles / site areas | `src/lib/featureToggles.ts` — `getFeatureToggles()`, `parseFeatureTogglesJson()` |
| **Portal module flags** | `portal_feature_flags` table | Per sidebar module for `artist` / `journalist` | `getFeatureFlagsForRole()` in `src/lib/api/featureFlags.ts`; UI meta in `src/lib/portalFeatureFlagMeta.ts` |

**Global toggles**

| Key | Effect |
|-----|--------|
| `promoPool` | `/promo-pool`, `/press/dashboard/promo-pool`, journalist promo nav; SSOT via `isPromoPoolEnabled()` in `src/lib/pressAccess.ts` |
| `editorTools` | `/editor/*` and editor CMS paths; enforced in `middleware.ts` |

**Portal flags (seed in `supabase/reset.sql`)**

- **Artist:** `artist.analytics`, `artist.statements`, `artist.marketing`, `artist.invoices`, `artist.documents`, `artist.calendar`, `artist.epk_builder`, `artist.fan_page`, `artist.tour_planner`
- **Journalist:** `journalist.accreditation`, `press.applications`, `press.zip_download`, `press.audio_preview`, `press.contact`

**Press helpers** (`src/lib/pressAccess.ts`): `isPressApplicationsEnabled()`, `isPressZipDownloadEnabled()`, `isPressAudioPreviewEnabled()` — each reads `portal_feature_flags` for role `journalist`.

**Deprecated:** `press.promo_tracks` — replaced by global `promoPool`; hidden in admin UI (`DEPRECATED_PORTAL_FEATURE_FLAGS`), not seeded.

**Route-guard pattern:** RSC page (or server action) loads flags/toggles via DAL, returns disabled message or `notFound()`; nav hides links when flag is off. Examples: `app/portal/calendar/page.tsx` (`artist.calendar`), `app/press/apply/page.tsx` (`press.applications`), `app/press/dashboard/promo-pool/page.tsx` (global `promoPool`).

Admin UI: `AdminFeaturesWrapper` — section 1 `FeatureTogglesManager` (global, saved with site settings), section 2 `FeatureFlagsManager` (portal rows, immediate PATCH).

## Press ecosystem

SSOT: `assets` + `press_kit_items` via `pressKit.ts`. Promo audio: presigned stream only on click (`getPromoTrackStreamUrl`). Applications: `journalist_applications` + DB trigger for role assignment on approve.

## PWA

Serwist (`app/sw.ts`). SW excludes `/api/*`, `/admin/*`, `/portal/*`, `/press/*`, `/promo-pool/*`. Single `PWAInstallPrompt` in `Providers.tsx`.

## Website tracking

`PageTracker` when `darktunes_consent=accepted` → `POST /api/page-events`. Skips admin/portal/press/editor.

## Admin label analytics

`/admin/analytics` — roster health, `sos_period_summaries`, press CRM, `page_events`, `financial_audit_events`.