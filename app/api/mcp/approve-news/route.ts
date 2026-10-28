/**
 * Human-only commit endpoint. MCP does NOT expose this as a tool.
 */
import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAiActor } from '@/lib/ai/auth/requireAiActor'
import { consumeActionConfirmation } from '@/lib/ai/actions/confirmations'
import { executeConfirmedAction } from '@/lib/ai/actions/executeConfirmed'
import { isAllowedMcpOrigin, readMcpJson } from '@/lib/mcp/security'
import { checkDistributedRateLimit } from '@/lib/rateLimitDistributed'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({ token: z.string().regex(/^act_[a-f0-9]{48}$/) }).strict()

export async function POST(req: NextRequest) {
  const headers = { 'Cache-Control': 'no-store' }
  if (process.env.MCP_CONNECTOR_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Connector disabled' }, { status: 503, headers })
  }
  const origin = req.headers.get('origin')
  // Mandatory same-site Origin for cookie-based browser approval.
  if (!origin || !isAllowedMcpOrigin(req) || req.headers.get('sec-fetch-site') === 'cross-site') {
    return NextResponse.json({ error: 'Forbidden origin' }, { status: 403, headers })
  }
  if (!req.headers.get('content-type')?.startsWith('application/json')) {
    return NextResponse.json({ error: 'Invalid content type' }, { status: 415, headers })
  }
  try {
    const actor = await requireAiActor(req, { dashboard: 'admin' })
    if ((actor.role !== 'admin' && actor.role !== 'editor') ||
        !actor.capabilities.has('cms.news.edit')) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403, headers })
    }
    const limit = await checkDistributedRateLimit(`mcp:approve:${actor.userId}`, 10, 60_000)
    if (limit.limited) return NextResponse.json({ error: 'Rate limited' }, { status: 429, headers })
    if (Number(req.headers.get('content-length')) > 1024) {
      return NextResponse.json({ error: 'Request too large' }, { status: 413, headers })
    }
    const input = schema.safeParse(await readMcpJson(req, 1024))
    if (!input.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400, headers })
    const payload = await consumeActionConfirmation(actor.serviceDb, {
      actor, token: input.data.token, action: 'create_cms_news_draft',
    })
    const result = await executeConfirmedAction(actor, 'create_cms_news_draft', payload)
    revalidatePath('/admin/news')
    return NextResponse.json(result, { headers })
  } catch {
    return NextResponse.json({ error: 'Approval expired, was already used, or could not be saved.' },
      { status: 409, headers })
  }
}
