/**
 * Server-side MCP activation and OAuth client allowlist.
 * No wildcard client and no implicit enablement.
 */
export const MCP_MODERN_VERSION = '2026-07-28'
export const MCP_LEGACY_VERSION = '2025-06-18'
export const MCP_SERVER_INFO = { name: 'darktunes-ai', version: '1.0.0' }
export const MCP_INSTRUCTIONS =
  'darkTunes tools follow the signed-in account role and artist membership. Read results may include private account data. prepare_* tools only create confirmation previews and never publish content. Never claim that a prepared action was applied.'

export function configuredMcpClients(): Set<string> {
  return new Set((process.env.DARKTUNES_MCP_OAUTH_CLIENT_IDS ?? '')
    .split(',').map((id) => id.trim()).filter((id) => /^[a-zA-Z0-9_-]{8,128}$/.test(id)))
}

export function mcpEnabled(): boolean {
  return process.env.DARKTUNES_MCP_ENABLED === 'true'
}

export function mcpPublicOrigin(): string | null {
  const configured = process.env.DARKTUNES_MCP_PUBLIC_ORIGIN
  if (!configured) return null
  try {
    const url = new URL(configured)
    if ((url.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && url.hostname === 'localhost')) ||
      url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null
    return url.origin
  } catch { return null }
}
