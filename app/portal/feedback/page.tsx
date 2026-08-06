/**
 * app/portal/feedback/page.tsx — Artist product feedback
 *
 * Resolves the active portal artist server-side so feedback always submits
 * for the current band (URL ?artistId= or first membership).
 */

export const dynamic = 'force-dynamic'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { resolvePortalArtist } from '@/lib/api/artistProfiles'
import { FeedbackPageClient } from './_components/FeedbackPageClient'

export default async function PortalFeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ artistId?: string }>
}) {
  const { artistId } = await searchParams
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const artist = await resolvePortalArtist(supabase, user.id, artistId).catch(() => null)

  return (
    <FeedbackPageClient
      artistId={artist?.id ?? null}
      artistName={artist?.name ?? null}
    />
  )
}
