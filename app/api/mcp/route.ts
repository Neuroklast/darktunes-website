/**
 * Stateless MCP over Streamable HTTP. OAuth bearer-only, no cookie fallback.
 * All ordinary tools reuse the internal AI registry's authorization and audits.
 */
import { NextRequest } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireMcpActor, McpAuthError, unauthorizedMcp } from '@/lib/mcp/auth'
import { MCP_INSTRUCTIONS, MCP_LEGACY_VERSION, MCP_MODERN_VERSION, MCP_SERVER_INFO } from '@/lib/mcp/config'
import { isRpcRequest, rpcFailure, rpcOk, rpcVersion, toolResult } from '@/lib/mcp/protocol'
import { listToolDefinitionsForActor, getRegisteredTool, executeRegisteredTool } from '@/lib/ai/tools'
import { editorialTools, callEditorial } from '@/lib/mcp/editorial'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const capabilities = { tools: { listChanged: false } }

export async function POST(request: NextRequest): Promise<Response> {
  let actor
  try { actor = await requireMcpActor(request) }
  catch (e) {
    if (e instanceof McpAuthError) return unauthorizedMcp(e, request)
    console.error('[darktunes-mcp] Authentication unavailable', e instanceof Error ? e.name : 'Unknown')
    return Response.json({ error: 'MCP authentication unavailable.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
  if (Number(request.headers.get('content-length') ?? 0) > 48_000) return rpcFailure(null, -32600, 'Request too large.', 413)
  const body = await request.text()
  if (body.length > 48_000) return rpcFailure(null, -32600, 'Request too large.', 413)
  let value: unknown
  try { value = JSON.parse(body) } catch { return rpcFailure(null, -32700, 'Invalid JSON.', 400) }
  if (!isRpcRequest(value)) return rpcFailure(null, -32600, 'Invalid JSON-RPC request.', 400)
  const id = value.id ?? null
  const version = rpcVersion(request, value)
  if (value.method === 'notifications/initialized' || id === null) {
    return new Response(null, { status: 202, headers: { 'Cache-Control': 'no-store' } })
  }
  if (value.method === 'server/discover') {
    return rpcOk(id, {
      supportedVersions: [MCP_MODERN_VERSION, MCP_LEGACY_VERSION],
      capabilities, cacheScope: 'private', ttlMs: 0,
      instructions: MCP_INSTRUCTIONS,
      _meta: { 'io.modelcontextprotocol/serverInfo': MCP_SERVER_INFO },
    }, MCP_MODERN_VERSION)
  }
  if (value.method === 'initialize') return rpcOk(id, {
    protocolVersion: MCP_LEGACY_VERSION,
    serverInfo: MCP_SERVER_INFO, instructions: MCP_INSTRUCTIONS, capabilities,
  }, MCP_LEGACY_VERSION)
  if (value.method === 'ping') return rpcOk(id, {}, version)
  if (value.method === 'tools/list') {
    const tools = listToolDefinitionsForActor(actor).map((tool) => {
      const registered = getRegisteredTool(tool.name)
      const write = registered?.classification === 'write'
      return { name: tool.name, description: tool.description,
        inputSchema: tool.parameters,
        annotations: { readOnlyHint: !write, destructiveHint: false, idempotentHint: !write } }
    })
    return rpcOk(id, { tools: actor.role === 'admin' && actor.capabilities.has('admin.panel.full') ? [...tools, ...editorialTools] : tools }, version)
  }
  if (value.method !== 'tools/call') return rpcFailure(id, -32601, 'Method not found.')
  const params = value.params ?? {}
  const name = params.name
  const args = params.arguments ?? {}
  if (typeof name !== 'string' || !args || typeof args !== 'object' || Array.isArray(args)) {
    return rpcFailure(id, -32602, 'Invalid tool arguments.')
  }
  if (name.startsWith('editorial_')) {
    if (!editorialTools.some((tool) => tool.name === name) || actor.role !== 'admin') {
      return rpcFailure(id, -32602, 'Tool unavailable for this account.')
    }
    try {
      const result = await callEditorial(name, args as Record<string, unknown>, actor)
      return rpcOk(id, toolResult(result), version)
    } catch (error) {
      return rpcOk(id, toolResult({ error: error instanceof Error ? error.message : 'Editorial operation unavailable.' }, true), version)
    }
  }
  const tool = getRegisteredTool(name)
  // Never make the registry's diagnostic echo tool remotely callable.
  if (!tool || name === 'echo_test' || !listToolDefinitionsForActor(actor).some((t) => t.name === name)) {
    return rpcFailure(id, -32602, 'Tool unavailable for this account.')
  }
  try {
    // Reuse existing role / artist membership checks, Zod schemas, timeouts and audit trail.
    const result = await executeRegisteredTool(name, args, { actor, requestId: randomUUID() })
    return rpcOk(id, toolResult(result.ok ? result.result : { error: result.error, code: result.error_code }, !result.ok), version)
  } catch {
    return rpcOk(id, toolResult({ error: 'Tool execution failed.' }, true), version)
  }
}

export function GET() { return new Response(null, { status: 405, headers: { Allow: 'POST', 'Cache-Control': 'no-store' } }) }
export function DELETE() { return new Response(null, { status: 405, headers: { Allow: 'POST', 'Cache-Control': 'no-store' } }) }
