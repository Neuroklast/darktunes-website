import { describe, expect, it } from 'vitest'
import { isRpcRequest, rpcVersion, rpcOk, rpcFailure } from '@/lib/mcp/protocol'
import { MCP_MODERN_VERSION, MCP_LEGACY_VERSION } from '@/lib/mcp/config'

describe('stateless MCP JSON-RPC validation', () => {
  it('rejects batches and invalid ids', () => {
    expect(isRpcRequest([])).toBe(false)
    expect(isRpcRequest({ jsonrpc: '2.0', method: 'tools/call', id: {} })).toBe(false)
    expect(isRpcRequest({ jsonrpc: '2.0', method: 'tools/list', id: 1 })).toBe(true)
  })
  it('negotiates modern discover and retains legacy fallback', () => {
    const request = new Request('https://darktunes.com/api/mcp')
    expect(rpcVersion(request, { jsonrpc: '2.0', method: 'server/discover', id: 1 })).toBe(MCP_MODERN_VERSION)
    expect(rpcVersion(request, { jsonrpc: '2.0', method: 'initialize', id: 1 })).toBe(MCP_LEGACY_VERSION)
  })
  it('includes modern resultType and stable JSON-RPC failures', async () => {
    const ok = await rpcOk(12, { tools: [] }, MCP_MODERN_VERSION).json()
    expect(ok.result.resultType).toBe('complete')
    const failed = await rpcFailure(12, -32601, 'Missing').json()
    expect(failed.error.code).toBe(-32601)
  })
})
