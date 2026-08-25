import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withErrorHandler, ApiError } from '@/lib/errors'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import { requireAdminFromRequest } from '@/lib/adminAuth'
import { assertAdminOrganizationAccess } from '@/lib/organizations/assertAdminOrganizationAccess'
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
    .array(
      z.enum([
        'artist.created',
        'release.submitted',
        'release.approved',
        'release.rejected',
        '*',
      ]),
    )
    .min(1),
})

export const GET = withErrorHandler(async (req: NextRequest) => {
  const { userId } = await requireAdminFromRequest(req)
  const orgId = new URL(req.url).searchParams.get('organizationId')
  if (!orgId) throw new ApiError(400, 'organizationId required')

  const db = await createServiceRoleSupabaseClient()
  await assertAdminOrganizationAccess(db, userId, orgId)

  const endpoints = await listOrganizationWebhookEndpoints(db, orgId)
  return NextResponse.json(endpoints)
})

export const POST = withErrorHandler(async (req: NextRequest) => {
  const { userId } = await requireAdminFromRequest(req)
  const body = postSchema.parse(await req.json())
  const secret = generateWebhookSecret()

  const db = await createServiceRoleSupabaseClient()
  await assertAdminOrganizationAccess(db, userId, body.organizationId)

  const endpoint = await createOrganizationWebhookEndpoint(db, {
    organization_id: body.organizationId,
    url: body.url,
    events: body.events,
    secret,
  })

  await writeOrganizationAuditLog(db, {
    organizationId: body.organizationId,
    userId,
    action: 'webhook_endpoint.created',
    targetType: 'organization_webhook_endpoint',
    targetId: endpoint.id,
  })

  return NextResponse.json({ endpoint, secret }, { status: 201 })
})
