import { describe, expect, it, vi } from 'vitest'
import { MCP_LEGACY, MCP_MODERN, processMcpMessage, type McpExecutor } from './protocol'

const executor: McpExecutor = {
  listTools: vi.fn(async () => [
    { name: 'list_cms_news', description: 'Read news', inputSchema: { type: 'object' } },
  ]),
  callTool: vi.fn(async () => ({ ok: true, result: { items: [{ title: 'Test' }] } })),
}
const request = (method: string, params?: Record<string, unknown>) =>
  ({ jsonrpc: '2.0', id: 1, method, params })
const modern = {
  _meta: {
    'io.modelcontextprotocol/protocolVersion': MCP_MODERN,
    'io.modelcontextprotocol/clientInfo': { name: 'test', version: '1' },
    'io.modelcontextprotocol/clientCapabilities': {},
  },
}

describe('MCP protocol adapter', () => {
  it('advertises the modern stateless protocol', async () => {
    const response = await processMcpMessage(request('server/discover', modern), executor)
    expect(response.status).toBe(200)
    expect(response.message?.result).toMatchObject({
      supportedVersions: [MCP_MODERN, MCP_LEGACY], cacheScope: 'private',
    })
  })
  it('supports legacy initialize without creating a session', async () => {
    const response = await processMcpMessage(request('initialize', { protocolVersion: MCP_LEGACY }), executor)
    expect(response.message?.result).toMatchObject({ protocolVersion: MCP_LEGACY, capabilities: { tools: {} } })
  })
  it('lists only tools supplied by the server-side allowlist', async () => {
    const response = await processMcpMessage(request('tools/list', modern), executor, MCP_MODERN)
    expect(response.message?.result).toMatchObject({
      resultType: 'complete', tools: [{ name: 'list_cms_news' }],
    })
  })
  it('returns structured tool output without violating the modern result envelope', async () => {
    const response = await processMcpMessage(request('tools/call', {
      ...modern, name: 'list_cms_news', arguments: {},
    }), executor, MCP_MODERN)
    expect(response.message?.result).toMatchObject({
      resultType: 'complete', isError: false, structuredContent: { items: [{ title: 'Test' }] },
    })
  })
  it('blocks invented tool calls before execution', async () => {
    vi.mocked(executor.callTool).mockClear()
    const response = await processMcpMessage(request('tools/call', {
      ...modern, name: 'delete_everything', arguments: {},
    }), executor)
    expect(response.message?.error).toMatchObject({ code: -32602 })
    expect(executor.callTool).not.toHaveBeenCalled()
  })
  it('rejects malformed JSON RPC and unsupported versions', async () => {
    expect((await processMcpMessage([], executor)).status).toBe(400)
    const bad = await processMcpMessage(request('tools/list'), executor, '1999-01-01')
    expect(bad.message?.error).toMatchObject({ code: -32022 })
  })
  it('rejects modern calls without per-request version metadata', async () => {
    const result = await processMcpMessage(request('tools/list'), executor, MCP_MODERN)
    expect(result.message?.error).toMatchObject({ code: -32022 })
  })
  it('accepts notification without a reply body', async () => {
    const result = await processMcpMessage({ jsonrpc: '2.0', method: 'notifications/initialized' }, executor)
    expect(result).toEqual({ status: 202 })
  })
  it('never exposes implementation errors in an unsuccessful tool result', async () => {
    const failing: McpExecutor = {
      ...executor, callTool: async () => ({ ok: false, error: 'Invalid input. Try again.' }),
    }
    const response = await processMcpMessage(request('tools/call', {
      name: 'list_cms_news', arguments: {},
    }), failing)
    expect(response.message?.result).toMatchObject({ isError: true })
  })
})
