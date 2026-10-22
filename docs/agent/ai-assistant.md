# AI Assistant

NVIDIA NIM-backed assistant for the artist portal, editor dashboard and admin dashboard.

## Enablement

The assistant stays off until:

1. An NVIDIA API key exists (Admin -> API Keys, group NVIDIA, or `NVIDIA_API_KEY`).
2. Admin -> AI Assistant has **enabled** turned on (`ai_settings.enabled`).
3. The role context is enabled in `ai_settings.feature_flags` (`artist`, `editor`, `admin`).

`AI_ENABLED=true` only seeds/overrides enablement for local tests. `test_mode` allows the mock provider outside production.

A configured key is **not** proof of authentication. Admin -> AI Assistant -> Connection Health performs a real `GET /v1/models` auth check. The Overview labels "Configured" and "Verified" separately.

## Context model

The server resolves every request into one typed actor:

- **Artist portal:** artist context comes from `artist_members`. Multiple memberships expose a selector; the first is the default.
- **Admin dashboard:** label context by default. Selecting an artist creates an admin-scoped artist context; the admin does **not** need an `artist_members` row.
- **Editor dashboard:** label/editor context by default. An artist context requires a membership or `cms.artists.manage`.
- **Invalid artist:** explicit 4xx (`AI_ARTIST_INVALID` / `AI_ARTIST_FORBIDDEN`). Never a silent context switch.
- **Conversation binding:** `access_context` + `artist_id` are stored and must match the current actor. A conversation cannot be reopened in another context.

URL parameters are never authorization. Tool visibility is computed from role, capabilities, data scope and artist scope, and the same checks run again at execution.

## Models and reasoning

Defaults (also `ai_settings` column defaults / `DEFAULT_AI_MODELS`):

| Role | ID |
|---|---|
| Fast | `nvidia/nemotron-3.5-lightning-30b-a3b` |
| Reasoning | `nvidia/nemotron-3-super-120b-a12b` |

Normal chat uses the fast model. `classifyTurn()` is deterministic: reasoning is selected for explicit Deep mode, an `ERR-` reference, or at least two diagnostic signals (root cause, correlate, analyze, investigate, compare, why-failed, multi-step). Artists stay on fast unless they explicitly choose Deep.

Reasoning uses `enable_thinking=true` with `low_effort` when the model supports it. `reasoning_budget` is sent only when low effort is off and the capability was confirmed. `force_nonempty_content` is sent when thinking is off and supported. `max_tokens` includes reasoning tokens; the reasoning default is 8192, the fast default 1200.

A reasoning-only answer, an empty answer and a length-truncated answer are separate failures (`REASONING_ONLY`, `EMPTY_RESPONSE`, `OUTPUT_TRUNCATED`). They are never stored as a successful empty chat turn. The orchestrator makes one repair call (answer-only, no tools). An optional `fallback_model` is used once before any tool round when it has a passed connection test; the fallback is recorded in the usage event and shown in the UI.

## Provider protocol

`src/lib/ai/provider/nvidia.ts`:

- OpenAI-compatible `messages`, `tool_calls`, `tool_call_id`, `tool_choice`, `stream_options.include_usage`.
- `chat_template_kwargs.enable_thinking`, `.low_effort`, `.force_nonempty_content`; optional top-level `reasoning_effort` / `reasoning_budget` only when the profile or a live test confirmed support.
- SSE parser (`sse.ts`) is stateful: CRLF/LF, frames split across chunks, UTF-8 split across chunks, multiple frames per chunk, multi-line data, error events, `[DONE]`, decoder flush and final-frame flush.
- Streaming exposes `open`, `delta`, `reasoning_delta`, `tool_call_delta`, `usage`, `done`. Reasoning text is not shown to normal users.
- Bounded retries: 3 attempts, jittered exponential backoff, `Retry-After`, no retry after a stream started, no retry for invalid keys/unsupported requests. `abort()` and `AbortSignal` cancel both in-flight reads and pending backoff.
- Empty/truncated/reasoning-only completions are rejected before persistence.

Hosted NVIDIA inference can return HTTP 503 `ResourceExhausted: Worker local total request limit reached (N/N)`. The error remains `PROVIDER_UNAVAILABLE` and is retried within the bounds above.

## Turn lifecycle and persistence

`runAiTurn()` (`src/lib/ai/orchestrator/runTurn.ts`) owns one turn:

`queued -> connecting -> waiting/thinking -> streaming -> tool_running -> completed | cancelled | failed`

- A conversation turn lock (`ai_conversations.active_request_id`) rejects concurrent turns with `AI_TURN_IN_PROGRESS`. Stale locks recover after 2 minutes.
- The assistant placeholder is inserted before the model call (`ai_messages.status='streaming'`), updated at the end, and marked `cancelled`/`failed` on abort/error. Empty failed placeholders render as an error card, not a bubble.
- Tool rounds persist as an assistant message with `tool_calls`, followed by `tool` messages with `tool_call_id` and safe metadata. `buildProviderHistory()` drops incomplete/orphan tool groups so NVIDIA never receives an invalid transcript.
- The newest 80 messages are loaded (newest-first query, reversed for the model). The conversation API paginates newest pages with a `before` cursor and returns each page in chronological order for the UI. `slideConversationWindow()` treats an assistant tool-call group and its tool replies as one atomic unit.
- A retry reuses the last user message only when every row after it is a failed/cancelled assistant or tool row; the failed answer is trimmed from the model context so retries do not duplicate the user question.
- Cancellation: the same serverless instance aborts immediately via `AbortSignal`; other instances observe `cancel_requested_at` at the next round/tool checkpoint. The UI stop button also aborts its fetch and marks the partial answer cancelled.
- A 105 s turn timer aborts the controller, so provider retry attempts cannot run past the route budget. Timeout, overload and user cancellation remain distinct.
- Connection Health leaves an untested capability (`supports_enable_thinking` / `supports_low_effort`) as `null`, not `false`; configuration discovery never downgrades a known model capability without evidence.
- Usage is settled per round. Provider usage is authoritative; estimates are marked `usage_source='estimate'`. Failed/aborted turns settle the known partial usage and write a `success=false` event. `ai_usage_events` stores latency, TTFT, rounds, retry/fallback metadata and error code (no message content or tool payloads).

## API

REST resources under `/api/ai/*` and `/api/admin/ai/*`. Chat turns stream SSE events: `status`, `delta`, `tool_start`, `tool_result`, `usage`, `warning`, `confirmation_required`, `error`, `done`.

Conversation API: list/create (`GET/POST /api/ai/conversations`), detail/rename/delete (`GET/PATCH/DELETE /api/ai/conversations/{id}`), messages (`POST .../messages`), cancellation (`POST .../cancellations`).

Admin API: settings, models/capabilities, independent connection tests (`scope: fast|reasoning|all`), usage (input/output/reasoning, model, role, day, budget, failures), diagnostics (filters, tool failures, repeated errors).

## Tools

Server-side `ToolRegistry`. Only tools the actor can actually execute are sent to the model.

- `self_artist`: requires an active artist and an artist context, membership or `cms.artists.manage`.
- `label`: requires a non-artist context and every declared capability. Editor tools require `admin.panel.editor`; full admin tools require `admin.panel.full`.
- `none`: help/support tools for every role.

Execution re-checks authorization, validates Zod arguments, enforces timeout/size limits, catches tool errors as tool results (a failed read does not kill the chat), and writes `ai_tool_executions` (no payloads). `echo_test` is not offered to the model; it exists for diagnostics.

Write tools only prepare a payload. `POST /api/ai/action-confirmations` re-checks authz, then runs existing DAL (EPK bio, press quote, release wizard draft, Zammad outbox, diagnostic report). Consuming a confirmation marks the row used with `UPDATE ... WHERE used_at IS NULL` and rejects a zero-row update. Confirmation tokens are not stored in the model transcript.

## Admin AI Control Center

`/admin/ai` contains Overview, Models, Connection Health, Token Usage, Diagnostics and General settings.

- **Overview:** enabled/disabled, key configured, verified/not verified, last successful/failed live test, active models, tokens today/month, fallback.
- **Models:** Fast/Reasoning/Fallback selectors, full IDs, token limits, tested streaming/tools/reasoning/low-effort capabilities, last test result. Configuration and tested capabilities are separate.
- **Health:** independent fast and reasoning probes plus a full integration verdict. Step statuses: `passed`, `failed`, `timed_out`, `unavailable`, `not_tested`, `skipped`. A reasoning timeout does not hide a working fast model, streaming or tools.
- **Usage:** input/output/reasoning tokens, today/month, per model, per role, reserved vs. used budget, failed calls, daily trend. No invented costs.
- **Diagnostics:** recent failed/aborted turns with time/model/error filters, request IDs, latency, rounds, tool failures, repeated-error groups, saved analyses and a copyable report. Confirmed fields come from stored events; hypotheses are not presented as facts.

## Schema

Apply `supabase/reset.sql` (`npm run db:apply`). No `supabase/migrations/`.

Additive columns used by this version:

- `ai_conversations`: `active_request_id`, `active_request_started_at`, `cancel_requested_at`
- `ai_messages`: `tool_calls`, `tool_call_id`, `metadata`, status `incomplete`
- `ai_usage_events`: `success`, `error_code`, `latency_ms`, `ttft_ms`, `rounds`, `metadata`
- `ai_settings`: `fallback_model`, `last_successful_connection_test`, `last_failed_connection_test`

`CREATE TABLE IF NOT EXISTS` does not alter live tables; the matching `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` statements are required.

## Tests

- Mock unit/route tests run in `npm test` / `npm run ci`.
- Live NVIDIA: `NVIDIA_API_KEY=... AI_LIVE_TESTS=1 npm run test:ai:live` (skipped without a key). The script checks `/v1/models` auth, fast complete/stream/tool and low-effort reasoning, and prints latency plus content/tool counts without message text or the key.

A model can be listed by `/v1/models` yet return HTTP 404 `Function ... Not found for account` on completion when the account has no access to that endpoint. Connection Health reports that as `MODEL_UNAVAILABLE`/`unavailable`; the admin must select another reasoning model. Auto mode then keeps normal chat on the fast model after a failed reasoning test, and an explicit Deep failure offers "Retry with fast model".

Playwright E2E is forbidden in this repo. Manual UI coverage lives in `QA_CHECKLIST.md`.
