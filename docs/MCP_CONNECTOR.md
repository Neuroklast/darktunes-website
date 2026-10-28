# darkTunes GPT / MCP Connector

Status: **read-only, security-first integration**, shipped behind a disabled-by-default feature flag. It does not expose arbitrary SQL, direct R2 write access, publishing, deletion, or the full admin API. Production activation requires an authenticated OAuth integration test.

## Endpoints

- `POST /mcp`: JSON-RPC MCP over stateless Streamable HTTP
- `GET /.well-known/oauth-protected-resource`: RFC 9728 OAuth discovery metadata
- `GET /oauth/consent?authorization_id=...`: darkTunes user consent screen
- `GET /mcp` and `DELETE /mcp`: deliberately 405 (no stateful SSE sessions)

The endpoint recognizes MCP `2026-07-28` per-request metadata / `server/discover` and legacy `2025-11-25` `initialize`. No additional runtime dependencies are introduced. Unlike the official SDK, this small transport only implements the subset required for stateless read-only tools (not resources, sampling or subscriptions). The official MCP SDK should replace it when additional protocol primitives are required.

## Deployment prerequisites

1. In the **correct** Supabase project, enable **Authentication → OAuth Server** (currently beta). Use asymmetric JWT signing keys. Configure Site URL as the public darkTunes origin and Authorization Path as `/oauth/consent`.
2. Enable OAuth dynamic client registration only after security review. Supabase OAuth clients use authorization-code PKCE, refresh token rotation and registered redirect URLs. Do not build a custom token issuer.
3. Set `NEXT_PUBLIC_SITE_URL=https://darktunes.com`, the existing `NEXT_PUBLIC_SUPABASE_URL`, the existing anon/publishable credentials, and existing server-side service key. No OAuth secrets or service-role credentials go to the browser.
4. Configure **Upstash Redis** (`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`) for cross-instance rate limiting. The existing rate limiter falls back to per-instance memory if Redis is unavailable, so production deployment should monitor Redis health.
5. Only after the consent screen, end-to-end tests, production domain and OAuth discoverability have been verified, set `MCP_CONNECTOR_ENABLED=true` in Vercel.
6. In ChatGPT Plugins, create a custom MCP server at `https://darktunes.com/mcp`. Complete OAuth sign-in and approve the connection. Require a darkTunes role of admin or editor. Permissions are resolved from Supabase on every call.

## Data and security boundaries

The route requires a valid Supabase-issued **OAuth access token** with a verified `client_id` claim, not a cookie, anon key, or any ordinary portal JWT. It checks that Auth accepts the token and resolves the current server-side darkTunes RBAC capabilities. The internal AI Tool Registry then independently checks capability access for each call. Only the named read-only allowlist is advertised/executable.

- Exposed: bounded CMS summaries for news, artists, releases and events; selected non-financial system health/sync tools.
- Excluded: payments, royalty statements, user data, private artist data, raw database queries, destructive actions, publishing and configuration mutations.
- Internal queries project safe columns, enforce a limit of 50 rows, and require CMS/label capabilities.
- Tool execution is recorded by the existing AI tool audit system. Tool results are validated by the existing Zod registry.
- POST enforces Origin when present, bearer authentication, strict body size (64 KiB), rate limiting (60/min/user), no shared caching and generic error output.
- Feature flag is **off by default**. Do not enable until tested with production Supabase OAuth server.

## Smoke tests

With the feature flag enabled:

```bash
curl -i https://darktunes.com/.well-known/oauth-protected-resource
curl -i -X POST https://darktunes.com/mcp -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"server/discover"}'
# First should list your Supabase issuer. Second MUST be 401 without OAuth.
```

With an OAuth-issued bearer token:

```bash
curl -sS https://darktunes.com/mcp \
  -H "Authorization: Bearer $OAUTH_ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'Mcp-Protocol-Version: 2025-11-25' \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"smoke","version":"1"}}}'
```

Then request `tools/list` and call an authorized `list_cms_news` tool. Also test with a portal-only user, a non-OAuth JWT, revoked tokens, expired tokens, malicious Origin, malformed JSON, oversized requests and missing rights.

Tests: `npx vitest run src/lib/mcp/protocol.test.ts src/lib/mcp/security.test.ts`.

## Next iteration

Before enabling changes from ChatGPT, add a human-reviewed **prepare → preview → explicit website approval → commit** workflow per CMS domain. Require permission rechecks, optimistic concurrency (record version), an idempotency key, an immutable audit trail and automatic public cache invalidation. Never expose existing arbitrary admin mutation routes or service-role Supabase keys as MCP tools.
