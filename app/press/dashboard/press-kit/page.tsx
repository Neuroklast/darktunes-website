export const dynamic = 'force-dynamic'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getRequestOrganizationId } from '@/lib/organizations/requestContext'
import { getJournalistPressKit } from '@/lib/api/pressKit'
import { isPressZipDownloadEnabled } from '@/lib/pressAccess'
import { PressKitList } from './_components/PressKitList'

export default async function PressKitPage() {
  const supabase = await createServerSupabaseClient()
  const organizationId = await getRequestOrganizationId().catch(() => undefined)
  const [assets, zipDownloadEnabled] = await Promise.all([
    getJournalistPressKit(supabase).catch(() => []),
    isPressZipDownloadEnabled(supabase, organizationId),
  ])

  return <PressKitList assets={assets} zipDownloadEnabled={zipDownloadEnabled} />
}