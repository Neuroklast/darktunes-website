import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandler, ApiError } from '@/lib/errors'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { extractBearerToken, verifyAdmin } from '@/lib/adminAuth'
import { writeOrganizationAuditLog } from '@/lib/api/organizationAuditLog'

function extractOrgId(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split('/')
  return segments[segments.length - 2] ?? ''
}

/** GDPR-style org data export (admin-only). Returns core tenant tables as JSON. */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const token = extractBearerToken(req.headers.get('authorization'))
  const userId = await verifyAdmin(token)
  const organizationId = extractOrgId(req)
  if (!organizationId) throw new ApiError(400, 'Organization ID required')

  const db = await createServerSupabaseClient()
  const [org, artists, releases, submissions, domains, audit] = await Promise.all([
    db.from('organizations').select('*').eq('id', organizationId).maybeSingle(),
    db.from('artists').select('id, name, slug, email, country, created_at').eq('organization_id', organizationId),
    db.from('releases').select('id, title, artist_id, release_date, type, created_at').eq('organization_id', organizationId),
    db.from('release_submissions').select('id, title, artist_id, status, created_at').eq('organization_id', organizationId),
    db.from('custom_domains').select('id, domain, status, verified_at, created_at').eq('organization_id', organizationId),
    db.from('organization_audit_log').select('*').eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(200),
  ])

  await writeOrganizationAuditLog(db, {
    organizationId,
    userId,
    action: 'organization.exported',
    targetType: 'organization',
    targetId: organizationId,
  })

  const stamp = new Date().toISOString().slice(0, 10)
  const payload = {
    exportedAt: new Date().toISOString(),
    organization: org.data,
    artists: artists.data ?? [],
    releases: releases.data ?? [],
    releaseSubmissions: submissions.data ?? [],
    customDomains: domains.data ?? [],
    auditLog: audit.data ?? [],
  }

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="org-export-${organizationId}-${stamp}.json"`,
    },
  })
})