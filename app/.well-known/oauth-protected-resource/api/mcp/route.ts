import { NextRequest, NextResponse } from 'next/server'
import { oauthIssuer } from '@/lib/mcp/security'

export const dynamic = 'force-dynamic'

export function GET(req: NextRequest) {
  if (process.env.MCP_CONNECTOR_ENABLED !== 'true')
    return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } })
  const issuer = oauthIssuer()
  if (!issuer) return new Response(null, { status: 503 })
  return NextResponse.json({
    resource: new URL('/api/mcp', req.url).toString(),
    authorization_servers: [issuer],
    bearer_methods_supported: ['header'],
  }, { headers: {
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=300',
    'X-Content-Type-Options': 'nosniff',
  } })
}

export { OPTIONS } from '../../route'
