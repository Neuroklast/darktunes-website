/**
 * Human-only commit endpoint. MCP does NOT expose this as a tool.
 */
import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { ApiError } from '@/lib/errors'
import { requireAiActor } from '@/lib/ai/auth/requireAiActor'
import { commitMcpApproval } from '@/lib/mcp/commitApproval'
import { isAllowedMcpOrigin, readMcpJson } from '@/lib/mcp/security'
import { checkDistributedRateLimit } from '@/lib/rateLimitDistributed'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({ token: z.string().regex(/^act_[a-f0-9]{48}$/) }).strict()

function problem(status: number, title: string, detail: string) {
  return new Response(JSON.stringify({ type: 'about:blank', title, status, detail }), {
    status, headers: { 'Content-Type': 'application/problem+json', 'Cache-Control': 'no-store' },
  })
}
export async function POST(req: NextRequest) {
  if (process.env.MCP_CONNECTOR_ENABLED !== 'true') {
    return problem(503, 'Service unavailable', 'The MCP connector is disabled.')
  }
  const origin = req.headers.get('origin')
  if (req.headers.has('authorization') || req.headers.get('sec-fetch-site') !== 'same-origin' ||
      !origin || !isAllowedMcpOrigin(req)) {
    return problem(403, 'Forbidden', 'Approval requires a same-origin browser request.')
  }
  if (!req.headers.get('content-type')?.startsWith('application/json')) {
    return problem(415, 'Unsupported media type', 'Approval requires application/json.')
  }
  if (Number(req.headers.get('content-length')) > 1024) {
    return problem(413, 'Payload too large', 'The approval request must be at most 1024 bytes.')
  }
  let actor: Awaited<ReturnType<typeof requireAiActor>>
  try {
    actor = await requireAiActor(req, { dashboard: 'admin' })
  } catch {
    return problem(401, 'Unauthorized', 'Sign in to darkTunes before approving a draft.')
  }
  if ((actor.role !== 'admin' && actor.role !== 'editor') ||
      !actor.capabilities.has('cms.news.edit')) {
    return problem(403, 'Forbidden', 'Your account cannot approve news drafts.')
  }
  const limit = await checkDistributedRateLimit('mcp:approve:' + actor.userId, 10, 60_000)
  if (limit.limited) return problem(429, 'Rate limited', 'Too many approval attempts. Retry after one minute.')
  let input: ReturnType<typeof schema.safeParse>
  try {
    input = schema.safeParse(await readMcpJson(req, 1024))
  } catch {
    return problem(400, 'Bad request', 'Invalid JSON or request larger than 1024 bytes.')
  }
  if (!input.success) return problem(400, 'Bad request', 'A valid one-time token is required.')
  try {
    const result = await commitMcpApproval(actor, input.data.token, 'create_cms_news_draft')
    revalidatePath('/admin/news')
    return NextResponse.json(result, {
      status: result.replayed ? 200 : 201, headers: {
        'Cache-Control': 'no-store',
        ...(result.location ? { Location: result.location } : {}),
      },
    })
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 503) return problem(503, 'Database setup required', error.message)
      if (error.status === 410) return problem(410, 'Approval expired', error.message)
      if (error.status === 404) return problem(404, 'Approval not found', 'The approval belongs to another account or does not exist.')
      if (error.status === 403) return problem(403, 'Approval forbidden', error.message)
    }
    return problem(409, 'Draft not saved', 'Approval expired, was used, or the draft could not be saved. Prepare a new draft.')
  }
}
