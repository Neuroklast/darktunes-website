export const dynamic = 'force-dynamic'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getRequestOrganizationId } from '@/lib/organizations/requestContext'
import { getFeatureFlagsForRole } from '@/lib/api/featureFlags'
import { getTranslations } from 'next-intl/server'
import { AccreditationClient } from './_components/AccreditationClient'

export default async function AccreditationPage() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const flags = await getFeatureFlagsForRole(supabase, 'journalist', await getRequestOrganizationId().catch(() => undefined)).catch(() => ({} as Record<string, boolean>))
  if (flags['journalist.accreditation'] === false) {
    const t = await getTranslations('pressDashboard')
    return <p className="text-muted-foreground">{t('accreditationDisabled')}</p>
  }

  const { data } = await supabase
    .from('accreditation_requests')
    .select('*')
    .eq('journalist_id', user.id)
    .order('created_at', { ascending: false })

  return <AccreditationClient initialRequests={data ?? []} />
}
