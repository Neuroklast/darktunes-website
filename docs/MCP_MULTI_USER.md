# Shared ChatGPT MCP connector: multi-user operations

The same darkTunes MCP server can serve multiple ChatGPT users. The endpoint is https://www.darktunes.com/mcp. Never share one person's Supabase session or create a new server instance for each person.

## Identity separation

- A shared ChatGPT plugin is installed in one workspace. Each member must authorize using their own darkTunes account. Never place service-role credentials or shared admin sessions into ChatGPT.
- Supabase OAuth tokens contain a user subject (sub), an OAuth application client ID (client_id), and may include an assurance level (aal). Several users of the same shared plugin can legitimately share a client ID while having different user subjects.
- The MCP gateway validates bearer tokens with Supabase Auth, matches token subject against the verified Supabase user and live darkTunes actor, and requires an exact OAuth client ID from MCP_ALLOWED_OAUTH_CLIENT_IDS.
- Only darkTunes admin and editor accounts enter MCP. RBAC capability checks control which tools appear. The tool executor rechecks live permissions before execution, so revoked CMS privileges immediately prevent further actions.
- Every recognized tool invocation is logged in ai_tool_executions with its individual actor_id, unique request_id, tool name, status and duration. Do not log OAuth tokens or raw input arguments.
- Edit proposals are tied to the preparing darkTunes user. Another editor cannot approve or replay somebody else's one-time confirmation. Publishing and deletion remain unavailable.

## A shared plugin in a ChatGPT workspace

1. Enable Supabase OAuth Server for the correct darkTunes project, with authorization path /oauth/consent and the canonical Site URL https://www.darktunes.com. Configure asymmetric JWT signing. TOTP MFA is optional for MCP OAuth.
2. Register the ChatGPT OAuth client (or permit Dynamic Client Registration under a carefully controlled rollout). Use the exact redirect URI provided by the ChatGPT plugin setup screen.
3. Add the exact registered OAuth client ID to MCP_ALLOWED_OAUTH_CLIENT_IDS in Vercel Production. Multiple explicitly approved IDs may be supplied as a comma-separated list; an empty value denies all clients.
4. Apply and verify the approval database changes from docs/MCP_CONNECTOR.md (ai_action_confirmations.result and commit_mcp_approval) in staging, and then production.
5. Complete the staging test matrix below before enabling MCP_CONNECTOR_ENABLED=true in production.
6. Create and scan the custom ChatGPT MCP plugin with https://www.darktunes.com/mcp, then have the ChatGPT workspace admin publish it to the approved workspace audience.
7. Every member installs/connects the published plugin and independently authenticates with their own darkTunes login. An MFA factor is not required for MCP.

## Multiple independently registered ChatGPT plugins

ChatGPT's Dynamic Client Registration generally happens once per MCP server connection. Sharing one workspace plugin can reuse its registered OAuth client, while creating different standalone plugin connections can generate additional client IDs. Add only approved client IDs to the environment allowlist.

Never allow arbitrary dynamic clients based solely on a user-controlled client name or redirect URI. If registrations cannot be reviewed, prefer explicitly registered clients and disable dynamic registration. Keep client credentials configured securely and do not rotate or delete actively used clients without a coordinated reconnect.

Changing darkTunes roles immediately blocks CMS actions because permissions are checked server-side for each call. For urgent account deprovisioning, also revoke OAuth grants and active Supabase sessions. Token revocation behavior must be verified with the real provider.

## Staging and production test matrix

| Scenario | Expected result |
| --- | --- |
| Two admins/editors authorize the same shared ChatGPT plugin | Two distinct user subjects; same OAuth client ID is permitted |
| Editor with news permission vs editor without news permission | Only the authorized editor can see and call news tools |
| Editor lacks artist, release or event capability | Corresponding tools hidden and direct calls rejected |
| Artist or visitor tries to use MCP | Denied |
| Second explicitly approved OAuth client | Allowed with a valid, individually authorized user |
| Unknown client or empty allowlist | Denied |
| Valid OAuth token with aal1 and without MFA | Allowed if the client, user identity and RBAC checks pass |
| Token subject differs from verified Supabase user | Denied |
| Verified token differs from server-resolved darkTunes actor | Denied |
| CMS permission withdrawn after tools/list | Subsequent tools/call fails |
| One user opens another user's approval link | Denied without any CMS mutation |
| Duplicate concurrent approval | Transactional idempotence, one CMS mutation |
| Two different users run MCP tools | Audit rows contain the correct individual actor IDs and request IDs |
| Refresh, expiration, sign-out and revocation | No cross-user reuse; expired or revoked credentials require reauthorization |

Automated regression suite:

    npx vitest run src/lib/mcp/multiUserAuth.test.ts src/lib/mcp/multiUserAccess.test.ts src/lib/mcp/commitApproval.test.ts src/lib/mcp/security.test.ts

These automated tests use mocked OAuth and database responses. They do not prove live Supabase OAuth, DCR, ChatGPT publication, optional MFA token issuance or SQL migration. Real staging E2E testing is a release prerequisite.

## Operational limitations

- No arbitrary SQL, financial data, user secrets, publishing or deletion are exposed through MCP.
- OAuth client allowlisting at /mcp never replaces each darkTunes user's own RBAC permissions. A Supabase OAuth access token can also be sent directly to the Supabase Data API, so review every exposed table's RLS rules for OAuth users before allowing third-party clients. The /mcp client allowlist is not a database-level access restriction.
- The currently connected Supabase and Vercel accounts do not provide access to the darkTunes production project. A project administrator must verify the deployed schema, OAuth settings, environment configuration and end-to-end ChatGPT connection.
- For activity review use ai_tool_executions.actor_id and request_id. Never log access or refresh tokens.
- The existing transport supports stateless JSON-RPC tools, not every feature of the official MCP SDK.
