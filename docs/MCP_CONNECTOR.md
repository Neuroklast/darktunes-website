# darkTunes GPT / MCP Connector

For sharing the connector across several ChatGPT users, see [MCP_MULTI_USER.md](./MCP_MULTI_USER.md). Each person connects with their own darkTunes identity and permissions.

Status: **security-first integration with human-approved CMS updates**, shipped behind a disabled-by-default feature flag. It does not expose arbitrary SQL, direct R2 write access, publishing, deletion, or the full admin API. Production activation requires an authenticated OAuth integration test.

## Endpoints

- `POST /mcp`: JSON-RPC MCP over stateless Streamable HTTP
- `POST /api/mcp`: compatibility alias, same authenticated tool registry
- `GET /.well-known/oauth-protected-resource`: RFC 9728 OAuth metadata for `/mcp`
- `GET /.well-known/oauth-protected-resource/api/mcp`: OAuth metadata for `/api/mcp`
- `GET /oauth/consent?authorization_id=...`: darkTunes user consent screen
- `POST /mcp/news-draft-approvals`: same-origin browser approval of a news draft (201 Created, not an MCP tool)
- `GET /admin/mcp-approvals/[token]`: protected human review page
- `GET /mcp` and `DELETE /mcp`: deliberately 405 (no stateful SSE sessions)

The endpoint recognizes MCP `2026-07-28` per-request metadata / `server/discover` and legacy `2025-11-25` `initialize`. No additional runtime dependencies are introduced. Unlike the official SDK, this small transport only implements the subset required for stateless read-only tools (not resources, sampling or subscriptions). The official MCP SDK should replace it when additional protocol primitives are required.

## Deployment prerequisites

1. In the **correct** Supabase project, enable **Authentication → OAuth Server** (currently beta). Use asymmetric JWT signing keys. Configure Site URL as the public darkTunes origin and Authorization Path as `/oauth/consent`.
2. Enable OAuth dynamic client registration only after security review. Supabase OAuth clients use authorization-code PKCE, refresh token rotation and registered redirect URLs. Do not build a custom token issuer.
3. Set `NEXT_PUBLIC_SITE_URL=https://www.darktunes.com`, the existing `NEXT_PUBLIC_SUPABASE_URL`, the existing anon/publishable credentials, and existing server-side service key. No OAuth secrets or service-role credentials go to the browser.
4. Register ChatGPT (or an approved OAuth client) with Supabase Auth and set `MCP_ALLOWED_OAUTH_CLIENT_IDS` to its exact OAuth client ID (comma-separated for multiple approved clients). The API denies all OAuth clients when this is empty. Supabase standard OAuth scopes currently cover identity data rather than CMS permissions; darkTunes enforces explicit client allowlisting and RBAC independently.
5. Configure **Upstash Redis** (`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`) for cross-instance rate limiting. The existing rate limiter falls back to per-instance memory if Redis is unavailable, so production deployment should monitor Redis health.
6. Only after the consent screen, end-to-end tests, production domain and OAuth discoverability have been verified, set `MCP_CONNECTOR_ENABLED=true` in Vercel.
7. In ChatGPT Plugins, create a custom MCP server at `https://www.darktunes.com/mcp`. Complete OAuth sign-in and approve the connection. Require a darkTunes role of admin or editor. Permissions are resolved from Supabase on every call.

## Consent troubleshooting: HTTP 400 from Supabase

The consent page displays Supabase Auth's HTTP status, error code, and an actionable explanation rather than classifying every failed request as expired. The OAuth authorization ID and access token are never shown.

If `GET /auth/v1/oauth/authorizations/{authorization_id}` returns `400 validation_failed` with `unauthorized request origin`, Supabase Auth rejected the **website Origin**, not the ChatGPT callback URL. In the Supabase project actually used by `NEXT_PUBLIC_SUPABASE_URL`, check **Authentication → URL Configuration**: use `https://www.darktunes.com` as Site URL, or explicitly allow the exact `https://www.darktunes.com` browser origin through the redirect URL allowlist. Check **Authentication → OAuth Server** has the authorization path `/oauth/consent`. Keep OAuth-client callback/redirect URIs separately registered as exact URLs, never substitute a wildcard or turn off origin checks.

If the response is `oauth_authorization_not_found` or says the authorization request cannot be processed, restart the connection in ChatGPT to generate a new authorization ID. Do not reload or bookmark the old consent URL. For other errors, inspect the specific status/code and message in the browser's Network tab and the correct Supabase project's Auth logs. A generic HTTP 400 alone does not prove an origin mismatch.

## Data and security boundaries

The route requires a valid Supabase-issued **OAuth access token** with an explicitly allowlisted `client_id` claim, not a cookie, anon key, or any ordinary portal JWT. It checks that Auth accepts the token and resolves the current server-side darkTunes RBAC capabilities. The internal AI Tool Registry then independently checks capability access for each call. Only allowlisted reads and the prepare-only news-draft tool are advertised/executable.

- Exposed: bounded CMS summaries for news, artists, releases and events; selected non-financial system health/sync tools. A CMS editor can prepare a news draft in ChatGPT and approve its creation on a protected website page. No automatic publishing.
- Excluded: payments, royalty statements, user data, private artist data, raw database queries, destructive actions, publishing and configuration mutations.
- Internal queries project safe columns, enforce a limit of 50 rows, and require CMS/label capabilities.
- Tool execution is recorded by the existing AI tool audit system. Tool results are validated by the existing Zod registry.
- POST enforces Origin when present, bearer authentication, strict body size (64 KiB), rate limiting (60/min/user), no shared caching and generic error output.
- Feature flag is **off by default**. Do not enable until tested with production Supabase OAuth server.

## Smoke tests

With the feature flag enabled:

```bash
curl -i https://www.darktunes.com/.well-known/oauth-protected-resource
curl -i -X POST https://www.darktunes.com/mcp -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"server/discover"}'
# First should list your Supabase issuer. Second MUST be 401 without OAuth.
```

With an OAuth-issued bearer token:

```bash
curl -sS https://www.darktunes.com/mcp \
  -H "Authorization: Bearer $OAUTH_ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'Mcp-Protocol-Version: 2025-11-25' \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"smoke","version":"1"}}}'
```

Then request `tools/list` and call an authorized `list_cms_news` tool. Also test with a portal-only user, a non-OAuth JWT, revoked tokens, expired tokens, malicious Origin, malformed JSON, oversized requests and missing rights.

Tests: `npx vitest run src/lib/mcp/protocol.test.ts src/lib/mcp/security.test.ts`.

## Next iteration

For other domains, add the same human-reviewed **prepare → preview → explicit website approval → commit** workflow. Require permission rechecks, optimistic concurrency (record version), an idempotency key, an immutable audit trail and automatic public cache invalidation. Never expose existing arbitrary admin mutation routes or service-role Supabase keys as MCP tools.

## News draft approval

MCP `prepare_cms_news_draft` queues a **non-expiring** proposal without modifying CMS data. The tool links to the protected **Admin → GPT Approvals** inbox (`/admin/mcp-approvals`) instead of sharing its secret approval token. **All authenticated administrators** can see and decide on every label-wide proposal, including ones prepared by other administrators or editors. Editors may only see and decide their own proposals and must still hold the relevant CMS capability. The inbox presents **one proposal at a time**: **Back** and **Skip** browse without changing content; **Accept** and **Decline** immediately advance the visible card while an independent same-origin browser request commits the decision. A saving counter remains visible, and failed decisions reappear with a review action. The detail dialog shows the complete before/after values. Do not navigate away while a request is pending. Accepting news creates an **unpublished draft**, never a published post. Declining leaves CMS content unchanged. The browser session remains mandatory; OAuth bearer tokens alone never authorize review, and no approval/decline tools are exposed to MCP.

**Canonical host:** The apex `darktunes.com` redirects to `www.darktunes.com`. Always register the ChatGPT MCP endpoint under the `www` origin. Cross-origin redirects can drop bearer Authorization headers.

## Controlled artist, release and event corrections

`prepare_cms_artist_update`, `prepare_cms_release_update` and `prepare_cms_event_update` generate typed, limited change sets for existing records, with the precise old values and their `updated_at` revision. The one-time human approval screen displays old and proposed values. `/mcp/content-approvals` accepts approvals only from an authenticated same-origin website session and rejects OAuth bearer authorization. PostgreSQL compare-and-swap prevents overwriting records edited after preview. Artist changes cover public bio, genres and links; release changes cover title, date, cover, public links and catalog number; event changes cover date, venue and ticket details. Visibility and publication status are never writable through these tools.

Approval token payload integrity is calculated over recursively canonicalized JSON, including nested change objects, to avoid tampering even if JSONB reorders keys. Audit entries record the before/after changes. The existing `commit_mcp_approval` database RPC writes both the CMS change and the audit event in the same PostgreSQL transaction. A failure rolls both back.

## Database release gate and atomicity

The proposal routes require the **service-role-only** `public.commit_mcp_approval` and `public.reject_mcp_approval` RPCs, the `ai_action_confirmations.result` JSONB column, from `supabase/reset.sql`. The existing `expires_at NOT NULL` column remains unchanged for compatibility. New and restored MCP proposals store a far-future placeholder in that column, but MCP review functions do not check it: **proposals never time out**. The schema update restores older pending MCP proposals, even when the original ten-minute window elapsed. Ordinary non-MCP assistant confirmations retain their existing expiry and security behavior. These changes must be deployed to the correct Supabase project **before enabling** the MCP feature flag. Both RPCs are `SECURITY INVOKER`, restrict execution to `service_role`, verify the proposal's payload hash, action and authorized actor, and lock the confirmation row. Accepting applies a version-checked CMS change, records the reviewing administrator/editor in the audit log and stores the result in one transaction. Declining records a rejected decision without modifying the CMS. An editor can decide only their own proposals; an administrator can decide any label-wide proposal. Race conditions between administrators resolve to a single committed decision. Failed writes roll back token consumption. Identical retries return `replayed: true` and do not duplicate content or logs. As the entire procedure uses the service role, never expose its credential to browsers or ChatGPT.

**Deployment is not automatic from GitHub.** The SQL function must be reviewed and applied to staging/production separately, and a real database integration test is still required. No direct database migrations are executed as part of this PR.

## Full detail read tools

`get_cms_news`, `get_cms_artist`, `get_cms_release`, and `get_cms_event` support record-specific reads for editing. Every query selects only an explicit non-sensitive column list, checks the appropriate CMS capability, and enforces a result-size limit. News text is plain/untrusted retrieved data and cannot instruct ChatGPT to execute follow-up actions. The service never returns private artist notes, payment details, keys or raw table rows.

## Reconciliation of PR #678

This PR builds on the tested implementation from #677 instead of deploying a second competing OAuth/MCP stack. The alternative editorial request table, duplicated tool registry and replacement Supabase types have been removed. The transactional idempotent `commit_mcp_approval` RPC from #677 remains the sole approval implementation.

The additional `/api/mcp` endpoint is a compatibility alias to `/mcp`. Resource metadata and unauthorized challenges use the requested endpoint's URL. Both routes use the same feature flag, authentication, role restrictions, tool allowlist and rate limiter.

**No MCP MFA requirement:** An authenticated Supabase OAuth session at `aal1` is sufficient for MCP authorization. The consent screen does not request a TOTP challenge, and CMS approval pages and routes do not require `aal2`. A valid OAuth access token with the correct subject and explicitly allowlisted `client_id`, current CMS permissions, and a separate same-origin signed-in browser session remain mandatory. OAuth bearer tokens cannot approve changes. Test OAuth login at `aal1`, wrong-client rejection, cross-account approval rejection and one-time approval protections before production activation. No SQL migrations from the alternative #678 implementation are required.
