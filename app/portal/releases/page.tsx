/**
 * app/portal/releases/page.tsx — Catalog releases for the current artist.
 * Submission status/progress: /portal/releases/submissions
 */

export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { resolvePortalArtist } from '@/lib/api/artistProfiles'
import { getReleasesByArtistId } from '@/lib/api/releases'
import { Skeleton } from '@/components/ui/skeleton'
import { ReleaseListPanel } from './_components/ReleaseListPanel'

function ReleasesSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-64" />
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-32 w-full" />
      ))}
    </div>
  )
}

async function ReleasesContent({ searchParams }: { searchParams: Promise<{ artistId?: string }> }) {
  const { artistId } = await searchParams
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const artist = await resolvePortalArtist(supabase, user.id, artistId).catch(() => null)
  const releases = artist
    ? await getReleasesByArtistId(supabase, artist.id).catch(() => [])
    : []

  const today = new Date().toISOString().split('T')[0]
  const upcomingReleases = releases.filter((r) => !r.releaseDate || r.releaseDate > today)
  const releasedReleases = releases.filter((r) => r.releaseDate && r.releaseDate <= today)

  return (
    <ReleaseListPanel
      upcomingReleases={upcomingReleases}
      releasedReleases={releasedReleases}
    />
  )
}

export default function ReleasesPage({ searchParams }: { searchParams: Promise<{ artistId?: string }> }) {
  return (
    <Suspense fallback={<ReleasesSkeleton />}>
      <ReleasesContent searchParams={searchParams} />
    </Suspense>
  )
}
