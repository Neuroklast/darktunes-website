import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withErrorHandler, ApiError } from '@/lib/errors'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import { requireAdminFromRequest } from '@/lib/adminAuth'
import { assertAdminOrganizationAccess } from '@/lib/organizations/assertAdminOrganizationAccess'
import {
  deleteOrganizationWebhookEndpoint,
  updateOrganizationWebhookEndpoint,
} from '@/lib/api/organizationWebhooks'
import { writeOrganizationAuditLog } from '@/lib/api/organizationAuditLog'

function extractId(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split('/')
  return segments[segments.length - 1]
}

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  url: z.string().url().optional(),
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
    .min(1)
    .optional(),
})

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const { userId } = await requireAdminFromRequest(req)
  const id = extractId(req)
  const body = patchSchema.parse(await req.json())

  const db = await createServiceRoleSupabaseClient()
  const { data: existing } = await db
    .from('organization_webhook_endpoints')
    .select('organization_id')
    .eq('id', id)
    .maybeSingle()
  if (!existing?.organization_id) throw new ApiError(404, 'Webhook endpoint not found')

  await assertAdminOrganizationAccess(db, userId, existing.organization_id)

  const endpoint = await updateOrganizationWebhookEndpoint(db, id, body)

  await writeOrganizationAuditLog(db, {
    organizationId: endpoint.organizationId,
    userId,
    action: 'webhook_endpoint.updated',
    targetType: 'organization_webhook_endpoint',
    targetId: endpoint.id,
  })

  return NextResponse.json(endpoint)
})

export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const { userId } = await requireAdminFromRequest(req)
  const id = extractId(req)

  const db = await createServiceRoleSupabaseClient()
  const { data: existing } = await db
    .from('organization_webhook_endpoints')
    .select('organization_id')
    .eq('id', id)
    .maybeSingle()
  if (!existing?.organization_id) throw new ApiError(404, 'Webhook endpoint not found')

  await assertAdminOrganizationAccess(db, userId, existing.organization_id)
  await deleteOrganizationWebhookEndpoint(db, id)

  await writeOrganizationAuditLog(db, {
    organizationId: existing.organization_id,
    userId,
    action: 'webhook_endpoint.deleted',
    targetType: 'organization_webhook_endpoint',
    targetId: id,
  })

  return NextResponse.json({ ok: true })
})
