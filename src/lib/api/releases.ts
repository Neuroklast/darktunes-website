import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { Release } from '@/types'
import { parseJunctionRows } from '@/lib/types/jsonColumns'
import { stripEmojis } from '@/lib/stripEmojis'
import { sanitizeReleaseWrite } from '@/lib/sanitizeTextContent'
import {
  findCrossSourceMergeTarget,
  registerSyncedRelease,
  type CrossSourceReleaseRow,
  type ExternalReleaseSource,
} from '@/lib/sync/deduplication'

type DbClient = SupabaseClient<Database>
type ReleaseRow = Database['public']['Tables']['releases']['Row']
export type ReleaseInsert = Database['public']['Tables']['releases']['Insert']
export type ReleaseUpdate = Database['public']['Tables']['releases']['Update']

/**
 * Maximum number of UUIDs to include in a single `.in()` filter.
 * Each UUID is 36 chars + separators; keeping batches at 50 keeps the
 * generated query-string well under typical URL-length limits (~2 KB).
 */
const RELEASE_ARTISTS_BATCH_SIZE = 50

export function rowToRelease(row: ReleaseRow): Release {
  return {
    id: row.id,
    title: stripEmojis(row.title),
    artistId: row.artist_id ?? '',
    artistName: '',
    releaseDate: row.release_date,
    coverArt: row.cover_art ?? '',
    type: row.type,
    spotifyUrl: row.spotify_url ?? undefined,
    appleMusicUrl: row.apple_music_url ?? undefined,
    youtubeUrl: row.youtube_url ?? undefined,
    bandcampUrl: row.bandcamp_url ?? undefined,
    smartlinkUrl: row.smartlink_url ?? undefined,
    featured: row.featured,
    featuredUntil: row.featured_until ?? undefined,
    featuredRemovedReason: (row.featured_removed_reason as Release['featuredRemovedReason']) ?? undefined,
    itunesId: row.itunes_id ?? undefined,
    spotifyId: row.spotify_id ?? undefined,
    discogsId: row.discogs_id ?? undefined,
    isrc: row.isrc ?? undefined,
    barcode: row.barcode ?? undefined,
    catalogNumber: row.catalog_number ?? undefined,
    previewUrl: row.preview_url ?? undefined,
    smartUrl: row.smart_url ?? undefined,
    platformLinks: row.platform_links ?? undefined,
    popularity: row.popularity ?? undefined,
    isVisible: row.is_visible,
    isPromo: row.is_promo,
    promoText: row.promo_text ? stripEmojis(row.promo_text) : undefined,
    heroBgUrl: row.hero_bg_url ?? undefined,
    heroPrimaryBtn: (row.hero_primary_btn_action || row.hero_primary_btn_label || row.hero_primary_btn_href)
      ? {
          label: row.hero_primary_btn_label ?? undefined,
          action: (row.hero_primary_btn_action as 'link' | 'scroll' | 'none') ?? undefined,
          href: row.hero_primary_btn_href ?? undefined,
        }
      : undefined,
    heroSecondaryBtn: (row.hero_secondary_btn_action || row.hero_secondary_btn_label || row.hero_secondary_btn_href)
      ? {
          label: row.hero_secondary_btn_label ?? undefined,
          action: (row.hero_secondary_btn_action as 'link' | 'scroll' | 'none') ?? undefined,
          href: row.hero_secondary_btn_href ?? undefined,
        }
      : undefined,
    guestArtists: row.guest_artists ? stripEmojis(row.guest_artists) : undefined,
  }
}

/**
 * Attach the full artist list from the release_artists junction table.
 *
 * IDs are sent in batches of RELEASE_ARTISTS_BATCH_SIZE to avoid generating
 * URLs that exceed browser / PostgREST limits when many releases are loaded
 * at once (e.g. the admin Releases Manager).
 */
async function attachReleaseArtists(db: DbClient, releases: Release[]): Promise<Release[]> {
  if (releases.length === 0) return releases
  const ids = releases.map((r) => r.id)

  // Split IDs into fixed-size batches and fetch each one sequentially.
  const allRows: ReturnType<typeof parseJunctionRows<'release_id'>> = []
  for (let i = 0; i < ids.length; i += RELEASE_ARTISTS_BATCH_SIZE) {
    const batch = ids.slice(i, i + RELEASE_ARTISTS_BATCH_SIZE)
    const { data, error } = await (db as DbClient)
      .from('release_artists' as const)
      .select('release_id, sort_order, artists(id, name, slug)')
      .in('release_id', batch)
      .order('sort_order', { ascending: true })

    if (error) {
      // Gracefully degrade when the junction table doesn't exist yet (e.g. schema
      // migration hasn't run) so that SSG/ISR prerendering is never blocked.
      // byRelease remains empty → all releases fall through to the legacy artist_id fallback below.
      console.warn(`release_artists lookup skipped: ${error.message}`)
      break
    }

    allRows.push(...parseJunctionRows(data, 'release_id'))
  }

  const byRelease = new Map<string, { id: string; name: string; slug: string }[]>()
  for (const row of allRows) {
    if (!row.artists) continue
    if (!byRelease.has(row.release_id)) byRelease.set(row.release_id, [])
    byRelease.get(row.release_id)!.push(row.artists)
  }

  // Releases that have no junction-table entry but do have a legacy artist_id
  // (e.g. created by the iTunes sync) need a direct artist lookup as a fallback.
  const missingArtistIds = releases
    .filter((r) => !byRelease.has(r.id) && r.artistId)
    .map((r) => r.artistId as string)
    .filter((id, i, arr) => arr.indexOf(id) === i) // deduplicate

  let artistMap = new Map<string, { id: string; name: string; slug: string }>()
  if (missingArtistIds.length > 0) {
    const { data: artistRows } = await db
      .from('artists')
      .select('id, name, slug')
      .in('id', missingArtistIds)
    artistMap = new Map((artistRows ?? []).map((a) => [a.id, a]))
  }

  return releases.map((r) => {
    const junctionArtists = byRelease.get(r.id)
    if (junctionArtists) {
      return {
        ...r,
        artists: junctionArtists,
        artistName: junctionArtists[0]?.name ?? r.artistName,
      }
    }
    const fallback = r.artistId ? artistMap.get(r.artistId) : undefined
    return {
      ...r,
      artists: fallback ? [fallback] : undefined,
      artistName: fallback?.name ?? r.artistName,
    }
  })
}

export async function getReleasesByArtistId(db: DbClient, artistId: string): Promise<Release[]> {
  // Primary query: the legacy artist_id column (preserves error behaviour for callers)
  const { data, error } = await db
    .from('releases')
    .select('*')
    .eq('artist_id', artistId)
    .order('release_date', { ascending: false })
  if (error) throw new Error(error.message)

  const legacyReleases = (data ?? []).map(rowToRelease)
  const legacyIds = new Set(legacyReleases.map((r) => r.id))

  // Secondary: also collect releases linked via the many-to-many junction table
  const { data: junctionRows } = await (db as DbClient)
    .from('release_artists' as const)
    .select('release_id')
    .eq('artist_id', artistId)

  const extraIds = ((junctionRows ?? []) as { release_id: string }[])
    .map((r) => r.release_id)
    .filter((id) => id && !legacyIds.has(id))

  if (extraIds.length > 0) {
    const { data: extra } = await db
      .from('releases')
      .select('*')
      .in('id', extraIds)
      .order('release_date', { ascending: false })

    if (extra && extra.length > 0) {
      const merged = [
        ...legacyReleases,
        ...extra.map(rowToRelease),
      ].sort((a, b) => b.releaseDate.localeCompare(a.releaseDate))
      return attachReleaseArtists(db, merged)
    }
  }

  return attachReleaseArtists(db, legacyReleases)
}

export async function getReleases(db: DbClient): Promise<Release[]> {
  const { data, error } = await db
    .from('releases')
    .select('*')
    .order('release_date', { ascending: false })
  if (error) throw new Error(error.message)
  const releases = (data ?? []).map(rowToRelease)
  return attachReleaseArtists(db, releases)
}

export async function getPromoReleases(db: DbClient): Promise<Release[]> {
  const { data, error } = await db
    .from('releases')
    .select('*')
    .eq('is_promo', true)
    .order('release_date', { ascending: false })
  if (error) throw new Error(error.message)
  const releases = (data ?? []).map(rowToRelease)
  return attachReleaseArtists(db, releases)
}

/**
 * Public-facing query: returns only visible releases whose artist is also visible.
 * Used by the public homepage (Server Component). The admin uses getReleases instead.
 */
export async function getPublicReleases(db: DbClient): Promise<Release[]> {
  // Fetch IDs of hidden artists so we can exclude their releases
  const { data: hiddenArtistRows, error: hiddenErr } = await db
    .from('artists')
    .select('id')
    .eq('is_visible', false)
  if (hiddenErr) throw new Error(hiddenErr.message)

  const hiddenIds = (hiddenArtistRows ?? []).map((a) => a.id)

  let builder = db
    .from('releases')
    .select('*')
    .eq('is_visible', true)
    .eq('is_promo', false)
    .order('release_date', { ascending: false })

  if (hiddenIds.length > 0) {
    // Keep releases with no artist OR whose artist is not hidden
    builder = builder.or(`artist_id.is.null,artist_id.not.in.(${hiddenIds.join(',')})`)
  }

  const { data, error } = await builder
  if (error) throw new Error(error.message)
  const releases = (data ?? []).map(rowToRelease)
  return attachReleaseArtists(db, releases)
}

export async function getReleaseById(db: DbClient, id: string): Promise<Release | null> {
  const { data, error } = await db.from('releases').select('*').eq('id', id).single()
  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(error.message)
  }
  if (!data) return null
  const [release] = await attachReleaseArtists(db, [rowToRelease(data)])
  return release ?? null
}

export async function createRelease(db: DbClient, releaseData: ReleaseInsert): Promise<Release> {
  const { data, error } = await db.from('releases').insert(sanitizeReleaseWrite(releaseData)).select().single()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('No data returned from createRelease')
  return rowToRelease(data)
}

export async function updateRelease(
  db: DbClient,
  id: string,
  releaseData: ReleaseUpdate,
): Promise<Release> {
  const { data, error } = await db
    .from('releases')
    .update(sanitizeReleaseWrite(releaseData))
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('No data returned from updateRelease')
  return rowToRelease(data)
}

export async function deleteRelease(db: DbClient, id: string): Promise<void> {
  const { error } = await db.from('releases').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

/**
 * Calendar query: returns all visible, non-promo releases whose artist is also
 * visible. Includes artist names via the junction table.
 * Used by the Artist Portal Release Calendar.
 */
export async function getAllVisibleReleasesForCalendar(db: DbClient): Promise<Release[]> {
  const { data: hiddenArtistRows, error: hiddenErr } = await db
    .from('artists')
    .select('id')
    .eq('is_visible', false)
  if (hiddenErr) throw new Error(hiddenErr.message)

  const hiddenIds = (hiddenArtistRows ?? []).map((a) => a.id)

  let builder = db
    .from('releases')
    .select('*')
    .eq('is_visible', true)
    .eq('is_promo', false)
    .order('release_date', { ascending: true })

  if (hiddenIds.length > 0) {
    builder = builder.or(`artist_id.is.null,artist_id.not.in.(${hiddenIds.join(',')})`)
  }

  const { data, error } = await builder
  if (error) throw new Error(error.message)
  const releases = (data ?? []).map(rowToRelease)
  return attachReleaseArtists(db, releases)
}

const SYNC_WRITABLE_KEYS = [
  'title',
  'artist_id',
  'release_date',
  'cover_art',
  'type',
  'spotify_url',
  'spotify_id',
  'apple_music_url',
  'itunes_id',
  'discogs_id',
  'isrc',
  'barcode',
  'catalog_number',
  'popularity',
  'smart_url',
  'platform_links',
] as const satisfies readonly (keyof ReleaseInsert)[]

function pickSyncWritableFields(data: ReleaseInsert): ReleaseUpdate {
  const patch: ReleaseUpdate = {}
  for (const key of SYNC_WRITABLE_KEYS) {
    if (key in data && data[key] !== undefined) {
      ;(patch as Record<string, unknown>)[key] = data[key]
    }
  }
  return patch
}

async function preserveFeaturedByColumn(
  db: DbClient,
  column: 'itunes_id' | 'spotify_id' | 'discogs_id',
  value: string | null | undefined,
  fallback: boolean,
): Promise<boolean> {
  if (!value) return fallback

  const { data: existing, error } = await db
    .from('releases')
    .select('id, featured')
    .eq(column, value)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return existing?.featured ?? fallback
}

export async function upsertReleaseByItunesId(
  db: DbClient,
  releaseData: ReleaseInsert,
): Promise<Release> {
  const featured = await preserveFeaturedByColumn(
    db,
    'itunes_id',
    releaseData.itunes_id,
    releaseData.featured ?? false,
  )

  const { data, error } = await db
    .from('releases')
    .upsert(sanitizeReleaseWrite({ ...releaseData, featured }), { onConflict: 'itunes_id' })
    .select()
    .single()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('No data returned from upsertReleaseByItunesId')
  return rowToRelease(data)
}

export async function upsertReleaseBySpotifyId(
  db: DbClient,
  releaseData: ReleaseInsert,
): Promise<Release> {
  if (!releaseData.spotify_id) {
    throw new Error('upsertReleaseBySpotifyId requires spotify_id')
  }

  const featured = await preserveFeaturedByColumn(
    db,
    'spotify_id',
    releaseData.spotify_id,
    releaseData.featured ?? false,
  )

  const { data, error } = await db
    .from('releases')
    .upsert(sanitizeReleaseWrite({ ...releaseData, featured }), { onConflict: 'spotify_id' })
    .select()
    .single()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('No data returned from upsertReleaseBySpotifyId')
  return rowToRelease(data)
}

export async function upsertReleaseByDiscogsId(
  db: DbClient,
  releaseData: ReleaseInsert,
): Promise<Release> {
  if (!releaseData.discogs_id) {
    throw new Error('upsertReleaseByDiscogsId requires discogs_id')
  }

  const featured = await preserveFeaturedByColumn(
    db,
    'discogs_id',
    releaseData.discogs_id,
    releaseData.featured ?? false,
  )

  const { data, error } = await db
    .from('releases')
    .upsert(sanitizeReleaseWrite({ ...releaseData, featured }), { onConflict: 'discogs_id' })
    .select()
    .single()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('No data returned from upsertReleaseByDiscogsId')
  return rowToRelease(data)
}

export interface SyncReleaseResult {
  release: Release
  merged: boolean
}

function releaseRowFromInsert(
  release: Release,
  sanitized: ReleaseInsert,
): Parameters<typeof registerSyncedRelease>[1] {
  return {
    id: release.id,
    title: release.title,
    release_date: release.releaseDate,
    spotify_id: sanitized.spotify_id ?? release.spotifyId ?? null,
    itunes_id: sanitized.itunes_id ?? release.itunesId ?? null,
    discogs_id: sanitized.discogs_id ?? release.discogsId ?? null,
    isrc: sanitized.isrc ?? release.isrc ?? null,
    barcode: sanitized.barcode ?? release.barcode ?? null,
  }
}

function finishSyncRelease(
  existingReleases: CrossSourceReleaseRow[],
  release: Release,
  sanitized: ReleaseInsert,
  merged: boolean,
): SyncReleaseResult {
  registerSyncedRelease(existingReleases, releaseRowFromInsert(release, sanitized), merged)
  return { release, merged }
}

/**
 * Upserts or merges a release from an external API source.
 * Manual rows are enriched in-place; featured and visibility flags are preserved.
 */
export async function syncReleaseFromExternalSource(
  db: DbClient,
  source: ExternalReleaseSource,
  releaseData: ReleaseInsert,
  existingReleases: CrossSourceReleaseRow[],
): Promise<SyncReleaseResult> {
  const sanitized = sanitizeReleaseWrite(releaseData)

  if (source === 'itunes') {
    const mergeTarget = findCrossSourceMergeTarget(
      existingReleases,
      {
        title: sanitized.title,
        releaseDate: sanitized.release_date,
        isrc: sanitized.isrc,
        barcode: sanitized.barcode,
      },
      'itunes',
    )

    if (mergeTarget) {
      const patch = pickSyncWritableFields(sanitized)
      const { data, error } = await db
        .from('releases')
        .update(patch)
        .eq('id', mergeTarget.id)
        .select()
        .single()

      if (error) throw new Error(error.message)
      if (!data) throw new Error('No data returned from iTunes merge update')

      return finishSyncRelease(existingReleases, rowToRelease(data), sanitized, true)
    }

    if (sanitized.itunes_id) {
      const release = await upsertReleaseByItunesId(db, sanitized)
      return finishSyncRelease(existingReleases, release, sanitized, false)
    }

    throw new Error('iTunes sync requires itunes_id when no merge target exists')
  }

  if (source === 'spotify' && sanitized.spotify_id) {
    const mergeTarget = findCrossSourceMergeTarget(
      existingReleases,
      {
        title: sanitized.title,
        releaseDate: sanitized.release_date,
        isrc: sanitized.isrc,
        barcode: sanitized.barcode,
      },
      'spotify',
    )

    if (mergeTarget && mergeTarget.id) {
      const patch = pickSyncWritableFields(sanitized)
      const { data, error } = await db
        .from('releases')
        .update(patch)
        .eq('id', mergeTarget.id)
        .select()
        .single()

      if (error) throw new Error(error.message)
      if (!data) throw new Error('No data returned from Spotify merge update')

      return finishSyncRelease(existingReleases, rowToRelease(data), sanitized, true)
    }

    const release = await upsertReleaseBySpotifyId(db, sanitized)
    return finishSyncRelease(existingReleases, release, sanitized, false)
  }

  if (source === 'discogs' && sanitized.discogs_id) {
    const mergeTarget = findCrossSourceMergeTarget(
      existingReleases,
      {
        title: sanitized.title,
        releaseDate: sanitized.release_date,
        isrc: sanitized.isrc,
        barcode: sanitized.barcode,
      },
      'discogs',
    )

    if (mergeTarget && mergeTarget.id) {
      const patch = pickSyncWritableFields(sanitized)
      const { data, error } = await db
        .from('releases')
        .update(patch)
        .eq('id', mergeTarget.id)
        .select()
        .single()

      if (error) throw new Error(error.message)
      if (!data) throw new Error('No data returned from Discogs merge update')

      return finishSyncRelease(existingReleases, rowToRelease(data), sanitized, true)
    }

    const release = await upsertReleaseByDiscogsId(db, sanitized)
    return finishSyncRelease(existingReleases, release, sanitized, false)
  }

  const mergeTarget = findCrossSourceMergeTarget(
    existingReleases,
    {
      title: sanitized.title,
      releaseDate: sanitized.release_date,
      isrc: sanitized.isrc,
      barcode: sanitized.barcode,
    },
    source,
  )

  if (mergeTarget) {
    const patch = pickSyncWritableFields(sanitized)
    const { data, error } = await db
      .from('releases')
      .update(patch)
      .eq('id', mergeTarget.id)
      .select()
      .single()

    if (error) throw new Error(error.message)
    if (!data) throw new Error('No data returned from cross-source merge update')
    return finishSyncRelease(existingReleases, rowToRelease(data), sanitized, true)
  }

  const { data, error } = await db.from('releases').insert(sanitized).select().single()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('No data returned from release insert')
  return finishSyncRelease(existingReleases, rowToRelease(data), sanitized, false)
}
