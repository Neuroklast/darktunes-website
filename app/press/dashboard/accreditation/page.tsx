export const dynamic = 'force-dynamic'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getRequestOrganizationId } from '@/lib/organizations/requestContext'
import { DEFAULT_ORGANIZATION_ID } from '@/lib/organizations/constants'
import { getFeatureFlagsForRole } from '@/lib/api/featureFlags'
import { getTranslations } from 'next-intl/server'
import { AccreditationClient } from './_components/AccreditationClient'
import type { AccreditationRequest } from '@/types'

export default async function AccreditationPage() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const organizationId =
    (await getRequestOrganizationId().catch(() => undefined)) ?? DEFAULT_ORGANIZATION_ID

  const flags = await getFeatureFlagsForRole(supabase, 'journalist', organizationId).catch(
    () => ({}) as Record<string, boolean>,
  )
  if (flags['journalist.accreditation'] === false) {
    const t = await getTranslations('pressDashboard')
    return <p className="text-muted-foreground">{t('accreditationDisabled')}</p>
  }

  const { data } = await supabase
    .from('accreditation_requests')
    .select('*')
    .eq('journalist_id', user.id)
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })

  const initialRequests: AccreditationRequest[] = (data ?? []).map((row) => ({
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

  return <AccreditationClient initialRequests={initialRequests} />
}
