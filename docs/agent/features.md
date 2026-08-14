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

**Key routes:** profile (incl. **Integrations** / Bandsintown credentials), **spotify-trends**, **sos-analytics** (legacy `/portal/analytics` redirects), statements, billing, invoices, releases, tour (events), **tour-planner** (TRACK production), calendar, marketing, documents, messages, interviews, epk-builder, onboarding, help, **feedback**.

### Portal product feedback (`/portal/feedback`)

| Topic | Rule |
|-------|------|
| Purpose | Product feedback about portal/site — **not** Zammad tech support (`/admin/support`) |
| Form | Category (`bug` \| `feature` \| `ux` \| `general` \| `praise`), optional 1–5 rating, optional subject, required message (≥20 chars) |
| Artist | Always the **active portal artist** (RSC `resolvePortalArtist` + `?artistId=`); multi-artist switcher changes sender. No separate “select artist” dropdown. Nav always appends resolved `artistId`. |
| History | Artist sees own submissions with status (`new` / `reviewed` / `archived`) |
| API | `GET/POST /api/portal/feedback?artistId=` — membership + `portalMemberWrite`; rate limit 10/h |
| Table | `portal_feedback` — RLS: artist insert/read own; editor+ read/update status |
| Admin | `/admin/feedback` list + status actions; nav badge for `status = new`; DAL `src/lib/api/portalFeedback.ts` |

### Portal analytics (split dashboards)

| Topic | Rule |
|-------|------|
| Nav | Two dashboard items under `artist.analytics`: **Spotify Trends** (`/portal/spotify-trends`) and **Sales Analytics** (UI label; route `/portal/sos-analytics`). Legacy `/portal/analytics` redirects (listeners tab → Spotify Trends). |
| Sources | Statement **sales streams** (SOS backend) vs public **Spotify presence** never mixed into one total or one menu |
| Spotify Trends | Presence only (listeners, followers, track plays, dual-axis trends, disclaimer). Empty state when no presence data — avoid zero KPI grids. **Current UTC month** only appears after public scrape rows exist for that period (otherwise secondary sources / chart joins would show Spotify as 0). |
| Sales Analytics | User-facing name for statement streams, territories, earnings, releases, revenue-mix, settlement, events, press, engagement, merch. Empty state when no statement data. Internal keys/routes may still say `sos_*`. |
| Disclaimer | Spotify page: high-visibility non-binding / liability notice (`PublicMetricsDisclaimer`) — public/third-party figures approximate & unreconciled; statements + settlement only for payouts. PDF includes same disclaimer. Never name scrape vendors in UI. |
| Waterfall | Top tracks / album play totals dedupe by normalized track name (`publicSpotifyPresence.ts`) — max plays, no double-count |
| Prefs | Separate localStorage keys: `portal-spotify-trends-view-v1`, `portal-sos-analytics-view-v1` |
| Export | SOS: CSV + PDF; Spotify Trends: PDF presence summary |

### Portal Bandsintown credentials

| Topic | Rule |
|-------|------|
| UI | Profile → **Integrations** tab — per active artist (multi-project switcher) |
| Fields | UI: **Bandsintown Artist Name** (the name on Bandsintown). Stored in `artists.bandsintown_id`. Key in `artist_private_data` (admin ArtistForm dual-writes the same). |
| API | `GET/PUT /api/portal/integrations/bandsintown?artistId=`; `POST …/sync` — membership write; key never returned in full (`hasApiKey` only) |
| Sync | One-off concert upsert via `fetchBandsintownArtistEvents` (same as admin sync) |

### Portal notification bell

| Topic | Rule |
|-------|------|
| Badge total | messages + interviews + statements + platform alerts (`getPortalBadgeCounts`) |
| Message unread | **Per-user** `message_receipts` when `userId` known — not only legacy `label_messages.read` / `portal_messages.read_at` |
| Mark one | `markPortalNotificationItemRead` → legacy flag + receipt |
| Mark all | `markAllPortalMessagesRead(db, artistId, userId)` must write **receipts** for label+portal ids (otherwise badge stays high after “seen”) |
| Feed | `getPortalNotificationFeed(..., userId)` — same receipt rules as badges |
| Non-dismissible | Pending interviews + `artist_notified` statements stay in feed/badge until workflow advances (not clearable via mark-all). Artists may **delete** interview requests (`DELETE /api/portal/interview-requests/[id]?artistId=`) which removes them from inbox + badge. |
| Platform alerts | Unified `notifications` table (`read` flag); artist-scoped by `artist_id` + RLS |
| Admin bell | Separate: `DashboardNotificationBell` + `editor`/`notifications` APIs with realtime |

### Messaging (M0 hardening)

| Topic | Rule |
|-------|------|
| List limits | DAL uses `MessageListOptions` + caps in `src/lib/messaging/constants.ts` (default 50, max 100) |
| Per-user read | `message_receipts` via `upsertMessageReceipt` / `upsertMessageReceipts`; pass `userId` into mark-read / badge counts / bell feed |
| Rules | `applyMessageRulesOnInsert` / `applyPortalMessageRulesOnInsert` after send (server-side) |
| Attachments | `assertMessageAttachmentAllowed` + `isAllowedAttachmentUrl` before metadata insert |
| Domain send | Prefer `src/lib/messaging/send.ts` (`sendLabelMessage`, `sendPortalDomainMessage`) — sets `sender_user_id` + optional `client_message_id` |
| Unified search | `searchArtistMailbox` in `src/lib/messaging/search.ts` |
| Shared inbox (M2) | Portal `to_label` messages: `assignee_user_id`, `priority`, `tags`; staff notes (`message_internal_notes`); audit (`message_events`); APIs under `/api/admin/messages/[id]/{ops,notes,export}`; UI `SharedInboxPanel` |
| Chat thread UI | Detail pane uses `MessageChatThread` (chronological bubbles; own messages right). Label threads include original + `artist_replies`. **Admin and portal both have an inline reply composer** under the thread (not only a link to Compose). |
| Conversation grouping | Client-side threads via `src/lib/messaging/threads.ts` (normalize subject, participant key). Portal inbox API merges sent+received so Re: threads are complete. One list row per conversation (count badge). |
| Portal mobile mailbox | Messenger pattern in `PortalMailbox`: below `md`, show **list or full-screen chat** (not 3 columns). Back = clear selection; folders via left `Sheet`. Desktop keeps folders \| list \| chat. |
| Inbox tools | Sort modes (`MailboxSortSelect`); drag conversation → folder/trash (`@dnd-kit` + droppable `FolderTree`). Star/delete/move/restore apply to **all** message ids in the thread. |
| Live sound | Realtime INSERT → `playNewMessageSound()`; toggle `MessageSoundToggle` (`localStorage` `dt-message-sound-enabled`, default on) |
| Notifications | Label send: `POST /api/admin/messages/send` emits `label_message` (artist audience). Artist reply: `POST /api/portal/messages/artist-reply` emits `artist_portal_message` (staff). Portal→label already emits on `POST /api/portal/messages/send`. |

### Portal calendar (`/portal/calendar`)

| Topic | Rule |
|-------|------|
| Availability | **Always on** for signed-in portal artists (sidebar not gated by `artist.calendar`; page has no disable gate) |
| Data | Releases: `getAllVisibleReleasesForCalendar` (slim nested select). Events: `getAllVisibleConcertsForCalendar` (past + future, nested artists / featured) |
| Cache | `getCachedCalendarReleases` (`releases` tag) + `getCachedCalendarConcerts` (`concerts` tag) via cookie-free client |
| UI filters | Kind: All / Releases / Events. Ownership: All artists / Mine only. Search: artists, titles, venues. Release type chips when releases visible |
| Filters SSOT | `src/lib/portal/releaseCalendarFilters.ts` (`filterCalendarReleases`, `filterCalendarConcerts`) |
| Auth | `resolvePortalArtist` request-scoped for “Mine only”; calendar payloads are shared cache |

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
| Billing | `/portal/billing` | Legal → Tax → Payout (SEPA) → Done. **Skip chooser/assistant when `isBillingProfileComplete`** — open advanced form; `?mode=assistant` or incomplete profile still forces guide. |
| Invoice from Statement | `/portal/invoices?statement=` (CTA from Statements/Analytics) | Confirm → Billing if needed → Send |
| EPK first share | `/portal/epk-builder` mode chooser | Template → PDF/Share → Done |
| Fan page first publish | `/portal/fan-page` mode chooser | Layout template → Checks → Publish |

**Admin release review assistant:** `/admin/release-submissions` mode chooser → Queue → Checklist → Decision → optional draft.

**Admin accounting (`/admin/accounting`):** Default **Guided** mode with **Assistant-first** chooser (`SosWizardModeChooser`). Assistant: Setup → Upload → Checks → Payouts → Publish. Quick: Upload → Payouts → Publish (experts). Step coach (`SosWizardStepCoach`) + `guidedContinueBlockedReason` explain why Continue is disabled. **Advanced** mode: all sub-tabs.

**Money (period vs opening):** `sales_statements.amount_eur` and processor `finalPayout` are **this period’s activity only**. Opening from `period_carry_forwards` / register `openingBalanceEur` is a separate line (`openingBalanceEur`) plus next-period ledger `carry_in`. `amountDueEur = finalPayout + opening`. Carry-forward uses ledger row presence (`resolveCarryStatementBalance`) and invoice `outstanding_amount_cents` (`unpaidInvoiceContributionCents`) — never `ledger || statement` and never recomputed VAT GROSS. Track assignments must sum to 100% (`ownerPercentagesSumTo100` / `splitRevenueAmongOwners`); incomplete splits stay on the original row and block the wizard. Statement-linked invoice payment does **not** post a second `payment` ledger row after `invoice_liability` (`resolvePaymentLedgerEntryType`); `recordInvoicePayment` fills `received_at` when still empty.

**Excel export:** `ExcelExportDialog` picks sheets + columns (artist/period/period payout always stay; opening + amount due are optional summary columns). Named presets live in `SosAccountingSettings.excelExport` (workspace / `sos_rules_presets`). Generator: `src/lib/sos/export/excelStatement.ts` + `excelExportSettings.ts`. PDF section toggles stay PDF-only.

**FX / ECB:** Spot + historical rates via `/api/exchange-rates` (Frankfurter). Processing is gated until rates are non-empty (`useSosCSVProcessor`). Sticky `CurrencyRatesBanner` for loading / live ECB / fallback + refresh. Historical fetch does **not** pre-fill missing months with `FALLBACK_EXCHANGE_RATES` — convert uses spot, then throws if still missing. Empty currency cell → EUR + wizard warning. Missing or ≤0 rate still throws (no silent €0).

**Parser skips:** Bandcamp `payout`, empty lines, and no-artist 0 € rows go to `skipped[]` (counted in `rowsSkipped`, listed as non-blocking wizard warnings). “Too many columns” stays a parse error. Compilation summary revenue is EUR after FX (`buildFilteredCompilations` + `normalizeRevenueToEur`). Quoted embedded newlines are preserved via PapaParse records (not `split('\\n')`).

**Dates:** `normalizeDateToMonth(s, source)` — unambiguous day/month always wins; when both parts ≤ 12, Believe/Printful = DD/MM and Bandcamp/Shopify/Darkmerch = MM/DD. Two-digit years are American only for Bandcamp.

**Gold persist:** `row_count` stays the bronze original (do not overwrite with upsert length). After persist, gold `revenueEur` vs approved `amount_eur` for the period: delta > €0.05 → `success` + `warnings[]`. Reprocess accepts session `exchangeRates` / `historicalRates` / `carryForwardByArtist`.

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
| `runPersistSosAnalytics.ts` | Client wrapper → `POST /api/admin/sos/persist-analytics` (not a Server Action) |

**7-step workflow:** review → draft upload → label approve → artist viewed → invoice created → received → paid. The UI stepper is derived KPIs (`statementWorkflow.ts`). **DAL enforces FROM→TO** via `STATEMENT_TRANSITIONS` in `statementStatusTransitions.ts` (`updateSalesStatementStatus` throws `InvalidStatementTransitionError` → HTTP 422). Invoice from `label_approved` (skip notified/viewed) stays allowed. Payment from invoice `sent` stays allowed (sets `received_at` if empty). No unlock / unpay in the app — reverse status only via support SQL.

**Uniqueness:** one non-storno draft per artist+period (`sales_statements_one_draft_per_period`); one SOS invoice per statement (`artist_invoices_one_per_statement`). App lookup still 409s first; unique index catches races (`23505`).

**Periods:** Archive does **not** require a prior lock (operators archive open periods on purpose). Archive is final.

**Tables:** `settlement_periods`, `artist_settlement_ledger`, `period_carry_forwards`, `financial_audit_events`; extended `sales_statements`, `artist_invoices`.

**DAL:** `settlementPeriods.ts`, `settlementLedger.ts`, `settlementRegister.ts`, `financialAudit.ts`; extended `salesStatements.ts`, `artistInvoices.ts`.

**Admin APIs:** `GET /api/admin/settlements/register`, `POST /api/admin/sos/persist-analytics`, periods lock/archive, bulk-approve, correction, invoice received/payment. Artist names match after collapsing whitespace (`FrozenPlasma` = `Frozen Plasma`). Split fees, expenses, manuals, and opening balances use the same collapsed key (`findByArtistName` / `lookupByArtistName`) so a workspace named **Frozen Plasma** still applies to Bandcamp `FrozenPlasma`. Code defaults (`DEFAULT_APP_DEFAULTS`) hold only label-wide rates (not compilation filters or per-artist splits). Workspace JSON import persists to the Default preset immediately, plus the current period workspace when a period is selected. Standalone SOS exports use `pdfExportSettings`; import maps that to `pdfSettings`.

**Bronze CSV:** Never browser `fetch()` to presigned R2. Upload ≤45 MB via `…/upload`; 45–200 MB via `…/multipart/*`; download via `…/download`. Limits: `bronzeUploadLimits.ts`. UI: `ImportBatchesPanel`. Confirm still checks SHA-256 of the R2 object. Active `file_hash` is unique (`distributor_import_batches_file_hash_active`); failed batches may reuse the hash. POST lookup + `23505` both return `{ duplicate: true }`.

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
- **Mobile editor:** `EpkBuilderShell` uses `useIsLg()` — single panel (Canvas | Layers | Properties) below `lg`; **do not mount** `ResizablePanelGroup` on mobile (inline `display:flex` defeats CSS `hidden`). Compact toolbar + overflow “More tools”. Portal `lockScroll` + `p-0`.

API surface: document, versions, fonts, share, templates, press export. DAL: `epkDocument.ts`, `epkFonts.ts`, `epkShareLinks.ts`.

## Personal Artist Page (`/portal/fan-page`, public `/@{slug}`)

User-facing name: **Personal Artist Page** (legacy code paths still use `fan-page` / `fan_page`).

Distinct from EPK (press/PDF) and the fixed `/artists/[slug]` profile. One customizable fan landing page per artist.

| Topic | Rule |
|-------|------|
| Flag | `artist.fan_page` in `portal_feature_flags` |
| Storage | `artist_landing_pages` (1:1 `artist_id`, JSON `LandingPageDocumentV1`) |
| Editor | Section-based builder (`@dnd-kit`), TipTap bio blocks, shared image crop from EPK |
| Mobile | Same as EPK: `useIsLg`, one panel (Sections \| Preview \| Properties), compact toolbar, full-bleed `lockScroll` |
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

- **Artist:** `artist.analytics`, `artist.statements`, `artist.marketing`, `artist.invoices`, `artist.documents`, `artist.epk_builder`, `artist.fan_page`, `artist.tour_planner` (calendar is always on — not gated)
- **Journalist:** `journalist.accreditation`, `press.applications`, `press.zip_download`, `press.audio_preview`, `press.contact`

**Press helpers** (`src/lib/pressAccess.ts`): `isPressApplicationsEnabled()`, `isPressZipDownloadEnabled()`, `isPressAudioPreviewEnabled()` — each reads `portal_feature_flags` for role `journalist`.

**Deprecated:** `press.promo_tracks` — replaced by global `promoPool`; hidden in admin UI (`DEPRECATED_PORTAL_FEATURE_FLAGS`), not seeded.

**Route-guard pattern:** RSC page (or server action) loads flags/toggles via DAL, returns disabled message or `notFound()`; nav hides links when flag is off. Examples: `app/press/apply/page.tsx` (`press.applications`), `app/press/dashboard/promo-pool/page.tsx` (global `promoPool`). Portal calendar is always available (no flag gate).

Admin UI: `AdminFeaturesWrapper` — section 1 `FeatureTogglesManager` (global, saved with site settings), section 2 `FeatureFlagsManager` (portal rows, immediate PATCH).

## Press ecosystem

SSOT: `assets` + `press_kit_items` via `pressKit.ts`. Promo audio: presigned stream only on click (`getPromoTrackStreamUrl`). Applications: `journalist_applications` + DB trigger for role assignment on approve.

## PWA

Serwist (`app/sw.ts`). SW excludes `/api/*` from typical app caches. Dashboard **document** navigations (`/admin`, `/portal`, `/editor`, `/press/dashboard`, `/login`, `/account`) use **NetworkOnly** so locale cookies always hit a fresh RSC tree. Public pages stay NetworkFirst with offline fallback.

- Install copy is **generic** (quick access / offline) — no artist-only product pitches.
- Auto-banner dismiss is stored in `localStorage` (`pwa-install-dismissed`) but can be re-opened anytime via `requestPwaInstallPrompt()` (`src/lib/pwa/installPrompt.ts`): Footer link, portal Settings, admin/portal sidebar footers.
- Manual re-open clears the dismiss flag and shows a fallback hint when `beforeinstallprompt` is unavailable.
- Install entry is hidden when already running as installed PWA (`display-mode: standalone`).

### Web Push + app icon badge

| Piece | Location |
|-------|----------|
| SW push / click | `app/sw.ts` — `showNotification`, open URL, optional `setAppBadge` from payload |
| Subscribe APIs | `/api/push/*` (auth cookie; any logged-in user) |
| Send path | `emitNotification` → `sendPushForNotification` (service role list + `web-push`) |
| Zero-config UI | Soft banner in portal + admin shells; device toggle on preferences pages |
| Icon badge | `setAppIconBadge` from portal badge totals / admin nav badge sum |
| Schema | `push_subscriptions`; `notification_preferences.push` |

**User path:** log in → tap **Enable** once (browser permission) → done. No VAPID/keys in the UI. Deployer sets VAPID env once (see `DEPLOYMENT.md`).

## Locale switcher

`LocaleFlagSwitcher` + SVG `LocaleFlagIcon` (not emoji — Windows shows DE/GB/FR letters for flag emoji). Opens DE/EN/FR menu, sets `NEXT_LOCALE`, full navigation (not `router.refresh()`). SSOT: `src/i18n/locales.ts`. One control per shell chrome (header), not sidebar footers. Message trees under `src/i18n/messages/{en,de,fr}/`.

## Website tracking

`PageTracker` when `darktunes_consent=accepted` → `POST /api/page-events`. Skips admin/portal/press/editor.

## Admin label analytics

`/admin/analytics` — roster health, `sos_period_summaries`, press CRM, `page_events`, `financial_audit_events`.