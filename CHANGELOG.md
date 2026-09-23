# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Product version lives in `package.json` and is shown in Admin → System Health.
Release ritual: [docs/RELEASING.md](docs/RELEASING.md).

## [Unreleased]

### Changed
- **Ledger opening is carry-in only:** Unused `opening_balance` entry type is removed. Period opening stays `carry_in` from archive.
- **SEPA/Payout no longer needs a CSV session:** With a billing period set, Statements shows the ledger payout list without re-uploading files. The period banner also appears without session revenues.
- **Statement cancel is not a live action:** `cancelled` stays a terminal/legacy status. Drafts are deleted. The status graph no longer allows transitions into `cancelled`.
- **Accounting amount sheet names the split:** Clicking an artist on Amounts shows Believe/Bandcamp/physical/Darkmerch percents with origin (artist source rule vs label source default vs digital/physical defaults), plus opening and amount due.
- **Accounting is one linear flow:** Files → Checks → Amounts → Statements (`AccountingGuidedWizard`). The Checks step lists blocking and reviewable issues with their repair action before amounts are prepared. Rules and Insights moved to a settings toolbar outside the money path; the dead mode-chooser/setup/step-coach components are removed. `?subTab=payout` opens Statements; `?subTab=trends` opens Insights; `?subTab=validate` opens Checks.
- **Accounting period vs durable settings:** Default and named presets no longer store manual revenue, expenses, or ignored entries. Those stay on the period workspace so a recoup does not reappear next quarter. Loading a preset keeps the current period lines.
- **Accounting calculation reference cases:** Pipeline amounts for compilations (counted, not dropped), ignored entries, 60/40 track splits, incomplete track splits, mixed-source fees/splits/manual/expenses/opening, and global Believe split beating artist digital % are locked in `calculationReference.test.ts`. Split precedence is documented in `docs/agent/features.md` and must not be “simplified” to artist-always-wins.
- **Accounting opens the workspace directly:** Assistant / Quick Start / Advanced chooser is gone. Period fields sit on Upload. `?guidedStep=settle` maps to `?subTab=settlements`.
- **Sync orchestration rebuilt (Supabase-native):** Scheduling now lives in `supabase/reset.sql` (`pg_cron` + `pg_net`) instead of a manually-configured Supabase Cron → `trigger-sync` Edge Function relay (the Edge Function is removed). Jobs read `site_url`/`cron_secret` from Supabase Vault and POST to the Next.js worker. The `/api/sync` worker now drains a bounded ~50s batch (Hobby-safe, no 280s `waitUntil`, no self-chain), claims jobs atomically via the `claim_sync_jobs` RPC (`FOR UPDATE SKIP LOCKED`), and uses a Postgres worker lease (`acquire/renew/release_sync_worker_lease`, TTL 90s) instead of the `site_settings` KV lease. Enqueue routes still kick `/api/sync` immediately.
- **Lighthouse/Performance-CI nur auf Anforderung:** `lighthouse-ci.yml`, `performance-budget.yml` und `performance-tests.yml` starten nicht mehr automatisch (PR/Push/Zeitplan), sondern nur per `workflow_dispatch`.
- **E2E/Playwright is disabled:** the `qa.yml` and `e2e-comment.yml` workflows are removed; no PR, CI gate, or release may require E2E. Coverage comes from Vitest unit/route tests (`npm run test`) and `npm run ci`; user-flow evidence goes into `QA_CHECKLIST.md` (see `AGENTS.md`).

### Added
- **Real R2 bucket storage + garbage cleaner:** Admin Assets bar shows live bucket usage from `ListObjectsV2` (not only the `assets` catalog). System → Maintenance can scan the bucket, abort stale multipart uploads (>24h), list unreferenced objects, and delete them after typing `DELETE ORPHANS`. APIs: `GET/POST /api/admin/storage-snapshots`, `GET /api/admin/r2-orphans`, `POST /api/admin/r2-orphan-purges`.
- **Catalog image optimization:** Uploads optimize by default (checkbox in the file explorer; send `optimize=0` to keep the original). Photos become WebP at the same pixel size; press-approved assets and transparent PNGs keep their format. Bulk recompress: `POST /api/admin/asset-optimizations` (overwrites the same R2 key).
- **Admin statement PDF download:** Settlement register can open the stored statement PDF via `GET /api/admin/sales-statements/{id}/pdf` (10-minute presigned URL). Drafts and cancelled rows with an R2 object are included; the R2 key is not returned.
- **Aggregated error log + global capture:** `instrumentation.ts` (`onRequestError`) now captures every unhandled server error and persists it via the new `captureError` pipeline (`src/lib/observability/`). `app_logs` gains `fingerprint` (unique), `occurrences`, `first_seen_at`/`last_seen_at`, `resolved`/`resolved_at`/`resolved_by`, `ignored`, `environment`, `app_version`, `request_id`, `route_path`, `method`; repeated errors are upserted into one row via the `upsert_app_log` RPC. Details are redacted (email/tokens/sensitive keys) and a pg_cron `app-logs-cleanup` job prunes rows older than 90 days. Admins resolve/ignore entries in Admin → System → Logs (`PATCH /api/admin/app-logs/{id}`).
- **Automatic admin audit coverage:** `admin_audit_log` now records admin mutations automatically — the resolved actor is attached to the request in `adminAuth.verifyAdminRequest` and `withErrorHandler` derives a stable action from the path (with a fallback for legacy token-only routes). Business-critical routes keep richer explicit entries via `logAdminActionForRequest` without duplication.
- **Sync telemetry + dead-man's switch:** `cron_ticks` (append-only liveness: `scheduler`, `worker`, `queue`, `youtube`, `health_alert`), `sync_runs` (per-run ledger), and `sync_worker_lease` tables. `deriveCronHealth` now distinguishes “pg_cron down” from “HTTP hop broken” from “worker failing” instead of only knowing whether `CRON_SECRET` is set.
- **Auto-apply Supabase schema on deploy:** `.github/workflows/deploy-supabase.yml` applies `supabase/reset.sql` (schema + scheduler) after CI succeeds on `main` and upserts the Vault secrets; `scripts/apply-schema.mjs` (`npm run db:apply`) and a `scripts/check-destructive-sql.mjs` guard keep `reset.sql` additive.
- **SOS repair runs (dry-run + idempotent application):** `POST /api/admin/sos/settlement-repairs` builds a plan from uniquely repairable audit findings (dry-run default, zero writes) and applies it with per-step precondition checks — it stops at the first changed state instead of guessing. Each applied step is audited in `financial_audit_events`, the run is journaled durably in `settlement_operations` (same `operation_id` + same plan replays without double booking) and a restore artifact (before-rows, inserted ids) is captured and exposed via `GET /api/admin/sos/settlement-repairs/{operation_id}`. Locked/archived periods stay immutable (409 `SETTLEMENT_PERIOD_LOCKED`); the audit panel gains the dry-run/apply flow. Runbook: `ADMIN.md` (#630).
- **SOS settlement data audit (read-only):** `GET /api/admin/sos/settlement-audits` + `/admin/accounting/data-audit` report existing accounting-data issues across the ten contract categories (missing/orphan period links, statement/invoice artist mismatches, invoices without PDF, PDFs without record, unconfirmed import batches, artifact hash/size mismatches, duplicate bookings, carry-forward inconsistencies, ledger/invoice balance mismatches, missing view/mail evidence). The scan is strictly read-only, bounded per table (`truncated` flag instead of silent drops), cursor-paginated and separates unambiguous, unclear and non-repairable findings; live R2 verification is injected and documented as pending R2 access (#630).
- **SOS financial schema groundwork:** additive `settlement_operations` journal (durable financial idempotency), `artist_invoices.delivery_status`/`delivery_attempted_at`/`delivery_error`, `sales_statements.rules_fingerprint`/`fx_snapshot`/`calculation_snapshot`/`revision`, and `sepa_payment_orders` (versioned orders). Consumed by #620/#621/#623/#628.
- **SOS accounting contract (SSOT):** `docs/agent/sos-accounting-contract.md` — binding status/action table, screen states, change-consequence/invalidation rules, permission matrix, payment special cases, and performance budgets. GitHub issues #615–#632 mirror their relevant excerpts; when code and contract differ, the contract is the target.
- **Admin invoice inbox (`/admin/invoices`):** Lists every `artist_invoices` row — including free invoices without a statement, which the period-scoped Settlement Center never shows. Filters by artist and status, pagination, presigned PDF download, deep link from notifications (`?id=`).
- **Staff notification on invoice submit:** New catalog event `invoice_submitted` (admin audience) fires after a successful portal invoice insert with a dedupe key, so the admin bell no longer stays silent when an artist submits an invoice.
- **SOS ingest pipeline UI:** Per-file progress for reading, decoding, parsing (`row x of y`), payout aggregation, and bronze archive, with a pipeline banner. CSV parse runs once in the worker. Bronze failures show the server message.
- **System → Maintenance — audited SOS data deletion:** Delete failed/unconfirmed bronze archives, all bronze CSVs (R2 + batch rows), or portal gold analytics. Each action requires typing `DELETE FAILED` / `DELETE BRONZE` / `DELETE GOLD` and writes `admin_audit_log` plus a financial audit event. Statements, invoices, and the settlement ledger are not deleted. Single bronze deletes from Accounting are also audited.
- **SOS Excel original reports:** With Raw data on, `{artist}_statement.xlsx` includes `Believe` / `Bandcamp` / `Darkmerch` tabs for that artist only (1:1 original rows, Believe margin columns omitted). Raw tabs are written in 400-row batches with progress. Other bands’ rows are not included.
- **SOS Excel column presets:** Statement of Sales Excel export opens a dialog to pick sheets/columns and save named team presets on the accounting workspace.
- **Artist profile preview rows:** Admin → Settings can set how many **grid rows** of videos and news show on `/artists/[slug]` before an in-place **Show all** control (defaults: 2 rows each). Responsive columns match the existing grids (videos 1/2/3, news 1/2). Personal/Fan page unchanged.

### Fixed
- **SOS Excel raw export recovers or asks instead of dead-ending:** When the export worker no longer holds the processed rows (`EXCEL_WORKER_DATA_MISSING` / `EXCEL_ARTIST_NOT_IN_WORKER`), the export re-processes the loaded files, waits for the fresh result and retries once with a visible “Rebuilding original reports…” phase. If it still fails, a dialog offers **Retry** / **Download summary only** (`*_statement_summary-only.xlsx`, explicitly named and warned) / **Cancel** instead of leaving the operator without any file. Cancelled exports still do not open the dialog.
- **SOS Excel export no longer ships a stale or summary-only file by mistake:** Raw-on without worker tabs does not download a summary workbook. A second Excel job is refused until the first finishes. Re-processing CSVs/rules cancels an in-flight Excel (`EXCEL_STALE_REVISION`). ZIP-of-all can be aborted; cancel/stale does not download the ZIP. Placeholder notes for skipped artists include the error reason.
- **Accounting errors say why, without jargon:** Failures map to a cause and a next step (signed out, other tab saved first, period frozen, archive refused, unreadable CSV). Raw codes like Failed to fetch / R2 / 403 are not shown.
- **SOS parse errors no longer stall the pipeline:** A failed file parse decrements the pending counter and re-processes remaining files. Replacing a file clears its bronze archive id until re-archive. Period switch records the previous period key synchronously so a fast second switch cannot save the wrong period.
- **Replacing a SOS file re-parses it:** Same file id with new contents is removed and re-added in the CSV worker instead of keeping the old rows. Stale process results are ignored via `requestId`.
- **Period switch keeps unsaved accounting edits:** Dirty settings for the previous period are saved before the next period workspace loads.
- **Portal statement/invoice load errors are visible:** Failed statement or invoice list fetches show the error and **Reload**, not “No statements/invoices yet.”
- **Trends load errors are visible:** A failed period-summaries fetch shows the error and **Reload**, not “No historical data yet.”
- **Payout ledger load errors are visible:** A failed settlement-register fetch on SEPA/Payout shows the error and **Reload**, not “No ledger payouts for this period.”
- **Bronze archive load errors are visible:** A failed import-batch fetch shows the error and **Refresh**, not “No Bronze CSV archives yet.”
- **Settlement register load errors are visible:** A failed register fetch shows the error and **Reload**, not an empty artist table.
- **Statement status conflicts are 409:** Concurrent approve/status writes (`PGRST116` / zero matching rows) return `409 STATEMENT_STATUS_CONFLICT` instead of a 500 from PostgREST `.single()`.
- **Failed invoice email is visible to the label:** Settlement register and `/admin/invoices` show **Email failed** when `delivery_status=failed`, separate from invoice status.
- **Portal cannot mark invoices paid:** `PATCH /api/portal/invoices/{id}` no longer accepts `paid` or `sent`. Artists may only cancel a draft with no recorded payment. Payments stay on the admin RPC.
- **Invoice delivery retry:** Portal invoices with `delivery_status=failed` can be resent via `POST /api/portal/invoices/{id}/deliveries` without regenerating the PDF. A failed retry keeps the invoice as `draft`.
- **Statement notify retry:** If approval mail fails, the statement stays `label_approved`. Statements now have **Retry notify** (`POST /api/admin/sales-statements/{id}/notifications`) so a later send can move it to `artist_notified` without a second approval. Successful notify also emits the in-app `statement_available` event (deduped).
- **SOS Excel worker transfer:** ExcelJS `writeBuffer()` is copied into a real `ArrayBuffer` before `postMessage` transfer, so Excel download no longer dies with “Value at index 0 does not have a transferable type.”
- **SOS bronze archive UX:** Network `Failed to fetch` is humanized (not blamed on file size), the stale “Archiving to storage…” line is cleared, and each file can retry archive. Statement drafts are blocked until every session file has a bronze id; preview and Excel stay available.
- **Odesli key is enforced on every path:** `syncAll` now skips Odesli entirely when no API key is configured (instead of calling the sunset API and logging 401s), and `/api/sync-api` (`apiSource: odesli`), `/api/sync/artist` and `/api/admin/resolve-release-smart-link` pass the `odesli_api_key` through and fail fast with an actionable message when it is missing.
- **Health survives a missing telemetry table:** `getHealthHeartbeats` treats an unreadable `cron_ticks` kind as “no tick” instead of throwing, so a health snapshot cannot report the whole database offline when telemetry is unavailable.
- **Odesli sync no longer floods the queue with 401s:** The Odesli/song.link `v1-alpha.1` public API was sunset on 2026-07-31 (`401 PUBLIC_API_ACCESS_DEPRECATED`). An `odesli_api_key` credential (Admin → API Keys) is now sent as a Bearer token; without a key the Odesli job completes as a no-op instead of retrying 30× per run, and `getKnownApiConfiguration` reports Odesli as not configured instead of falsely operational.
- **Sync executor reliability:** the old `site_settings` KV lease (305s TTL > the 300s cron interval) could silently swallow a tick after a hard-killed run. The new Postgres lease has a 90s TTL renewed every 30s, and `scheduler-heartbeat`/`worker` ticks make a broken trigger chain visible in Admin → System Health.
- **Purge and gold persistence respect period locks:** `POST /api/admin/maintenance/purge-sos-data` now refuses with 409 `SETTLEMENT_PERIOD_LOCKED` (problem+json) when the selected scope contains bronze batches or gold rows of a locked/archived settlement period, and `persistSosAnalyticsCore` throws `SettlementPeriodNotWritableError` (409) for locked/archived periods instead of writing gold rows. Both paths were previously unguarded (contract §A.5).
- **Period archive is retry-safe:** `archiveSettlementPeriod` now checks the `sales_statements.is_archived` update error and re-asserts statement archiving on a retry after a partial failure instead of returning early and leaving statements active in an archived period.
- **Statement publishing is admin-only:** the `uploadStatement` server action enforced `admin OR editor` while every other admin SOS route is admin-only. It now uses the shared `canPublishStatement` rule (admin only), so editors keep read-only access and cannot publish financial documents.
- **Multiple Printful cost entries per order are summed:** The Shopify/Printful reconciliation no longer keeps only the last cost row for an order (`Map.set` last-wins); all fulfilment entries are added before the net revenue is calculated (100 subtotal − 15 − 5 = 80).
- **Invoice delivery state is separate from the financial status:** `POST /api/portal/invoices` no longer sets `sent` from the send request. The invoice is created with `delivery_status='not_sent'`; after the mail attempt it becomes `sent` only with a provider confirmation, otherwise `draft` + `delivery_status='failed'` + `delivery_error` (retryable), and `delivery_attempted_at` is recorded. The response returns the final persisted state.
- **Statement views are race-safe:** `record_statement_view` (SQL RPC) updates first/last view and the counter atomically with a `CASE` on the current status, so a late view response can no longer downgrade an `invoiced`/`paid` statement to `viewed`. `first_viewed_at` stays monotonic and only `label_approved`/`artist_notified` move to `viewed`.
- **Payments are atomic and durably idempotent:** `record_invoice_payment` (SQL RPC) locks the invoice row, validates status and the gross cap and updates paid/outstanding/status in one statement, so concurrent payments cannot lose an update. The admin payment route uses the client key as a durable `settlement_operations` id (same key + same payload replays; different payload → 409) and reports follow-up failures (ledger, statement status, audit, notification) as warnings after the payment is persisted — a retry can no longer add the amount twice. Period close is retry-safe: an existing `carry_in` is repaired instead of posted twice and `period_carry_forwards.applied_at` is written when the carry is applied.
- **Invoice retries stay on the persisted document:** The PDF for a recovered invoice is now built exclusively from the stored row (line items, client, dates, number, tax, stored FX note) instead of the retry request; ledger liability and the staff notification use the persisted line items. A client-supplied `operation_id` (all portal invoice flows, stable per submission attempt) gives durable idempotency in `settlement_operations`: same id + same payload replays the existing invoice, same id + different payload returns 409, and a retry after a partial failure continues instead of duplicating. The `sales_statements.settlement_period_id` link now checks its write error.
- **Released SOS statements carry their calculation stand:** The published statement now stores `rules_fingerprint`, `fx_snapshot` (spot + historical rates) and a compact `calculation_snapshot` (payout, opening, amount due, gross, split, fees, streams) from the same validated period used by the export, so PDF/Excel/portal and the settlement booking can be traced to one stand. Micro-amounts aggregate in full precision before any cent rounding (100,000 × 0.00001 EUR = 1 EUR is covered by tests); 0 %/100 % splits and negative refunds are honoured without truthy fallbacks.
- **SOS workspaces use optimistic concurrency and resume without re-upload:** `sos_accounting_workspaces` gains a `revision`; saves send `expected_revision` and a stale write returns 409 (`problem+json`) instead of silently overwriting another session. The UI shows a conflict hint with “reload from server”, keeps local changes dirty and pauses autosave until reload. Loaded `bronze_batch_ids` are read back and offered as “Load archived sources”, and the Settlement Center opens from the database for a resolved period even without a CSV upload session. Late workspace/register responses can no longer overwrite a newer period (sequence guards).
- **SOS API errors are problem+json and domain conflicts are 4xx:** `withErrorHandler` now emits RFC 9457 `application/problem+json` (`type/title/status/detail`) while keeping the legacy `error`/`code` fields for existing clients. Statement/invoice precondition violations (wrong status, concurrent update, overpayment, immutable PDF, not found) return 404/409/422 via `BusinessRuleError` instead of a generic 500. Stepper navigation uses the same gates as Continue (no direct jump past setup/rates/validation blockers), and the statement upload action re-validates the billing period server-side.
- **SOS bronze uploads use the provider-conform direct route only:** Browser → R2 presigned upload (single PUT ≤ 100 MB, multipart with 64 MB parts) is the supported path; the non-conformant server-proxy multipart fallback (4 MB parts, below the R2 5 MiB minimum) is removed. Direct failures surface their R2 error instead of silently falling back, every early multipart failure aborts the R2 session (no orphaned UploadId), and part sizes are asserted before upload. R2 bucket CORS is now a documented production requirement (DEPLOYMENT.md §3); files above 4 MB with direct upload disabled fail with a clear message.
- **SOS source amounts are parsed by source convention (no factor-100 errors):** `15,79` under the German profile (Darkmerch) now yields `15.79` instead of `1579`; Believe/Bandcamp/Shopify/Printful use the EN convention and reject a European decimal comma visibly instead of misreading it. Invalid or missing required amounts and malformed quantities become row errors with field/raw value instead of silent `0` or `Math.max(1, …)` replacements; quantities keep `0` and negative refunds. Manual amount/percent fields reuse the shared typed parsers.
- **SOS billing period is binding across every path:** A single validated accounting period (`resolveAccountingPeriod`, manual selection wins over detected source months) now feeds exports, Settlement Center, reporting, analytics, payout, workspace key, carry-forward and portal upload. Invalid or missing periods block export/publish with a clear message instead of silently substituting `Q1-<current year>`. Bronze archives are skipped with a visible reason when a source file exposes no reporting period instead of stamping the current month.
- **Portal invoices no longer claim “sent” when the mail failed:** `POST /api/portal/invoices` evaluates the Resend result, returns `email` + `warnings`, and the portal toasts a warning with the delivery error instead of a success message. Post-insert failures (statement status, ledger) are returned as warnings instead of losing the invoice, and a statement retry now returns the existing invoice (`200`) instead of a bare `409`.
- **SOS invoice mails go to the finance address:** The label recipient resolves from the SOS accounting `financeEmail` (Default preset) first, then Impressum/contact. The statement assistant hides the misleading “send copy to label” checkbox and shows the finance address instead.
- **Invoice PDFs are no longer sent as public R2 URLs:** Emails use an expiring HMAC token link (`/api/invoices/{id}/pdf?token=…`); portal and admin downloads use authenticated presigned routes. The stored `pdf_url` is never returned to the browser. (Ops: the R2 `invoices/` prefix must not be publicly readable for this to be a full fix — see DEPLOYMENT.md.)
- **Excel export no longer looks hung at “Preparing… ”:** The worker emits a `summary` phase before ExcelJS serialization, export buttons/dialog are disabled while the CSV worker is processing or still busy, timeouts show a specific “stopped after 5 minutes” message instead of the misleading raw-tabs error, and the workbook buffer is transferred without a second copy. Raw exports above 1.5 M rows fail closed with the row count and limit.
- **ZIP export shows Excel progress and skipped artists:** Per-artist raw Excel progress is forwarded to the ZIP toast, and artists without original-report Excel are counted and reported instead of only dropping a placeholder file.
- **SOS Excel raw tabs stay in one workbook:** Per-band original-report sheets are written in batches (yield + progress) instead of one `addRows` of the whole dump. The artist still gets a single `.xlsx` with filterable raw tabs.
- **SOS bronze upload 409 `already has archived content`:** Register was persisting `file_hash` before R2 upload, so every new batch looked archived. Hash is lookup-only at register and written at confirm. Pending `uploaded` batches stay writable. A second drop of the same file skips only when the first archive is **completed**; leftover unconfirmed same-hash rows are marked failed so retry can upload.
- **Incomplete statements are not downloaded:** If original-report files cannot be built, no package is written (ZIP-of-all gets a `_EXCEL_NOT_INCLUDED.txt` instead). Summary-only files are named `*_statement_summary-only.xlsx`. Believe commission columns match more header variants. Summary notes the CSV provenance.
- **Sync queue no longer stays at 1 running:** Odesli jobs that hit unresolvable or permanently failed URLs (artist profiles, 404/405/422) now write a fallback `smart_url` and stop rescheduling the same page. A full batch with zero progress no longer sets `hasMoreWork`. Cover art already on the label CDN is not re-downloaded every Spotify/iTunes/Discogs pass. Self-chain kicks time out instead of waiting on a child `waitUntil`.
- **Portal Spotify presence — no-sync months no longer chart as zero:** A month where the label scrape never ran (e.g. Last.fm data exists but no `apify`/snapshot rows) is now omitted from the listener/follower/plays series instead of being drawn as `0`. The filter that hid the in-progress month is generalized to every month lacking public Spotify data.
- **Portal Spotify presence — chart text no longer invisible:** Axis ticks, bar value labels, tooltip, and donut borders used `hsl(var(--muted-foreground))` et al., but the theme tokens are hex/oklch values, so the colour resolved to invalid black and disappeared on the dark background. Tokens are now referenced directly (`var(--muted-foreground)`), so labels, legends and tooltips render in the intended light grey.
- **Portal Spotify presence — exact-zero months carried forward:** A metric that is exactly `0` for a period (an incomplete scrape, or a metric join that missed that month) now reuses the previous non-zero value instead of dipping the trend line or the listener/follower KPIs to `0`.
- **Portal analytics hydration crash (`#418`):** `usePortalAnalyticsPreferences` read `localStorage` during the initial render, so the server and first client paint differed for the saved period preset / chart visibility — React threw a hydration mismatch. State now initialises from defaults and loads stored preferences after mount.
- **SOS artist splits after FrozenPlasma match:** Grouping still collapses `FrozenPlasma` / `Frozen Plasma`, but split fees, expenses, manuals, and opening balances now look up with the same key. Workspace Believe 80% / Bandcamp 50% applies again instead of the 50% default.
- **SOS default rates:** New workspaces start with Raphael’s label settings (digital 50%, physical 15%, Believe/Bandcamp 50%, physical 65%, Darkmerch 100%). Compilation filters and per-artist splits are not seeded. Importing a workspace JSON writes the Default preset (and the open period, if any) so it does not need to be uploaded again.
- **Settlement Save / Ready-for-draft crash:** “Save to Portal” and post-draft gold persist go through `POST /api/admin/sos/persist-analytics` instead of a Server Action inside `startTransition`, so large June CSV payloads no longer trip the production digest toast or `app/error.tsx`. `FrozenPlasma` matches roster **Frozen Plasma**.
- **Bandsintown cron/health after private-key move:** `syncAll` and Health read per-artist keys from `artist_private_data` (the public `artists.bandsintown_api_key` column is nulled). Concerts sync again without a global key; Health no longer shows Bandsintown as unconfigured when only private keys exist.
- **Spotify/Odesli cron enqueue sat idle:** `POST /api/sync-api` now kicks `/api/sync` after enqueue so jobs start immediately instead of waiting up to 5 minutes for the next process-queue tick.
- **Odesli no longer aborts a sync:** HTTP 429 skips that item and continues the batch (releases + artist platform links). Leftover work reschedules immediately; Odesli 429 does not park a full artist job for 15 minutes.
- **iTunes catalogs past 200 collections:** Lookup pages via Search `offset` (cap 1000). Name search uses the first hit when no exact artist name matches.
- **Cover uploads no longer fail silently:** Spotify/Discogs R2 failures are recorded like iTunes (`cacheReleaseCoverArt`).
- **Songkick/Bandsintown on the artist queue:** Cron/Admin enqueue per-artist jobs and kick the executor (YouTube stays a separate channel sync).
- **SOS bronze hash / compilation:** Active import batches have a unique `file_hash` (failed batches may retry the same file). Compilation summary revenue is converted to EUR. Quoted CSV newlines stay in one row.
- **SOS ingest / FX / gold:** Parser records intentional skips (Bandcamp payout, empty lines, no-artist 0 €) instead of dropping them silently. Ambiguous slash dates follow the source calendar (Believe/Printful DD/MM, Bandcamp/Shopify/Darkmerch MM/DD). Historical FX no longer pre-seeds fallback rates for missing months. Empty currency is EUR with a wizard warning. Persist keeps bronze `row_count`. Reprocess uses the session FX and opening balances.
- **SOS statement workflow:** Status updates must follow `STATEMENT_TRANSITIONS` (illegal PATCH → 422). One draft per artist+period and one invoice per statement are unique in the database (race-safe). Archive still does not require a prior lock; there is no unlock/unpay in the app.
- **SOS money / ledger:** Period payout (`amount_eur` / `finalPayout`) is period activity only — opening balance is a separate line and next-period `carry_in`. Carry-forward uses ledger outstanding cents (not recomputed invoice GROSS). Track splits must total 100% or they block the wizard and do not leak residual revenue. Invoice payment does not post a second ledger row after `invoice_liability`, and sets `received_at` if it was still empty.
- **Accounting drafts crash / silent errors:** `app/error.tsx` now reports render crashes to `/api/log-error`; chunk-load reload happens at most once per error. Statement history join, invalid period dates, and draft-create failures no longer take down the admin app. Settlement register reads an existing period (no write-on-GET) and loads ledger balances in one query.

### Changed
- **Portal Spotify presence redesigned to enterprise level:** Curated muted series/donut palette (no neon/rainbow), gradient area underlay for listeners/followers, refined tooltip + legend, larger chart heights, generous card padding, uppercase/tracking-widest KPI titles with `text-3xl` glossy values, larger section headings, roomier tables with uppercase `text-xs` headers and row hover. Charts carry `role="img"` + `aria-label` and an accessible `sr-only` table.
- **Portal Sales Analytics shows artist-net revenue:** Save to Portal writes territory/merch gold after the label share. Artists never see the pre-split total or the split rate. Excel / SOS reporting stay on the full breakdown.
- **Save to Portal no longer toasts “Gold totals differ”:** that compared pre-split gold to post-split statements and used warehouse jargon testers could not act on.
- **Bandsintown artist field:** Admin Artist form and portal Integrations label the lookup as **Bandsintown Artist Name** (the name on Bandsintown), not Artist ID. The API still stores it in `artists.bandsintown_id`.
- **Public Lenis feel:** Wheel uses lerp-only smoothing (`0.08`) so mouse notches interpolate instead of restarting a 1.1s ease. Anchor jumps keep a timed scroll. Official `lenis.css` imported.
- **Dependencies (Dependabot #554–#558):** `marked` 15→18, `@radix-ui/react-label` 2.1.15, `@radix-ui/react-menubar` 1.1.24, `@radix-ui/react-slider` 1.4.7, `@vitejs/plugin-react` 6.0.5.
- **Dependencies (Dependabot groups #562–#564):** `@radix-ui/*` patch/minor batch, `@aws-sdk/*` 3.1106.0, `eslint` 9.39.5, `eslint-config-next` 16.3.0, `typescript-eslint` 8.66.0.
- **Dependencies (Dependabot #566–#569):** `framer-motion` 12→13, `@tanstack/react-query` 5.101.4, `@tailwindcss/postcss` 4.3.3.
- **Dependencies (Dependabot #570–#571):** `@vercel/functions` 3.9.1, `vitest` 4.1.10.

### Security
- **Dependency vulnerabilities patched:** `next` 16.2.11 → 16.3.5 (critical RCE advisories), `sharp` 0.35.3 → 0.35.4 (libheif), Tiptap 3.29.2 → 3.31.3, `vitest` 4.1.11, plus overrides for `browserslist` 4.29.0, `baseline-browser-mapping` 2.11.24, `smol-toml` 1.8.0, `js-yaml` (4.3.2 / 3.15.2), `ajv` 8.20.0, `qs` 6.16.0, `undici` 6.28.1 and `@lhci/cli`’s `uuid` 11.1.1. `npm audit --omit=dev --audit-level=moderate` reports **0 vulnerabilities**. Residual dev-only advisories remain in the Lighthouse toolchain (`lighthouse` → `puppeteer-core` → `@puppeteer/browsers` → `extract-zip`, no patched release upstream) and stay outside the security workflow’s production-dependency gate.

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
