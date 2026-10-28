import { createClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'
import { requireAiActor, type AiActor } from '@/lib/ai/auth/requireAiActor'
import { checkDistributedRateLimit } from '@/lib/rateLimitDistributed'
import { configuredMcpClients, mcpEnabled } from './config'

export class McpAuthError extends Error {
  constructor(public readonly status: number, message: string) { super(message) }
}

export async function requireMcpActor(request: NextRequest): Promise<AiActor> {
  if (!mcpEnabled()) throw new McpAuthError(503, 'MCP has not been activated by an administrator.')
  const header = request.headers.get('authorization') ?? ''
  if (!/^Bearer [A-Za-z0-9._-]{20,6000}$/.test(header)) {
    throw new McpAuthError(401, 'A Supabase OAuth bearer token is required.')
  }
  const token = header.substring(7)
  const parts = token.split('.')
  if (parts.length !== 3) throw new McpAuthError(401, 'An OAuth JWT is required.')
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) throw new McpAuthError(503, 'Supabase Auth is unavailable.')
  // The signature / expiry are verified by Supabase Auth before any decoded claim is used.
  const auth = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: { user }, error } = await auth.auth.getUser(token)
  if (!user || error) throw new McpAuthError(401, 'Token is invalid or expired.')
  let claims: Record<string, unknown>
  try { claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Record<string, unknown> }
  catch { throw new McpAuthError(401, 'Token claims are invalid.') }
  const client = claims.client_id
  if (typeof client !== 'string' || !configuredMcpClients().has(client) ||
    claims.sub !== user.id || typeof claims.session_id !== 'string') {
    throw new McpAuthError(403, 'This OAuth application is not authorized for MCP.')
  }
  // Do not accept a browser cookie as substitute for an OAuth access token.
  const actor = await requireAiActor(request, { includeArtists: false })
  if (actor.userId !== user.id) throw new McpAuthError(403, 'Account context mismatch.')
  const limited = await checkDistributedRateLimit('mcp:' + user.id, 80, 60_000)
  if (limited.limited) throw new McpAuthError(429, 'MCP rate limit reached.')
  return actor
}

export function unauthorizedMcp(error: McpAuthError, request: Request): Response {
  const origin = process.env.DARKTUNES_MCP_PUBLIC_ORIGIN
  const resource = origin ? new URL('/.well-known/oauth-protected-resource/api/mcp', origin).toString()
    : new URL('/.well-known/oauth-protected-resource/api/mcp', request.url).toString()
  const headers: Record<string, string> = { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' }
  if (error.status === 401) headers['WWW-Authenticate'] = 'Bearer resource_metadata="' + resource + '"'
  return Response.json({ error: error.message }, { status: error.status, headers })
}
