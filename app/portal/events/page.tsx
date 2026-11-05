/**
 * app/portal/events/page.tsx — Events (Server Component)
 *
 * Fetches upcoming concerts/events for the current artist and renders EventManager.
 */

export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { resolvePortalArtist } from '@/lib/api/artistProfiles'
import { getConcertsByArtistId } from '@/lib/api/concerts'
import { getPublicNewsPosts } from '@/lib/api/news'
import { getArtists } from '@/lib/api/artists'
import { Skeleton } from '@/components/ui/skeleton'
import { EventManager } from './_components/EventManager'
function EventsSkeleton() {


  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-20 w-full" />
      ))}
    </div>
  )
}

async function EventsContent({ searchParams }: { searchParams: Promise<{ artistId?: string }> }) {

  const { artistId } = await searchParams
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const artist = await resolvePortalArtist(supabase, user.id, artistId).catch(() => null)
  const [concerts, allArtists, newsPosts] = await Promise.all([
    artist ? getConcertsByArtistId(supabase, artist.id).catch(() => []) : Promise.resolve([]),
    getArtists(supabase).catch(() => []),
    getPublicNewsPosts(supabase).catch(() => []),
  ])

  return (
    <EventManager
      concerts={concerts}
      artistId={artist?.id ?? null}
      allArtists={allArtists}
      newsPosts={newsPosts.map((p) => ({ id: p.id, title: p.title }))}
    />
  )
}

export default function EventsPage({ searchParams }: { searchParams: Promise<{ artistId?: string }> }) {
  return (
    <Suspense fallback={<EventsSkeleton />}>
      <EventsContent searchParams={searchParams} />
    </Suspense>
  )
}
