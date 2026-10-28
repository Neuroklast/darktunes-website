/**
 * Remote MCP endpoint for authorized darkTunes CMS users.
 * Intentionally exposes a small read-only tool allowlist.
 */
import { NextRequest, NextResponse } from 'next/server'
import '@/lib/ai/tools/mcpContent'
import '@/lib/ai/tools/mcpWrites'
import { executeRegisteredTool, getRegisteredTool, listToolDefinitionsForActor } from '@/lib/ai/tools'
import { processMcpMessage, type McpToolDefinition } from '@/lib/mcp/protocol'
import { authenticateMcp, isAllowedMcpOrigin, oauthIssuer, readMcpJson } from '@/lib/mcp/security'
import { checkDistributedRateLimit } from '@/lib/rateLimitDistributed'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const EXPORTED_TOOLS = new Set([
  'list_cms_news', 'list_cms_artists', 'list_cms_releases', 'list_cms_events',
  'prepare_cms_news_draft',
  'get_artist_overview', 'get_pending_submissions', 'get_system_health',
  'get_sync_job_status', 'get_storage_health',
])
const HEADERS = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } as const
function reject(status: number, message: string, request: Request) {
  const headers = new Headers(HEADERS)
  if (status === 401) {
    const metadata = new URL('/.well-known/oauth-protected-resource', request.url)
    headers.set('WWW-Authenticate', `Bearer resource_metadata="${metadata.toString()}"`)
  }
  return NextResponse.json({ error: message }, { status, headers })
}

export async function POST(req: NextRequest) {
  if (process.env.MCP_CONNECTOR_ENABLED !== 'true' || !oauthIssuer()) {
    return reject(503, 'MCP connector disabled', req)
  }
  if (!isAllowedMcpOrigin(req)) return reject(403, 'Forbidden origin', req)
  if (!req.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return reject(415, 'Expected application/json', req)
  }
  const actor = await authenticateMcp(req)
  if (!actor) return reject(401, 'OAuth bearer token required', req)

  const limit = await checkDistributedRateLimit(`darktunes:mcp:${actor.userId}`, 60, 60_000)
  if (limit.limited) return reject(429, 'Too many requests', req)

  let payload: unknown
  try {
    payload = await readMcpJson(req, 64 * 1024)
  } catch {
    return reject(400, 'Invalid or oversized JSON', req)
  }
  const definitions = listToolDefinitionsForActor(actor)
    .filter(tool => EXPORTED_TOOLS.has(tool.name))
    .sort((a, b) => a.name.localeCompare(b.name))
  const visibleTools = definitions.map(tool => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.parameters as Record<string, unknown>,
    annotations: { readOnlyHint: getRegisteredTool(tool.name)?.classification === 'read', destructiveHint: false, openWorldHint: false },
  })) satisfies McpToolDefinition[]
  try {
    const response = await processMcpMessage(payload, {
      listTools: async () => visibleTools,
      callTool: async (name, args) => {
        const result = await executeRegisteredTool(name, args, {
          actor, requestId: crypto.randomUUID(), signal: req.signal,
        })
        return result.ok ? { ok: true, result: result.result }
          : { ok: false, error: result.error }
      },
    }, req.headers.get('mcp-protocol-version'))
    if (response.status === 202) return new Response(null, { status: 202, headers: HEADERS })
    return NextResponse.json(response.message, { status: response.status, headers: HEADERS })
  } catch {
    return reject(500, 'MCP request failed', req)
  }
}

export async function GET() {
  return new Response(null, { status: 405, headers: { ...HEADERS, Allow: 'POST' } })
}
export async function DELETE() {
  return new Response(null, { status: 405, headers: { ...HEADERS, Allow: 'POST' } })
}
