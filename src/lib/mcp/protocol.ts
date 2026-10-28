import { MCP_LEGACY_VERSION, MCP_MODERN_VERSION } from './config'

export type RpcMessage = { jsonrpc: '2.0'; method: string; id?: string | number; params?: Record<string, unknown> }

export function isRpcRequest(value: unknown): value is RpcMessage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const m = value as Record<string, unknown>
  return m.jsonrpc === '2.0' && typeof m.method === 'string' &&
    (m.id === undefined || typeof m.id === 'string' || typeof m.id === 'number') &&
    (m.params === undefined || (!!m.params && typeof m.params === 'object' && !Array.isArray(m.params)))
}

export function rpcVersion(request: Request, message: RpcMessage): string {
  const meta = message.params?._meta
  const requested = meta && typeof meta === 'object' && !Array.isArray(meta)
    ? (meta as Record<string, unknown>)['io.modelcontextprotocol/protocolVersion']
    : undefined
  return message.method === 'server/discover' ||
    request.headers.get('MCP-Protocol-Version') === MCP_MODERN_VERSION ||
    requested === MCP_MODERN_VERSION ? MCP_MODERN_VERSION : MCP_LEGACY_VERSION
}

const headers = { 'Cache-Control': 'no-store', 'Content-Type': 'application/json', 'Vary': 'Authorization' }
export function rpcOk(id: string | number | null, value: Record<string, unknown>, version: string) {
  return Response.json({ jsonrpc: '2.0', id, result: version === MCP_MODERN_VERSION
    ? { resultType: 'complete', ...value } : value }, { headers: { ...headers, 'MCP-Protocol-Version': version } })
}
export function rpcFailure(id: string | number | null, code: number, message: string, status = 200) {
  return Response.json({ jsonrpc: '2.0', id, error: { code, message } }, { status, headers })
}
export function toolResult(value: unknown, isError = false) {
  return { content: [{ type: 'text', text: JSON.stringify(value) }], isError }
}
