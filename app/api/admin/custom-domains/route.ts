import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withErrorHandler, ApiError } from '@/lib/errors'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import { requireAdminFromRequest } from '@/lib/adminAuth'
import { assertAdminOrganizationAccess } from '@/lib/organizations/assertAdminOrganizationAccess'
import { createCustomDomain, listCustomDomainsByOrganization } from '@/lib/api/customDomains'
import { organizationHasFeature } from '@/lib/organizations/features'
import { writeOrganizationAuditLog } from '@/lib/api/organizationAuditLog'

const postSchema = z.object({
  organizationId: z.string().uuid(),
  domain: z.string().min(3).max(253),
})

export const GET = withErrorHandler(async (req: NextRequest) => {
  const { userId } = await requireAdminFromRequest(req)
  const orgId = new URL(req.url).searchParams.get('organizationId')
  if (!orgId) throw new ApiError(400, 'organizationId required')

  const db = await createServiceRoleSupabaseClient()
  await assertAdminOrganizationAccess(db, userId, orgId)

  const domains = await listCustomDomainsByOrganization(db, orgId)
  return NextResponse.json(domains)
})

export const POST = withErrorHandler(async (req: NextRequest) => {
  const { userId } = await requireAdminFromRequest(req)
  const body = postSchema.parse(await req.json())
  const db = await createServiceRoleSupabaseClient()
  await assertAdminOrganizationAccess(db, userId, body.organizationId)

  const customDomainEnabled = await organizationHasFeature(
    db,
    body.organizationId,
    'custom_domain',
  )
  if (!customDomainEnabled) {
    throw new ApiError(403, 'Custom domains are not enabled for this plan', 'CUSTOM_DOMAIN_DISABLED')
  }

  const domain = await createCustomDomain(db, body.organizationId, body.domain)

  await writeOrganizationAuditLog(db, {
    organizationId: body.organizationId,
    userId,
    action: 'custom_domain.created',
    targetType: 'custom_domain',
    targetId: domain.id,
    metadata: { domain: domain.domain, verificationToken: domain.verificationToken },
  })

  return NextResponse.json(domain, { status: 201 })
})
