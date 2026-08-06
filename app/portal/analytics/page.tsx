/**
 * Legacy /portal/analytics → SOS analytics (bookmarks & old nav links).
 * Spotify presence lives at /portal/spotify-trends.
 */

export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'

export default async function AnalyticsRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ artistId?: string; tab?: string }>
}) {
  const params = await searchParams
  const qs = new URLSearchParams()
  if (params.artistId) qs.set('artistId', params.artistId)
  // Map legacy Spotify tab to the dedicated trends page
  if (params.tab === 'listeners') {
    const q = qs.toString()
    redirect(q ? `/portal/spotify-trends?${q}` : '/portal/spotify-trends')
  }
  if (params.tab) qs.set('tab', params.tab)
  const q = qs.toString()
  redirect(q ? `/portal/sos-analytics?${q}` : '/portal/sos-analytics')
}
