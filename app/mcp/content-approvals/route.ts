/**
 * Browser-only approval endpoint for MCP-prepared artist, release and event
 * corrections. Never registered as an MCP tool.
 */
import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { ApiError } from '@/lib/errors'
import { requireAiActor } from '@/lib/ai/auth/requireAiActor'
import { commitMcpApproval } from '@/lib/mcp/commitApproval'
import { contentCapability, type ContentKind } from '@/lib/mcp/contentMutations'
import { isAllowedMcpOrigin, readMcpJson } from '@/lib/mcp/security'
import { checkDistributedRateLimit } from '@/lib/rateLimitDistributed'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const actions = {
  update_cms_artist: 'artist',
  update_cms_release: 'release',
  update_cms_event: 'event',
} as const
const schema = z.object({
  token: z.string().regex(/^act_[a-f0-9]{48}$/),
  action: z.enum(['update_cms_artist', 'update_cms_release', 'update_cms_event']),
}).strict()

function problem(status: number, detail: string) {
  return new Response(JSON.stringify({
    type: 'about:blank', title: status === 409 ? 'Conflict' : 'Request denied',
    status, detail,
  }), {
    status,
    headers: { 'Content-Type': 'application/problem+json', 'Cache-Control': 'no-store' },
  })
}

export async function POST(req: NextRequest) {
  if (process.env.MCP_CONNECTOR_ENABLED !== 'true') return problem(503, 'The connector is disabled.')
  // OAuth bearer access is NOT sufficient to approve. Require the site's
  // cookie-backed browser session and a user-generated same-origin request.
  if (req.headers.has('authorization') ||
      req.headers.get('sec-fetch-site') !== 'same-origin' ||
      !req.headers.get('origin') || !isAllowedMcpOrigin(req)) {
    return problem(403, 'Approval requires a logged-in same-origin darkTunes browser.')
  }
  if (!req.headers.get('content-type')?.startsWith('application/json')) {
    return problem(415, 'Content type must be application/json.')
  }
  let actor: Awaited<ReturnType<typeof requireAiActor>>
  try {
    actor = await requireAiActor(req, { dashboard: 'admin' })
  } catch {
    return problem(401, 'Sign in to darkTunes to approve this change.')
  }
  const limit = await checkDistributedRateLimit('mcp:approval:' + actor.userId, 10, 60_000)
  if (limit.limited) return problem(429, 'Approval rate limit exceeded. Retry in one minute.')
  let payload: unknown
  try {
    payload = await readMcpJson(req, 1024)
  } catch {
    return problem(400, 'The approval JSON is invalid or exceeds 1024 bytes.')
  }
  const parsed = schema.safeParse(payload)
  if (!parsed.success) return problem(400, 'A valid approval token and action are required.')
  const kind: ContentKind = actions[parsed.data.action]
  if ((actor.role !== 'admin' && actor.role !== 'editor') ||
      !actor.capabilities.has(contentCapability[kind])) {
    return problem(403, 'Your account does not have permission to edit this CMS section.')
  }
  try {
    const result = await commitMcpApproval(actor, parsed.data.token, parsed.data.action)
    revalidatePath('/admin')
    if (kind === 'artist') revalidatePath('/artists')
    if (kind === 'release') revalidatePath('/releases')
    if (kind === 'event') revalidatePath('/events')
    revalidatePath('/')
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 503) return problem(503, error.message)
      if (error.status === 410) return problem(410, error.message)
      if (error.status === 404) return problem(404, 'This approval does not belong to this account.')
      if (error.status === 403) return problem(403, error.message)
    }
    return problem(409, 'The draft expired, was used, or the record changed. Prepare a new update.')
  }
}
