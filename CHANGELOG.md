# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Product version lives in `package.json` and is shown in Admin → System Health.
Release ritual: [docs/RELEASING.md](docs/RELEASING.md).

## [Unreleased]

### Added
- **DarkTunes GPT/MCP connector (off by default):** OAuth-scoped CMS read tools, news-draft preparation and bounded updates to artists, releases and events using explicit, single-use website approvals. Visibility, publishing and deletion cannot be invoked by external MCP clients. See `docs/MCP_CONNECTOR.md`.
- **AI Assistant 2.0:** context-aware assistant workspace with conversation history, rename/delete, reload restore, Markdown answers, throttled streaming, tool activity rows, auto-scroll and a mobile full-screen layout. The editor dashboard now mounts the assistant too.
- **AI context selector:** artist memberships, admin artist search and label-wide context; the active context is always visible in the header.
- **AI Admin Control Center:** Overview, Models (Fast/Reasoning/Fallback), independent Connection Health probes, token usage charts (input/output/reasoning, model, role, budget, failures) and filtered Diagnostics with a copyable report.
- **AI turn lifecycle:** per-conversation turn lock, persisted `active_request_id`, cancellation flag, structured tool history, `incomplete` message status and `AI_TURN_IN_PROGRESS` / `AI_CANCELLED` / `AI_ARTIST_*` error codes.
- **AI usage telemetry:** success/failure, error code, latency, TTFT, rounds, retry/fallback metadata per turn.
- **Task-oriented admin overview:** `/admin` now shows real work queues (release/video submissions, artist-page reviews, unread artist messages, statements to review, overdue invoices), recent activity and compact content metrics, gated on the server by role. Editors no longer query finance or diagnostic queues.
- **Role-aware assistant errors:** one central projection maps provider/configuration failures to artist, editor and admin wording. Artists and editors never receive "Admin → API Keys" instructions; raw codes stay available only in protected diagnostics.
- **Contextual assistant suggestions:** the empty state offers 3–4 questions tied to the current page and to tools the signed-in role can actually call.
- **Technical operations navigation:** system, AI, API-key and support entries are grouped separately from label business functions.


- **Admin → AI Assistant → Models:** pick Fast and Reasoning from the live NVIDIA `/v1/models` list and save them to `ai_settings`. Chat and Test Connection use the saved IDs (defaults stay `nvidia/nemotron-3.5-lightning-30b-a3b` / `nvidia/nemotron-3-super-120b-a12b`).
- **Personal Artist Page NEWS block** showing that band’s label news plus band-authored posts. Artists write posts at Portal → Band news (`artist_news_posts`); they never appear on `/news`.
- **Hero band logo toggle** on the Personal Artist Page (uses `artists.logo_url`).
- **Up to 3 video-submission thumbnails** uploaded to R2 (`video-submissions/{artistId}/`, 4 MB each via the server proxy).
- **Release submission files on R2:** artists upload audio (one ZIP/WAV/FLAC/AIFF/MP3, 32 MB) and JPEG cover (5 MB, 3000×3000) directly to private R2. Admin downloads via presigned links. Files auto-delete 30 days after submit (`POST /api/purge-release-submission-assets` — create the Cron job in the Supabase dashboard).
- **Rejected submissions can be edited** and resubmitted on the same row, with a required message from the label.
- **Admin → Assets: “All R2 objects” view** — toggle between the DB-tracked catalog and a full listing of every object in Cloudflare R2, with prefix/folder sizes, token search on object keys, and delete-selected to free storage.

### Changed
- AI chat defaults to the fast model; deterministic task classification (or explicit Auto/Fast/Deep) selects reasoning. Reasoning uses low effort when supported and has a larger output budget.
- Connection tests run fast and reasoning independently; a reasoning timeout no longer hides fast/stream/tool success.
- The assistant prompt, tools and conversations are strictly bound to the resolved role/artist context. Admins can inspect an artist without an `artist_members` row; invalid artist IDs are rejected instead of silently falling back.
- Empty, reasoning-only and length-truncated answers are classified and are never stored as successful empty chat turns.
  - SSE parsing now handles split frames, split UTF-8, CRLF, multiple frames, `[DONE]`, error events and decoder flush.
  - Admin sidebar navigation is grouped by activity (content, submissions, communication, finance, press, people, settings, technical operations) and widened to 64 units; group labels have stronger contrast and spacing.
  - Assistant chat no longer shows model names, provider labels or token counts. These remain in the protected AI management area. Mode labels read Fast/Detailed instead of model jargon.
  - Portal help rewrites feature-flag, offline, download-link, conflict and sync wording into artist tasks while keeping the same topics and routes (EN/DE/FR).


### Fixed
- **"No artist linked to this account" for admins:** the AI auth resolver no longer requires an artist membership for admin/editor artist inspection, and only sends tools the actor can execute.
- **Wrong history window:** conversations load the newest 80 messages (and paginate older pages) instead of the oldest 80. Message pages are returned chronologically, not newest-first.
- **Retry duplicated the user question:** a retry now reuses the last user message when only failed/cancelled assistant/tool rows follow it, and trims the failed answer from the model context.
- **Provider retries could outlive the route:** a 105 s turn timer aborts the controller, so 3× long provider timeouts cannot exceed the serverless budget.
- **Tool history loss:** tool calls and results are paired and persisted; incomplete tool groups and extra/duplicate tool replies are never sent to NVIDIA.
  - **Empty assistant bubbles:** failed/empty turns render a specific error card and are persisted as failed/cancelled.
  - **Raw exception text in the client error boundary:** `ErrorFallback` no longer renders `error.message`; production shows a safe explanation and an optional digest reference. The "Analyze this error" action appears only on admin/portal routes and only when a reference exists.
  - **Role-inappropriate error instructions:** artists no longer see provider names, API-key setup paths or "go to Admin" advice. Provider and configuration failures map to role-specific wording.
  - **Artist tools bound to the wrong artist:** self-artist tools now require the server-resolved artist to be in the actor's membership list (or staff with `cms.artists.manage`), even if a caller constructs an actor manually.
  - **Dashboard hid read failures as “all clear”:** `getAdminDashboardData` now reports which queues or the activity feed could not be read, and `/admin` shows an incomplete-data warning instead of a false empty state. Metric counts that fail are shown as `—`.
  - **Reviewed submissions were missing from the work queue:** release and video queues now count `received` and `reviewed` because both still need a final decision.
  - **Ignored errors raised the system notice:** the dashboard error count now excludes `ignored` rows, matching System Health.
  - **Overdue cutoff and activity times used UTC:** the dashboard now resolves the operator time zone from site settings for the invoice cutoff and the activity formatter.
  - **`/admin` used the primary role instead of capabilities:** the page now resolves effective access (`admin.panel.full` / `admin.panel.editor`), so custom roles are treated consistently with middleware.
  - **Assistant “not configured” was reported as “turned off”:** `AI_NOT_CONFIGURED` now has its own role wording and the admin shortcut appears for not-configured, disabled and role-disabled states.
  - **Artwork suggestion was not backed by a tool:** the release-page suggestion now requires the help tool, so the assistant can actually answer it.
  - **Error copy promised a reference that could be absent:** the boundary body no longer tells users to send a reference; the reference is shown when a digest exists.
  - **New dashboard query code had no direct test:** added a DAL test for status filters, ignored errors, time zone cutoff and failed reads.


- **Stop did not stop the server:** the request signal, provider abort and DB cancellation flag now stop the turn and persist the partial answer.
- **Usage undercount:** failed/aborted turns now write usage events with partial or settled tokens.
- **Streaming performance:** deltas are batched per animation frame instead of one React update per token.
- **NVIDIA reasoning-only / length answers** are reported as `AI_REASONING_EXHAUSTED` / `AI_OUTPUT_TRUNCATED` with a fast-model retry action.
- **Abort memory leak:** aborted request IDs are cleaned after the stream/body completes.

### Changed
- Personal Artist Page gallery reads Portal → Profile → Gallery (`epk_gallery_photos`); per-block gallery uploads are gone.
- Portal calendar uses FullCalendar (month + list) instead of the homebrew grid.
- Release date picker uses the house `DateField` calendar with `navLayout="around"` so month arrows no longer cover the grid.
- Catalogue number, EAN, and release-level ISRC are hidden from the artist form (admin assigns them). Track ISRC is labelled “only if already released”. Rights & Other wizard steps are removed. Instrumental hides the author field.
- Track Continue goes to the next track; Review lists every track. Admin guided review shows the received release; Excel export columns reorder by drag; accepted drafts open `/admin/releases?id=`.
- **AI assistant (NVIDIA NIM)** for the artist portal and admin dashboard: encrypted `nvidia_api_key` under Admin → API Keys, token budgets with atomic reservation, streaming chat (`Ctrl+J`), server-side tools over existing DAL, error classification, and Admin → AI Assistant. Live NVIDIA smoke tests: `AI_LIVE_TESTS=1 npm run test:ai:live` (skipped without a key).

### Fixed
- **AI assistant replies were empty (and Test Connection `stream` failed):** NVIDIA Nemotron streaming can put the answer in `delta.reasoning` / `delta.reasoning_content` when thinking is disabled, while the non-streaming path swaps it into `content`. The provider now uses reasoning-channel text as the answer for thinking-off turns, accepts a JSON body when `stream:true` is ignored, and fails with a specific `INVALID_RESPONSE` instead of silently completing an empty turn.
- **AI NVIDIA calls did not retry transient failures:** 429/502/503/504, timeouts, and network errors now retry up to 3 times (Retry-After or exponential backoff). Explicit abort still stops immediately. SSE frames with CRLF are parsed. Deleting a conversation sends the session token. Tool-round count no longer overshoots `max_tool_rounds`; the last assistant text is kept after a tool round.
- **Stop applying `reset.sql` on every deploy.** Vercel install and CI no longer run `db:apply`. Schema apply is manual (`npm run db:apply` / SQL Editor / GitHub **Deploy Supabase** dispatch). `apply-schema.mjs` uses `psql` statement-by-statement again.
- **Band news HTML could run on the public Personal Artist Page:** the news dialog now sanitizes with `sanitizeHtml`, same as BioBlock.
- **Empty Profile gallery still showed leftover builder uploads** on the gallery block. An empty live photo list now wins over document JSON.
- **Video thumbnails advertised as 5 MB died on Vercel:** they go through the 4.5 MB function body. Upload now uses `uploadViaServer` (4 MB cap, specific 413/size errors). Submit only stores thumbnail URLs under `video-submissions/{artistId}/` on the R2 public host.
- **Video submit 500 (`form_data` missing in PostgREST):** live `video_submissions` never got the JSONB column because it lived only in `CREATE TABLE IF NOT EXISTS`. `ADD COLUMN IF NOT EXISTS form_data` is now in `reset.sql` — apply with `npm run db:apply` and reload the schema cache.
- **Submission file purge could blank a resubmitted download:** deleting an old R2 object also nulled `audio_r2_key` / `cover_r2_key` even when the row already pointed at a newer key. Purge now matches the key. TTL is refreshed on submit (30 days from submit, not from the first upload). Rejected resubmit is one SQL RPC and clears the old reject message. Create draft copies the JPEG to the public `cover-art/` prefix.
- **Believe Q4 bronze CSV (~64 MB) died in ~8 s with a fake “offline” error:** AWS SDK v3 signs `x-amz-checksum-crc32` of an empty body into presigned PUT/UploadPart URLs. The browser PUT of the real file fails, and R2’s 403 has no CORS headers, so the UI blamed VPN. `createR2Client` now sets checksum calculation/validation to `WHEN_REQUIRED`. Multipart parts no longer send `Content-Type` (it is not in the signed headers). A failed R2 PUT is reported as an archive/CORS problem, not as “the browser could not reach the server”. Part counts for the local example files are locked (`planBronzeDirectUpload`): Q4 63 671 078 bytes → 4 parts; Q1 71 684 050 bytes → 5 parts, last part below 5 MiB (legal as the final part).
- **Admin System Health toast-failed with a valid session:** `GET /api/health?mode=full` required a live Bearer token and swallowed cookie fallback, so a stale in-memory JWT 401’d while Accounting still worked. Full health now uses `requireAdminFromRequest` (Bearer, then cookie). The widget renders a 503 snapshot instead of treating it as a transport failure. The route’s `maxDuration` is 60 s so the snapshot + watch-rule scan is not killed at the default 10–15 s budget.
- **AI confirmations could run twice:** two concurrent Confirm clicks both passed the used-token check. The consume update now requires a row with `used_at IS NULL` and returns 409 if another request already used it.
- **AI diagnostic reports accepted LIKE wildcards in `error_id`:** `%` / `_` could match another user’s log row. `error_id` is now a literal token and the newest matching log wins.
- **Zammad outbox could send the same assistant ticket twice** when two serverless drains ran together. Drain now claims each row as `sending` before calling Zammad.
- **Assistant “recent errors” hid a log-store failure as an empty list.** The tool now reports that the log could not be read.
- **NVIDIA connection-test failures all read “NVIDIA is currently unavailable”:** `POST /api/admin/ai/connection-tests` now maps each provider error to its specific code and message — timeout (`AI_PROVIDER_TIMEOUT`, 504), network (`AI_PROVIDER_NETWORK_ERROR`, 503), TLS (`AI_PROVIDER_TLS_ERROR`, 503), rate limit (`AI_PROVIDER_RATE_LIMITED`, 429), model unavailable (`AI_PROVIDER_MODEL_UNAVAILABLE`, 502) — instead of defaulting every failure to `AI_PROVIDER_UNAVAILABLE` / 503. The client shows the specific cause plus the `error_id`.
- **Asset library picker hid band photos and only showed logos:** `AssetPicker` ignored the folder you clicked whenever it was opened with an artist (News hero, Release hero, Artist form) and listed `assets.artist_id` instead. File Explorer uploads into `artists/{name}` do not set `artist_id`, so photos vanished and logos remained. The picker now lists the selected folder, and with an artist it opens in that artist’s folder. Admin upload no longer looks for an artist folder with `parent_id IS NULL` (those folders live under `artists/`), so new form uploads land in the same place.
- **Scheduled YouTube videos appeared before release with their upload date:** the channel sync picked up scheduled/private uploads from the uploads playlist and stored the upload date (e.g. EXTIZE – Zero Gravity dated 19 Aug instead of its 16 Oct release), so they showed early and sorted far down. The sync now reads each video's status and skips anything not public or still an upcoming premiere; the Supabase cron `sync-youtube-daily` runs hourly so releases show within an hour.
- **R2 orphan purge aborted on the first failed S3 delete and left stale stats:** one failing `DeleteObject` threw out of the batch (no retry, snapshot untouched). The response now separates `deleted`/`skipped`/`failed`, a failed object keeps its row so the next batch retries it, and the snapshot's `orphan_count`/`orphan_bytes`/`used_bytes`/`object_count` are updated to what was actually deleted (a failed stat write never fails the purge — the next scan reconciles). The Maintenance card reports the remaining/failed counts instead of a plain success toast when work is left.
- **A failed artist list read looked like "no artists":** `ArtistsManager` now shows the load error with a Retry instead of an empty table.
- **A sync run with failed jobs read as a clean success:** `/api/sync` writes `status: 'partial'` to `sync_runs` (and the worker `cron_ticks`) when jobs failed but the drain did not crash.
- **Duplicate sync jobs could be enqueued:** the `enqueueArtistSyncJobs`/`enqueueOdesliSyncJob` dedupe reads now check the PostgREST error instead of treating a failed read as "nothing queued".
- **Resolve/Ignore on a log row failed silently:** `LogsManager.updateLog` now toasts the real error (with error ID) instead of an empty catch.
- **Persisted app-log messages could carry PII/tokens:** `writeAppLog` scrubs emails and tokens from the message before it reaches `app_logs`; long numbers are kept so metric/status logs stay readable.
- **Admin Logs looked empty when the query failed:** every log tab (Sync Log, Sync Errors, App Errors, RBAC Audit, Admin Actions) swallowed read errors and rendered an empty table, so a 500/RLS failure was indistinguishable from "no logs". All five tabs now share one panel that shows the real error message and a retry, while a query failure no longer clears the page silently.
- **Failed `sync_logs` writes disappeared:** the eight sync-log inserts (artist sync, multi-API sync, `/api/sync-api`, `/api/sync-youtube`, listener/Spotify analytics) dropped the PostgREST error. They now go through one `recordSyncLog` helper that reports a failed insert to `app_logs` and the console instead of losing it. The unused `getSyncLogsByArtist` DAL function is removed.
- **`app_logs` write failures were invisible:** `writeAppLog` now returns whether the row was persisted, and `POST /api/log-error` returns 503 when the log store rejects the write (missing columns/RPC or DB error). Client log helpers surface that status.
- **A broken log table looked like a database outage:** `checkDatabaseLiveness` probed `sync_logs`. It now probes the neutral `artists` table, and a new log-store probe (`checkLogStore`) reports `app_logs`/`sync_logs` schema drift as a `logs` field on `/api/health` (lite) plus a "Log tables unreadable" alert in the full snapshot.
- **Cron heartbeats read failures looked like "never ran":** `getHealthHeartbeats` reports which tick kinds could not be read, and cron health shows "Cron status unknown" instead of a false "Awaiting first tick".
- **RBAC Audit search only filtered the visible page:** the search term is sent to `/api/admin/rbac-audit` (new `search` query param) so matches on older entries are found.
- **Log search terms broke the PostgREST filter:** a search containing `,`, `(`, `)` or `%` produced an empty page with no message; the term is now sanitized in all log tabs (and in the RBAC route).
- **The apiSource=youtube admin sync synced a different number of videos than cron:** `/api/sync-api` fetched 20 videos while `/api/sync-youtube` fetched 500. Both now call the shared `syncYouTubeChannel` with the same 500 cap and the same `sync_logs` row.
- **Sync Log tab shows `duration_ms`** and the source filter lists every `api_source` (lastfm, soundcharts, apify, songkick, bandsintown included).

- **Bronze CSV uploads of 60–100 MB failed and could not recover:** files above 32 MB now use direct multipart (16 MB parts) instead of one non-resumable PUT, every PUT retries up to 4 attempts with a freshly signed URL after a dropped connection or an expired signature (each attempt capped by a size-scaled timeout, 2–14 minutes, so a stalled connection cannot hang the queue and a slow-but-working link is not cut off), and bronze archives run one at a time so concurrent large CSVs no longer starve the uplink. A file removed while it waited in the queue is no longer archived. The presigned single-PUT cap drops from 100 MB to 32 MB (`bronzeUploadLimits.ts`).
- **Bronze retries could lose their batch and orphan multipart parts:** each file now reuses a persisted `operation_id`; registration is idempotent, all request phases have deadlines, and confirm failures keep the batch retryable. Multipart IDs are persisted before init returns, and failed, deleted, or restarted batches abort known sessions. The existing R2 scan aborts abandoned uploads older than 24 hours and clears matching batch metadata.
- **Confirmed source archives could change after verification:** direct PUTs now target a temporary R2 key. Confirm copies to a final key, verifies the final SHA-256, then atomically stores the final key, hash, and completed state. Outstanding presigned URLs can only modify the temporary key.
- **Statement archive checks trusted browser counts:** statement creation now checks the saved period workspace and every source batch's completion status, hash, and period overlap. PDF-only statements remain an explicit no-source path. Workspace batch IDs now trigger persistence even when accounting rules do not change.
- **Upload success appeared before durable archiving:** the UI now distinguishes file intake from parsing and archive completion. Archive errors show the operation ID used to find phase logs.
- **Browser noise opened support tickets:** window errors from other origins and `ResizeObserver loop` are not sent to `/api/log-error`.
- **Repeat crashes vanished when log aggregation failed:** the fallback insert no longer sets a unique fingerprint, so the next identical crash is still stored.
- **A failed membership read looked like an empty export:** the artist download fails if `artist_members` cannot be read.
- **A shared promo cover was logged on the wrong release:** the download uses the release id the journalist clicked, and refuses the file if that release does not own the URL.
- **Scheduled news stayed "scheduled" after it went live:** `/api/sync` now promotes due posts to `published` with the service role. The public list already showed them.
- **Contact and press-application limits were per server:** both routes use `checkDistributedRateLimit` (Upstash when configured, otherwise the old in-memory counter). A filled contact honeypot now returns success instead of a validation error.
- **Artist data export skipped money records:** the JSON download includes that user's invoices, billing profile, and statements. Storage keys and PDF URLs are not included.
- **Artist HTML could run in the visitor's browser:** Server render no longer uses a regex strip. `sanitizeHtml` runs DOMPurify on a jsdom window registered at startup. `<svg/onload=alert(1)>` and `javascript&#58;` links are removed before the page HTML is sent. If that window is missing, tags are escaped.
- **Press downloads signed any private file:** Stream and download actions only sign a stored promo-track key, a press-approved downloadable asset, or an `is_promo` cover/preview. The signed value is the stored one. A future embargo is refused and those tracks are left out of both promo-pool pages. An NDA download needs a short-lived token from the checkbox action. Inserting a download row from the browser is not enough.
- **Short track titles stole other royalties:** A rule for "Cut" no longer matches "Haircut". Assignment is an exact title match. The longer exact rule wins. Equal length prefers the track title.
- **SEPA control total could disagree with the lines:** Each payout is rounded to cents first. The control total is the sum of those cents. The payment note is cut to 140 characters before it is escaped, so an `&` is not sliced in half.
- **Account delete promised a 7-day wipe it never did:** The page and API now say the login email and display name are anonymised, sign-in is blocked, and invoices and statements are kept. `users.full_name` is set to `Deleted user`. The auth user and financial rows are not deleted.
- **Portal photo compression could produce a blank image:** When quality reduction alone could not reach the size budget, `compressImage` resized the canvas it wanted to copy from. Resizing clears a canvas, so the half-size fallback encoded an empty image (portal profile photo, onboarding photo). It now draws into a separate half-size canvas.
- **Admin uploads above 4 MB showed “Something went wrong on our end”:** Vercel rejects request bodies above 4.5 MB with a plain-text 413 before `/api/upload` runs. The client could not parse that and fell back to the generic server error (for example a 6.5 MB PNG artist logo). Admin uploads (artist/release/news/video image buttons, Tiptap image/file dialogs, site settings, file explorer) now go through `src/lib/uploads/adminServerUpload.ts`. Files above 4 MB are refused before sending, with the file name, real size and limit. Files are never compressed or converted: the old silent client compression above 20 MB in `ImageUploadButton` is removed. A 413, a dropped connection or an unreadable response each get their own message.

- **A retried or double-clicked period close double-booked the carry-forward ledger:** `POST /api/admin/settlements/periods/{id}/archive` ran the carry-out append again on every retry. The close now returns early for an already-archived period, skips a second `carry_out`/`carry_in` per artist, and a partial unique index on `artist_settlement_ledger` carry rows (`artist_settlement_ledger_carry_unique`) makes even two concurrent close requests idempotent — exactly one carry is posted per `(period, artist)` (contract §A.5). A racing create of the next settlement period is re-read instead of failing the second request.
- **Two invoices for one artist in the same year could collide:** the portal retries the internal `DT-YYYY-NNNN` number on a unique violation instead of failing, and `createSosLinkedInvoice` distinguishes the invoice-number constraint from the statement index instead of reporting a false "invoice for this statement already exists".
- **A draft invoice could be marked received without ever being sent:** only a `sent` invoice can move to `received` now (contract §A.4); the admin UI already only offered the action for sent rows.

### Security
- **`app_logs` accepted browser writes from any signed-in user:** the `app_logs: authenticated insert` policy let any authenticated account insert forged or spam error rows directly through PostgREST, bypassing the rate-limited `/api/log-error` route. The policy is dropped; writes stay service-role only.
- **Financial RPCs are service-role only:** `record_invoice_payment` and `record_statement_view` are `SECURITY DEFINER` and previously left `EXECUTE` at the Postgres default (PUBLIC), so any caller using the public anon key could call them through PostgREST and mark arbitrary invoices paid or spoof statement views. Both now `REVOKE ... FROM PUBLIC, anon, authenticated` and `GRANT ... TO service_role` like the other privileged RPCs, and their callers use the service-role client.

### Changed
- **Log totals are estimated:** the Sync Log, Sync Errors, App Errors and Admin Actions tabs request an estimated row count instead of an exact `count(*)` over an ever-growing table (which can hit the statement timeout and answer 500).
- **`POST /api/admin/maintenance/clear-logs` counts in the database:** the endpoint calls a new `clear_log_table(p_table)` RPC (service-role only, internal allowlist) that deletes in one statement and returns the count, instead of loading every deleted id into the response.
- **`verify:schema-columns` now covers `app_logs`, `sync_logs` and `cron_ticks`,** so the schema-drift class that produced this incident fails CI.
- **SOS CSV parsing is truly streamed:** `parseCSVContentStreaming` now feeds Papa's chunked string streamer, so a 68 MB Believe export no longer materializes the whole row array in memory; only the current chunk and the parsed transactions are held.
- **Carry-forward computation batches its loads:** one ledger and one invoice query per period instead of two queries per artist.
- **Error messages name cause and reference:** `SERVER_ERROR`, `CONFIG_ERROR` and `DB_ERROR` no longer share “Something went wrong on our end”. Every 5xx from `withErrorHandler` returns `error_id` (`ERR-XXXXXXXX`), and the same ID prefixes the `app_logs` message. `getErrorMessage` appends it, so users can report an ID that admins find in Admin → System → Log Manager. Postgres errors now return `DB_ERROR` instead of `SERVER_ERROR`. Unreadable responses in `getResponseErrorMessage` report the HTTP status (`RESPONSE_UNREADABLE`).
- **Cron jobs are plain HTTPS, managed in the Supabase dashboard:** `supabase/reset.sql` no longer registers any `pg_cron` job and drops the `trigger_sync_worker/enqueue/youtube()` + `get_vault_secret()` wrappers. They read an empty Vault and silently sent nothing, so scheduled YouTube and artist syncs had stopped. HTTP jobs now call `https://www.darktunes.com/...` directly with the Bearer header (the apex redirect drops `Authorization`). `scripts/apply-schema.mjs` no longer writes Vault secrets. See `DEPLOYMENT.md` → Sync Scheduler.
- **YouTube cap message:** A capped channel sync now reports “Synced newest 500 videos (channel cap).” instead of suggesting a re-run would fetch older videos.
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
- **SOS Excel worker transfer:** ExcelJS `writeBuffer()` is copied into a real `ArrayBuffer` before `postMessage` transfer, so Excel download no longer dies with “Value at index 0 does not have a transferable type.” The transfer-then-fallback send (`postWithTransferFallback` in `transferableBuffer.ts`) is now a tested helper instead of an inline try/catch.
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
