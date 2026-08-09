import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { Concert } from '@/types'
import { PUBLIC_QUERY_LIMITS } from './queryLimits'

type DbClient = SupabaseClient<Database>
type ConcertRow = Database['public']['Tables']['concerts']['Row']
/** ConcertRow extended with the embedded artists FK join used in SELECT queries. */
type ConcertRowWithArtist = ConcertRow & { artists?: { name: string } | null }
export type ConcertInsert = Database['public']['Tables']['concerts']['Insert']
export type ConcertUpdate = Database['public']['Tables']['concerts']['Update']

function rowToConcert(row: ConcertRowWithArtist): Concert {
  return {
    id: row.id,
    artistId: row.artist_id,
    artistName: row.artists?.name ?? '',
    eventName: row.event_name,
    venueName: row.venue_name,
    venueAddress: row.venue_address ?? null,
    venueCity: row.venue_city,
    venueCountry: row.venue_country,
    concertDate: row.concert_date,
    ticketUrl: row.ticket_url,
    songkickId: row.songkick_id,
    bandsintownId: row.bandsintown_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    eventTime: row.event_time ?? null,
    eventType: row.event_type ?? 'gig',
    trailerUrl: row.trailer_url ?? null,
    venueLat: row.venue_lat ?? null,
    venueLng: row.venue_lng ?? null,
    venueOsmId: row.venue_osm_id ?? null,
    newsPostId: row.news_post_id ?? null,
  }
}

export async function getConcertsByArtistId(db: DbClient, artistId: string): Promise<Concert[]> {
  const today = new Date().toISOString().split('T')[0]

  // Step 1: collect concert IDs where this artist is featured in the junction table
  const { data: junctionRows, error: junctionError } = await db
    .from('concert_artists')
    .select('concert_id')
    .eq('artist_id', artistId)
  if (junctionError) throw new Error(junctionError.message)

  const featuredConcertIds = (junctionRows ?? []).map((r) => r.concert_id)

  // Step 2: fetch concerts by primary artist_id OR by featured concert IDs.
  // A single .or() string is used in both cases to keep the builder type consistent.
  const orFilter =
    featuredConcertIds.length > 0
      ? `artist_id.eq.${artistId},id.in.(${featuredConcertIds.join(',')})`
      : `artist_id.eq.${artistId}`

  // Store in a let variable before awaiting so TypeScript preserves the Result type
  // (same pattern as getPublicConcerts; direct-chain await loses the generic)
  let builder = db
    .from('concerts')
    .select('*, artists(name)')
    .gte('concert_date', today)
    .order('concert_date', { ascending: true })
  builder = builder.or(orFilter)

  const { data, error } = await builder

  if (error) throw new Error(error.message)

  // Map to domain type first (same pattern as getConcerts / getPublicConcerts),
  // then deduplicate in case the artist is both primary and in concert_artists.
  const seen = new Set<string>()
  const concerts = (data ?? [])
    .map(rowToConcert)
    .filter((c) => {
      if (seen.has(c.id)) return false
      seen.add(c.id)
      return true
    })

  return attachConcertArtists(db, concerts)
}

export async function getConcerts(db: DbClient): Promise<Concert[]> {
  const today = new Date().toISOString().split('T')[0]
  const { data, error } = await db
    .from('concerts')
    .select('*, artists(name)')
    .gte('concert_date', today)
    .order('concert_date', { ascending: true })

  if (error) throw new Error(error.message)

  return (data ?? [])
    .map(rowToConcert)
    .sort((a, b) => {
      const aPriority = a.status === 'ok' ? 0 : 1
      const bPriority = b.status === 'ok' ? 0 : 1
      if (aPriority !== bPriority) return aPriority - bPriority
      return new Date(a.concertDate).getTime() - new Date(b.concertDate).getTime()
    })
}

export async function createConcert(db: DbClient, concertData: ConcertInsert): Promise<Concert> {
  const { data, error } = await db.from('concerts').insert(concertData).select('*, artists(name)').single()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('No data returned from createConcert')
  return rowToConcert(data)
}

export async function updateConcert(
  db: DbClient,
  id: string,
  concertData: ConcertUpdate,
): Promise<Concert> {
  const { data, error } = await db
    .from('concerts')
    .update(concertData)
    .eq('id', id)
    .select('*, artists(name)')
    .single()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('No data returned from updateConcert')
  return rowToConcert(data)
}

export async function deleteConcert(db: DbClient, id: string): Promise<void> {
  const { error } = await db.from('concerts').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

/**
 * Public-facing query: returns only concerts for visible artists.
 * Used by the public homepage (Server Component). The admin uses getConcerts instead.
 */
export async function getPublicConcerts(
  db: DbClient,
  organizationId: string = '00000000-0000-0000-0000-000000000000',
): Promise<Concert[]> {
  const today = new Date().toISOString().split('T')[0]

  // Fetch IDs of hidden artists to exclude their concerts
  const { data: hiddenArtistRows, error: hiddenErr } = await db
    .from('artists')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('is_visible', false)
  if (hiddenErr) throw new Error(hiddenErr.message)

  const hiddenIds = (hiddenArtistRows ?? []).map((a) => a.id)

  let builder = db
    .from('concerts')
    .select('*, artists(name)')
    .eq('organization_id', organizationId)
    .gte('concert_date', today)
    .order('concert_date', { ascending: true })
    .limit(PUBLIC_QUERY_LIMITS.concerts)

  if (hiddenIds.length > 0) {
    builder = builder.or(`artist_id.is.null,artist_id.not.in.(${hiddenIds.join(',')})`)
  }

  const { data, error } = await builder
  if (error) throw new Error(error.message)

  return (data ?? [])
    .map(rowToConcert)
    .sort((a, b) => {
      const aPriority = a.status === 'ok' ? 0 : 1
      const bPriority = b.status === 'ok' ? 0 : 1
      if (aPriority !== bPriority) return aPriority - bPriority
      return new Date(a.concertDate).getTime() - new Date(b.concertDate).getTime()
    })
}

/**
 * Attach featured/supporting artists to concerts from the concert_artists junction table.
 */
export async function attachConcertArtists(db: DbClient, concerts: Concert[]): Promise<Concert[]> {
  if (concerts.length === 0) return concerts

  try {
    const ids = concerts.map((c) => c.id)
    const { data, error } = await db
      .from('concert_artists')
      .select('concert_id, artist_id, sort_order, artists(id, name, slug)')
      .in('concert_id', ids)
      .order('sort_order', { ascending: true })
    if (error) return concerts // graceful fallback

    type JoinRow = { concert_id: string; artist_id: string; sort_order: number; artists: { id: string; name: string; slug: string } | null }

    const byId: Record<string, { id: string; name: string; slug: string }[]> = {}
    for (const row of (data ?? []) as JoinRow[]) {
      if (!row.artists) continue
      if (!byId[row.concert_id]) byId[row.concert_id] = []
      byId[row.concert_id].push(row.artists)
    }

    return concerts.map((c) => ({ ...c, featuredArtists: byId[c.id] ?? [] }))
  } catch {
    return concerts // graceful fallback when mock/DB doesn't support .in()
  }
}

/**
 * Replace the concert_artists rows for a concert.
 */
export async function setConcertArtists(
  db: DbClient,
  concertId: string,
  artistIds: string[],
): Promise<void> {
  await db.from('concert_artists').delete().eq('concert_id', concertId)
  if (artistIds.length === 0) return
  const rows = artistIds.map((artist_id, i) => ({ concert_id: concertId, artist_id, sort_order: i }))
  const { error } = await db.from('concert_artists').insert(rows)
  if (error) throw new Error(error.message)
}

/**
 * Slim nested select for the portal calendar (past + future shows).
 * One PostgREST round-trip with artists + featured artists.
 */
const CALENDAR_CONCERT_SELECT = [
  'id',
  'artist_id',
  'event_name',
  'venue_name',
  'venue_city',
  'venue_country',
  'concert_date',
  'ticket_url',
  'status',
  'event_time',
  'event_type',
  'artists(id, name, slug, is_visible)',
  'concert_artists(sort_order, artists(id, name, slug, is_visible))',
].join(', ')

type CalendarArtistEmbed = {
  id: string
  name: string
  slug: string
  is_visible: boolean | null
}

type CalendarConcertJunction = {
  sort_order: number | null
  artists: CalendarArtistEmbed | CalendarArtistEmbed[] | null
}

type CalendarConcertRow = {
  id: string
  artist_id: string | null
  event_name: string
  venue_name: string | null
  venue_city: string | null
  venue_country: string | null
  concert_date: string
  ticket_url: string | null
  status: string
  event_time: string | null
  event_type: string
  artists: CalendarArtistEmbed | CalendarArtistEmbed[] | null
  concert_artists?: CalendarConcertJunction[] | null
}

function unwrapArtist(
  artists: CalendarArtistEmbed | CalendarArtistEmbed[] | null | undefined,
): CalendarArtistEmbed | null {
  if (!artists) return null
  return Array.isArray(artists) ? (artists[0] ?? null) : artists
}

function mapCalendarConcertRow(row: CalendarConcertRow): Concert | null {
  const primary = unwrapArtist(row.artists)
  if (primary && primary.is_visible === false) {
    // Primary artist hidden — still keep if a featured artist is visible
  }

  const featured: { id: string; name: string; slug: string }[] = []
  for (const entry of [...(row.concert_artists ?? [])].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
  )) {
    const artist = unwrapArtist(entry.artists)
    if (!artist || artist.is_visible === false) continue
    featured.push({ id: artist.id, name: artist.name, slug: artist.slug })
  }

  const primaryVisible = primary && primary.is_visible !== false ? primary : null
  if (!primaryVisible && featured.length === 0 && primary?.is_visible === false) {
    return null
  }

  const artistName = primaryVisible?.name ?? featured[0]?.name ?? primary?.name ?? ''
  const artistId = primaryVisible?.id ?? row.artist_id ?? featured[0]?.id ?? null

  return {
    id: row.id,
    artistId,
    artistName,
    eventName: row.event_name,
    venueName: row.venue_name,
    venueAddress: null,
    venueCity: row.venue_city,
    venueCountry: row.venue_country,
    concertDate: row.concert_date,
    ticketUrl: row.ticket_url,
    songkickId: null,
    bandsintownId: null,
    status: row.status,
    createdAt: '',
    updatedAt: '',
    eventTime: row.event_time,
    eventType: row.event_type ?? 'gig',
    trailerUrl: null,
    venueLat: null,
    venueLng: null,
    venueOsmId: null,
    newsPostId: null,
    featuredArtists: featured,
  }
}

/**
 * Calendar query: all label concerts (past + upcoming) for the portal month grid.
 * Prefer `getCachedCalendarConcerts` on the portal page.
 */
export async function getAllVisibleConcertsForCalendar(db: DbClient): Promise<Concert[]> {
  const { data, error } = await db
    .from('concerts')
    .select(CALENDAR_CONCERT_SELECT)
    .order('concert_date', { ascending: true })
    .limit(PUBLIC_QUERY_LIMITS.concerts)

  if (error) throw new Error(error.message)

  const rows = (data ?? []) as unknown as CalendarConcertRow[]
  const mapped: Concert[] = []
  for (const row of rows) {
    const concert = mapCalendarConcertRow(row)
    if (concert) mapped.push(concert)
  }
  return mapped
}


