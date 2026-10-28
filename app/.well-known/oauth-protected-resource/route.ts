import { NextRequest, NextResponse } from 'next/server'
import { oauthIssuer } from '@/lib/mcp/security'

export const dynamic = 'force-dynamic'

export function GET(req: NextRequest) {
  if (process.env.MCP_CONNECTOR_ENABLED !== 'true') {
    return new Response(null, { status: 404 })
  }
  const issuer = oauthIssuer()
  if (!issuer) return new Response(null, { status: 503 })
  // Deployment host is used only for resource metadata; bearer auth is checked separately.
  const resource = new URL('/mcp', process.env.NEXT_PUBLIC_SITE_URL || req.url).toString()
  return NextResponse.json({
    resource,
    authorization_servers: [issuer],
    bearer_methods_supported: ['header'],
  }, { headers: {
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=300',
    'X-Content-Type-Options': 'nosniff',
  } })
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  } })
}
