import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withErrorHandler } from '@/lib/errors'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { extractBearerToken, verifyAdmin } from '@/lib/adminAuth'
import { createCustomDomain, listCustomDomainsByOrganization } from '@/lib/api/customDomains'
import { organizationHasFeature } from '@/lib/organizations/features'
import { ApiError } from '@/lib/errors'
import { writeOrganizationAuditLog } from '@/lib/api/organizationAuditLog'

const postSchema = z.object({
  organizationId: z.string().uuid(),
  domain: z.string().min(3).max(253),
})

export const GET = withErrorHandler(async (req: NextRequest) => {
  const token = extractBearerToken(req.headers.get('authorization'))
  await verifyAdmin(token)
  const orgId = new URL(req.url).searchParams.get('organizationId')
  if (!orgId) return NextResponse.json({ error: 'organizationId required' }, { status: 400 })

  const supabase = await createServerSupabaseClient()
  const domains = await listCustomDomainsByOrganization(supabase, orgId)
  return NextResponse.json(domains)
})

export const POST = withErrorHandler(async (req: NextRequest) => {
  const token = extractBearerToken(req.headers.get('authorization'))
  const userId = await verifyAdmin(token)
  const body = postSchema.parse(await req.json())
  const supabase = await createServerSupabaseClient()
  const customDomainEnabled = await organizationHasFeature(supabase, body.organizationId, 'custom_domain')
  if (!customDomainEnabled) {
    throw new ApiError(403, 'Custom domains are not enabled for this plan', 'CUSTOM_DOMAIN_DISABLED')
  }
  const domain = await createCustomDomain(supabase, body.organizationId, body.domain)

  await writeOrganizationAuditLog(supabase, {
    organizationId: body.organizationId,
    userId,
    action: 'custom_domain.created',
    targetType: 'custom_domain',
    targetId: domain.id,
    metadata: { domain: domain.domain, verificationToken: domain.verificationToken },
  })

  return NextResponse.json(domain, { status: 201 })
})