export const dynamic = 'force-dynamic'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getRequestOrganizationId } from '@/lib/organizations/requestContext'
import { getFeatureFlagsForRole } from '@/lib/api/featureFlags'
import { getTranslations } from 'next-intl/server'
import { ContactClient } from './_components/ContactClient'

export default async function PressContactPage() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const flags = await getFeatureFlagsForRole(supabase, 'journalist', await getRequestOrganizationId().catch(() => undefined)).catch(() => ({} as Record<string, boolean>))
  if (flags['press.contact'] === false) {
    const t = await getTranslations('pressDashboard')
    return <p className="text-muted-foreground">{t('contactDisabled')}</p>
  }

  return <ContactClient userId={user.id} userEmail={user.email ?? ''} />
}