import { mcpPublicOrigin } from '@/lib/mcp/config'
export const dynamic = 'force-dynamic'
export function GET() {
  const origin = mcpPublicOrigin()
  const issuer = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!origin || !issuer) return Response.json({ error: 'MCP OAuth discovery is not configured.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  return Response.json({
    resource: origin + '/api/mcp',
    authorization_servers: [new URL('/auth/v1', issuer).toString()],
    bearer_methods_supported: ['header'],
  }, { headers: { 'Cache-Control': 'no-store' } })
}
