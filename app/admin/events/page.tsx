/**
 * app/admin/events/page.tsx — Events / Live Shows Management
 *
 * Prefetches artists, concerts, and news titles on the server (parallel).
 * Artist switch uses ?artistId= (same pattern as promo-log).
 * Tour Production remains at /admin/tour-planner — not this page.
 */

export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'
import { Skeleton } from '@/components/ui/skeleton'
import { getArtists } from '@/lib/api/artists'
import { getConcertsByArtistId } from '@/lib/api/concerts'
import { getNewsPosts } from '@/lib/api/news'
import { isNewsPublished } from '@/lib/news/effectiveStatus'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { AdminConcertsManager } from '@/components/admin/AdminConcertsManager'
import { AdminPageShell } from '../_components/AdminPageShell'

async function EventsLoading() {
  const t = await getTranslations('admin.events')
  return (
    <div className="space-y-3 p-2" aria-busy="true" aria-label={t('loadingEvents')}>
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-20 w-full" />
    </div>
  )
}

async function AdminEventsContent({
  searchParams,
}: {
  searchParams: Promise<{ artistId?: string }>
}) {
  const { artistId: artistIdParam } = await searchParams
  const supabase = await createServerSupabaseClient()

  const artists = await getArtists(supabase).catch(() => [])
  const selectedArtistId =
    artistIdParam && artists.some((a) => a.id === artistIdParam) ? artistIdParam : null

  const [concerts, newsPosts] = await Promise.all([
    selectedArtistId
      ? getConcertsByArtistId(supabase, selectedArtistId).catch(() => [])
      : Promise.resolve([]),
    getNewsPosts(supabase)
      .then((posts) =>
        posts
          .filter((p) => isNewsPublished(p))
          .slice(0, 50)
          .map((p) => ({ id: p.id, title: p.title })),
      )
      .catch(() => []),
  ])

  return (
    <AdminConcertsManager
      artists={artists.map((a) => ({ id: a.id, name: a.name }))}
      selectedArtistId={selectedArtistId}
      concerts={concerts}
      newsPosts={newsPosts}
      syncSearchParams
    />
  )
}

export default async function AdminEventsPage({
  searchParams,
}: {
  searchParams: Promise<{ artistId?: string }>
}) {
  const t = await getTranslations('admin.events')
  return (
    <AdminPageShell title={t('pageTitle')} description={t('pageDescription')}>
      <Suspense fallback={<EventsLoading />}>
        <AdminEventsContent searchParams={searchParams} />
      </Suspense>
    </AdminPageShell>
  )
}
