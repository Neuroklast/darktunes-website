import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withErrorHandler } from '@/lib/errors'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { extractBearerToken, verifyAdmin } from '@/lib/adminAuth'
import {
  createOrganizationWebhookEndpoint,
  generateWebhookSecret,
  listOrganizationWebhookEndpoints,
} from '@/lib/api/organizationWebhooks'
import { writeOrganizationAuditLog } from '@/lib/api/organizationAuditLog'

const postSchema = z.object({
  organizationId: z.string().uuid(),
  url: z.string().url(),
  events: z
    .array(z.enum(['artist.created', 'release.submitted', 'release.approved', 'release.rejected', '*']))
    .min(1),
})

export const GET = withErrorHandler(async (req: NextRequest) => {
  const token = extractBearerToken(req.headers.get('authorization'))
  await verifyAdmin(token)
  const orgId = new URL(req.url).searchParams.get('organizationId')
  if (!orgId) return NextResponse.json({ error: 'organizationId required' }, { status: 400 })

  const supabase = await createServerSupabaseClient()
  const endpoints = await listOrganizationWebhookEndpoints(supabase, orgId)
  return NextResponse.json(endpoints)
})

export const POST = withErrorHandler(async (req: NextRequest) => {
  const token = extractBearerToken(req.headers.get('authorization'))
  const userId = await verifyAdmin(token)
  const body = postSchema.parse(await req.json())
  const secret = generateWebhookSecret()

  const supabase = await createServerSupabaseClient()
  const endpoint = await createOrganizationWebhookEndpoint(supabase, {
    organization_id: body.organizationId,
    url: body.url,
    events: body.events,
    secret,
  })

  await writeOrganizationAuditLog(supabase, {
    organizationId: body.organizationId,
    userId,
    action: 'webhook_endpoint.created',
    targetType: 'organization_webhook_endpoint',
    targetId: endpoint.id,
  })

  return NextResponse.json({ endpoint, secret }, { status: 201 })
})