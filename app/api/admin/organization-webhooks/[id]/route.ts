import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withErrorHandler } from '@/lib/errors'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { extractBearerToken, verifyAdmin } from '@/lib/adminAuth'
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
    .array(z.enum(['artist.created', 'release.submitted', 'release.approved', 'release.rejected', '*']))
    .min(1)
    .optional(),
})

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const token = extractBearerToken(req.headers.get('authorization'))
  const userId = await verifyAdmin(token)
  const id = extractId(req)
  const body = patchSchema.parse(await req.json())

  const supabase = await createServerSupabaseClient()
  const endpoint = await updateOrganizationWebhookEndpoint(supabase, id, body)

  await writeOrganizationAuditLog(supabase, {
    organizationId: endpoint.organizationId,
    userId,
    action: 'webhook_endpoint.updated',
    targetType: 'organization_webhook_endpoint',
    targetId: endpoint.id,
  })

  return NextResponse.json(endpoint)
})

export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const token = extractBearerToken(req.headers.get('authorization'))
  const userId = await verifyAdmin(token)
  const id = extractId(req)

  const supabase = await createServerSupabaseClient()
  const { data: existing } = await supabase
    .from('organization_webhook_endpoints')
    .select('organization_id')
    .eq('id', id)
    .maybeSingle()

  await deleteOrganizationWebhookEndpoint(supabase, id)

  if (existing?.organization_id) {
    await writeOrganizationAuditLog(supabase, {
      organizationId: existing.organization_id,
      userId,
      action: 'webhook_endpoint.deleted',
      targetType: 'organization_webhook_endpoint',
      targetId: id,
    })
  }

  return NextResponse.json({ ok: true })
})