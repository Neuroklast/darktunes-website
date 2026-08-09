import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withErrorHandler, ApiError } from '@/lib/errors'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import { requireAdminFromRequest } from '@/lib/adminAuth'
import { assertAdminOrganizationAccess } from '@/lib/organizations/assertAdminOrganizationAccess'
import { markCustomDomainVerified } from '@/lib/api/customDomains'
import { verifyDomainTxtToken } from '@/lib/organizations/verifyDomainDns'
import { writeOrganizationAuditLog } from '@/lib/api/organizationAuditLog'

const bodySchema = z.object({
  domainId: z.string().uuid(),
})

export const POST = withErrorHandler(async (req: NextRequest) => {
  const { userId } = await requireAdminFromRequest(req)
  const body = bodySchema.parse(await req.json())
  const db = await createServiceRoleSupabaseClient()

  const { data: row, error } = await db
    .from('custom_domains')
    .select('*')
    .eq('id', body.domainId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!row) throw new ApiError(404, 'Domain not found')

  await assertAdminOrganizationAccess(db, userId, row.organization_id)

  if (row.status === 'verified' || row.status === 'active') {
    return NextResponse.json({
      domain: {
        id: row.id,
        organizationId: row.organization_id,
        domain: row.domain,
        status: row.status,
        verificationToken: row.verification_token,
        verifiedAt: row.verified_at,
        createdAt: row.created_at,
      },
      alreadyVerified: true,
    })
  }

  const allowForce =
    process.env.CUSTOM_DOMAIN_FORCE_VERIFY === '1' ||
    process.env.CUSTOM_DOMAIN_FORCE_VERIFY === 'true'

  let dnsOk = false
  let dnsDetail: Awaited<ReturnType<typeof verifyDomainTxtToken>> | null = null

  if (allowForce && process.env.NODE_ENV !== 'production') {
    dnsOk = true
  } else {
    dnsDetail = await verifyDomainTxtToken(row.domain, row.verification_token)
    dnsOk = dnsDetail.ok
  }

  if (!dnsOk) {
    const hosts = (dnsDetail?.checkedHosts ?? []).join(' or ')
    const dnsHint = dnsDetail?.error ? ` DNS error: ${dnsDetail.error}.` : ''
    throw new ApiError(
      400,
      `DNS TXT verification failed for ${row.domain}. Publish TXT value "${row.verification_token}" on ${hosts || 'the domain'}, wait for propagation, then try again.${dnsHint}`,
      'DNS_VERIFY_FAILED',
    )
  }

  const domain = await markCustomDomainVerified(db, body.domainId)

  await writeOrganizationAuditLog(db, {
    organizationId: row.organization_id,
    userId,
    action: 'custom_domain.verified',
    targetType: 'custom_domain',
    targetId: domain.id,
    metadata: {
      domain: domain.domain,
      matchedHost: dnsDetail?.matchedHost ?? null,
      forced: allowForce && process.env.NODE_ENV !== 'production',
    },
  })

  return NextResponse.json({
    domain,
    message:
      'Domain verified. Point a CNAME (or ALIAS/ANAME) for the apex/www host to your platform tenant hostname so traffic resolves correctly.',
  })
})
