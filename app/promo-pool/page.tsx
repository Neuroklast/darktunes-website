/**
 * app/promo-pool/page.tsx — Promo Pool main page (Server Component)
 *
 * Fetches available promo tracks and passes them to the client component.
 * Access is already verified by the layout — only journalists/admins reach here.
 */

export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getRequestOrganizationId } from '@/lib/organizations/requestContext'
import { getPromoTracks } from '@/lib/api/promoTracks'
import { isPressAudioPreviewEnabled } from '@/lib/pressAccess'
import { PromoPoolClient } from './_components/PromoPoolClient'
import { getMetadataBrand, pageTitle } from '@/lib/seo/metadata'

export async function generateMetadata(): Promise<Metadata> {
  const { labelName } = await getMetadataBrand()
  return {
    title: pageTitle('Promo Pool', labelName),
    robots: { index: false, follow: false },
  }
}

export default async function PromoPoolPage() {
  const supabase = await createServerSupabaseClient()
  const organizationId = await getRequestOrganizationId().catch(() => undefined)
  const [tracks, audioPreviewEnabled] = await Promise.all([
    getPromoTracks(supabase).catch(() => []),
    isPressAudioPreviewEnabled(supabase, organizationId),
  ])

  return <PromoPoolClient tracks={tracks} audioPreviewEnabled={audioPreviewEnabled} />
}