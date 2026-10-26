# darkTunes AI Assistant — multi-provider configuration

## Architecture

The app uses one existing orchestration layer (authentication, context, tools,
conversation locking, safety budgets and monthly credits) and a new
`AiProviderRouter` to send each request to the selected provider. The
adapter accepts OpenAI-compatible chat completions with SSE streaming; only
NVIDIA receives NVIDIA-specific chat-template arguments.

The curated catalog is in `src/lib/ai/models/catalog.ts`. Never expose raw
provider `/models` output in the admin model selection. Such lists can contain
image generators, embedding endpoints, speech engines and incompatible models.
Every stored model ID is provider-qualified except the two backward-compatible
NVIDIA defaults. Tariffs, failures and health checks use the same IDs.

Supported API endpoints (allowlisted; admin cannot supply external URLs):

| Provider | Base endpoint | Credentials in Admin → API Keys |
| --- | --- | --- |
| NVIDIA NIM | `https://integrate.api.nvidia.com/v1` | `nvidia_api_key` |
| Groq | `https://api.groq.com/openai/v1` | `groq_api_key` |
| Gemini | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini_api_key` |
| OpenRouter | `https://openrouter.ai/api/v1` | `openrouter_api_key` |
| Cerebras | `https://api.cerebras.ai/v1` | `cerebras_api_key` |
| Cloudflare Workers AI | `https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1` | `cloudflare_ai_api_key` and `cloudflare_ai_account_id` |

All stored keys use the existing encrypted `api_credentials` DAL. Keys are
never sent to clients and are only fetched from server-side code. Environment
variables with the same names in uppercase are fallback options, and do not
override encrypted admin credentials.

## Activation

1. Deploy the credit schema on the parent branch first using the additive
   `supabase/reset.sql` procedure. Never overwrite live user data.
2. Add one or more provider credentials in **Admin → API Keys → AI**. For
   Cloudflare also enter the 32-character account ID.
3. Open **Admin → AI Assistant → Models**. Choose a suitable fast, thorough
   and optional fallback model by readable name and upstream identifier.
4. Run **Chat + Streaming + Tools** on each selected non-NVIDIA model.
   Verification requires a real completion, streamed answer, function call and
   function call *while streaming*. It costs API calls. Unverified non-NVIDIA
   models cannot serve live artist traffic.
5. Review usage, consent and provider terms. Confirm per-million-token pricing
   under **AI Credits**. Models genuinely covered by a zero-price contract
   require an explicit free-tariff confirmation; do not assume all free tiers
   have unlimited or zero billing. Leave credit enforcement disabled until
   pricing is verified.
6. Enable the assistant only after production smoke testing, confirming all
   artist roles and permission boundaries.

The API endpoints `GET /api/admin/ai/models` and
`POST /api/admin/ai/connection-tests` are admin-only. The latter optionally
accepts `model_id` to test a catalog model that is not currently selected.
No arbitrary model IDs or user-controlled URLs are forwarded to providers.

If a provider key is changed or deleted, that provider's verification is
invalidated. The application never attempts a fallback unless the target
was explicitly configured *and passed its integration test*. The fallback
can be a different provider, and cannot be automatically selected from an
unknown or newly advertised model.

## Free-tier and privacy warning

Free API access is usually rate limited, may be suspended, and can use
different contractual data processing and international transfer terms.
OpenRouter free-model endpoint availability depends on the active upstream
providers and region; do not assume EU in-region handling for free providers.
Some Gemini free-tier offerings may process data differently than paid tiers.
Before processing artist, label, contractual or other personal information,
complete a GDPR/AVV/DPA and data transfer review and update relevant privacy
notices. No arbitrary provider should be enabled just to avoid pricing.

## Operational checks

- Ensure provider-specific keys are correctly configured and not exposed via
  `/api/ai/capabilities` or admin model catalog.
- Model probes must show nonempty text, streamed text, a valid `echo_test`
  function call and a streamed tool call.
- Check cancellation, rate limits, retries, fallback and failed calls; the
  existing budget and credit managers remain active regardless of provider.
- Non-NVIDIA OpenAI-compatible endpoints are not all equivalent. Forcing
  NVIDIA's `chat_template_kwargs`/reasoning flags on them is prohibited.
- Free endpoints often do not report complete streamed token usage. The existing
  estimator is used as fallback and is marked as an estimate; do not describe
  estimated EUR spend as an exact provider invoice.
- Run unit tests, TypeScript checks and a staging smoke test with the real
  provider keys before merging or enabling live users.

References:
- https://ai.google.dev/gemini-api/docs/openai/
- https://console.groq.com/docs/api-reference
- https://console.groq.com/docs/tool-use/overview
- https://openrouter.ai/docs/quickstart
- https://inference-docs.cerebras.ai/models/overview
- https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/
