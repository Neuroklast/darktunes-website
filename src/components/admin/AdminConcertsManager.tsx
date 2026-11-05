'use client'

/**
 * Admin-side live shows manager.
 *
 * - `AdminConcertsManager` — controlled (RSC page passes data; artist switch via ?artistId=).
 * - `AdminConcertsManagerEmbedded` — self-fetch for AdminDashboard tabs only.
 *
 * Events/live shows only. Tour Production = /admin/tour-planner (unchanged).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { CalendarBlank } from '@phosphor-icons/react'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { EventManager } from '../../../app/portal/events/_components/EventManager'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { PortalEmptyState } from '@/components/portal/PortalEmptyState'
import type { Artist, Concert, NewsPost } from '@/types'

const NO_ARTIST = '__none__'

export interface AdminConcertsManagerProps {
  artists: Pick<Artist, 'id' | 'name'>[]
  selectedArtistId: string | null
  concerts: Concert[]
  newsPosts: Pick<NewsPost, 'id' | 'title'>[]
  /** When true, artist changes update `?artistId=` (RSC page). */
  syncSearchParams?: boolean
  onArtistChange?: (artistId: string | null) => void
  /** When false, only the artist selector is shown (e.g. while concerts load). */
  showEvents?: boolean
}

function mapConcertRows(
  concertRows: Array<Record<string, unknown>>,
): Concert[] {
  return concertRows.map((row) => ({
    id: row.id as string,
    artistId: row.artist_id as string,
    artistName: '',
    eventName: row.event_name as string,
    venueName: (row.venue_name as string | null) ?? null,
    venueAddress: (row.venue_address as string | null) ?? null,
    venueCity: (row.venue_city as string | null) ?? null,
    venueCountry: (row.venue_country as string | null) ?? null,
    concertDate: row.concert_date as string,
    ticketUrl: (row.ticket_url as string | null) ?? null,
    songkickId: (row.songkick_id as string | null) ?? null,
    bandsintownId: (row.bandsintown_id as string | null) ?? null,
    status: row.status as Concert['status'],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    eventTime: (row.event_time as string | null) ?? null,
    eventType: (row.event_type as string | null) ?? 'gig',
    trailerUrl: (row.trailer_url as string | null) ?? null,
    venueLat: (row.venue_lat as number | null) ?? null,
    venueLng: (row.venue_lng as number | null) ?? null,
    venueOsmId: (row.venue_osm_id as string | null) ?? null,
    newsPostId: (row.news_post_id as string | null) ?? null,
  }))
}

export function AdminConcertsManager({
  artists,
  selectedArtistId,
  concerts,
  newsPosts,
  syncSearchParams = false,
  onArtistChange,
  showEvents = true,
}: AdminConcertsManagerProps) {
  const t = useTranslations('admin.events')
  const router = useRouter()
  const pathname = usePathname()

  const handleArtistChange = (value: string) => {
    const nextId = value === NO_ARTIST ? null : value
    onArtistChange?.(nextId)
    if (syncSearchParams) {
      if (!nextId) {
        router.push(pathname)
        return
      }
      const params = new URLSearchParams()
      params.set('artistId', nextId)
      router.push(`${pathname}?${params.toString()}`)
    }
  }

  if (artists.length === 0) {
    return (
      <PortalEmptyState
        icon={CalendarBlank}
        heading={t('noArtistsHeading')}
        description={t('noArtistsDescription')}
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2 max-w-sm">
        <label htmlFor="admin-concerts-artist" className="text-sm font-medium">
          {t('selectArtist')}
        </label>
        <Select value={selectedArtistId ?? NO_ARTIST} onValueChange={handleArtistChange}>
          <SelectTrigger id="admin-concerts-artist" className="min-h-[44px]">
            <SelectValue placeholder={t('chooseArtist')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_ARTIST}>{t('chooseArtistNone')}</SelectItem>
            {artists.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">{t('selectArtistHint')}</p>
      </div>

      {selectedArtistId && showEvents ? (
        <EventManager
          key={selectedArtistId}
          concerts={concerts}
          artistId={selectedArtistId}
          allArtists={artists as Artist[]}
          newsPosts={newsPosts}
          concertsApiPath="/api/admin/concerts"
          hideIcsExport
        />
      ) : null}
    </div>
  )
}

/**
 * Self-contained variant for AdminDashboard tabs (no RSC searchParams).
 * Artists + published news load in parallel; concerts load when an artist is chosen.
 */
export function AdminConcertsManagerEmbedded() {
  const t = useTranslations('admin.events')
  const supabase = useMemo(() => createBrowserSupabaseClient(), [])
  const [artists, setArtists] = useState<Pick<Artist, 'id' | 'name'>[]>([])
  const [artistsLoading, setArtistsLoading] = useState(true)
  const [selectedArtistId, setSelectedArtistId] = useState<string | null>(null)
  const [concerts, setConcerts] = useState<Concert[]>([])
  const [newsPosts, setNewsPosts] = useState<Pick<NewsPost, 'id' | 'title'>[]>([])
  const [concertsLoading, setConcertsLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const [{ data: artistRows }, { data: newsRows }] = await Promise.all([
        supabase.from('artists').select('id, name').order('name', { ascending: true }),
        supabase
          .from('news_posts')
          .select('id, title')
           .in('status', ['published', 'scheduled'])
          .lte('published_at', new Date().toISOString())
          .order('published_at', { ascending: false })
          .limit(50),
      ])
      if (cancelled) return
      setArtists((artistRows ?? []) as Pick<Artist, 'id' | 'name'>[])
      setNewsPosts(
        (newsRows ?? []).map((r) => ({ id: r.id as string, title: r.title as string })),
      )
      setArtistsLoading(false)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [supabase])

  const loadConcerts = useCallback(
    async (artistId: string) => {
      setConcertsLoading(true)
      try {
        const today = new Date().toISOString().split('T')[0]
        const { data: concertRows } = await supabase
          .from('concerts')
          .select(
            'id, artist_id, event_name, venue_name, venue_address, venue_city, venue_country, concert_date, ticket_url, songkick_id, bandsintown_id, status, created_at, updated_at, event_time, event_type, trailer_url, venue_lat, venue_lng, venue_osm_id, news_post_id',
          )
          .eq('artist_id', artistId)
          .gte('concert_date', today)
          .order('concert_date', { ascending: true })

        setConcerts(mapConcertRows((concertRows ?? []) as Array<Record<string, unknown>>))
      } finally {
        setConcertsLoading(false)
      }
    },
    [supabase],
  )

  const handleArtistChange = (artistId: string | null) => {
    setSelectedArtistId(artistId)
    if (!artistId) {
      setConcerts([])
      return
    }
    void loadConcerts(artistId)
  }

  if (artistsLoading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label={t('loadingArtists')}>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-4 w-48" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <AdminConcertsManager
        artists={artists}
        selectedArtistId={selectedArtistId}
        concerts={concerts}
        newsPosts={newsPosts}
        onArtistChange={handleArtistChange}
        showEvents={!concertsLoading}
      />
      {concertsLoading && selectedArtistId ? (
        <div className="space-y-3" aria-busy="true" aria-label={t('loadingEvents')}>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : null}
    </div>
  )
}
