export const dynamic = 'force-dynamic'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getRequestOrganizationId } from '@/lib/organizations/requestContext'
import { getPromoReleases } from '@/lib/api/releases'
import { getPromoTracks } from '@/lib/api/promoTracks'
import { isPressAudioPreviewEnabled, isPromoPoolEnabled } from '@/lib/pressAccess'
import { getTranslations } from 'next-intl/server'
import { PromoDownloads } from './_components/PromoDownloads'

export default async function PressPromoPoolPage() {
  const supabase = await createServerSupabaseClient()
  const organizationId = await getRequestOrganizationId().catch(() => undefined)
  const promoPoolEnabled = await isPromoPoolEnabled(supabase, organizationId)
  if (!promoPoolEnabled) {
    const t = await getTranslations('pressDashboard')
    return <p className="text-muted-foreground">{t('promoPoolDisabled')}</p>
  }

  const [releases, promoTracks, audioPreviewEnabled] = await Promise.all([
    getPromoReleases(supabase).catch(() => []),
    getPromoTracks(supabase).catch(() => []),
    isPressAudioPreviewEnabled(supabase, organizationId),
  ])

  return (
    <PromoDownloads
      releases={releases}
      promoTracks={promoTracks}
      audioPreviewEnabled={audioPreviewEnabled}
    />
  )
}