export const dynamic = 'force-dynamic'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getRequestOrganizationId } from '@/lib/organizations/requestContext'
import { DEFAULT_ORGANIZATION_ID } from '@/lib/organizations/constants'
import { getFeatureFlagsForRole } from '@/lib/api/featureFlags'
import { isPromoPoolEnabled } from '@/lib/pressAccess'
import { getDownloadHistory } from '@/lib/api/journalistDownloads'
import { getInterviewRequestsByJournalistId } from '@/lib/api/interviewRequests'
import { JournalistDashboardClient } from './_components/JournalistDashboardClient'
import type { AccreditationRequest } from '@/types'

export default async function PressDashboardPage() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const organizationId =
    (await getRequestOrganizationId().catch(() => undefined)) ?? DEFAULT_ORGANIZATION_ID
  const [flags, promoPoolEnabled, downloads, interviewRequests, accreditationRows] = await Promise.all([
    getFeatureFlagsForRole(supabase, 'journalist', organizationId).catch(() => ({} as Record<string, boolean>)),
    isPromoPoolEnabled(supabase, organizationId),
    getDownloadHistory(supabase, user.id, organizationId).catch(() => []),
    getInterviewRequestsByJournalistId(supabase, user.id).catch(() => []),
    supabase
      .from('accreditation_requests')
      .select('*')
      .eq('journalist_id', user.id)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false }),
  ])

  const accreditations: AccreditationRequest[] = (accreditationRows.data ?? []).map((row) => ({
    id: row.id,
    journalistId: row.journalist_id,
    eventName: row.event_name,
    eventDate: row.event_date,
    publication: row.publication,
    reason: row.reason,
    status: row.status,
    adminNote: row.admin_note ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))

  const cardHrefs = [
    { href: '/press/dashboard/profile', enabled: true },
    { href: '/press/dashboard/promo-pool', enabled: promoPoolEnabled },
    { href: '/press/dashboard/press-kit', enabled: true },
    { href: '/press/dashboard/press-releases', enabled: true },
    { href: '/press/dashboard/accreditation', enabled: flags['journalist.accreditation'] ?? true },
    { href: '/press/dashboard/contact', enabled: flags['press.contact'] ?? true },
    { href: '/press/dashboard/download-history', enabled: true },
    { href: '/press/dashboard/interviews', enabled: true },
  ]
    .filter((item) => item.enabled)
    .map(({ href }) => href)

  return (
    <JournalistDashboardClient
      cardHrefs={cardHrefs}
      downloads={downloads}
      accreditations={accreditations}
      interviews={interviewRequests}
    />
  )
}