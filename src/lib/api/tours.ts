import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/types/database'
import type { Tour } from '@/types'
import type { TourPlannerSettings } from '@/lib/tour-planner/types'
import { DEFAULT_TOUR_PLANNER_SETTINGS } from '@/lib/tour-planner/types'
import type { RouteResult, TechDocument, TourBudget } from '@/lib/tour-planner/types'
import { EMPTY_TOUR_BUDGET } from '@/lib/tour-planner/types'
import { getCollaboratorTourIds, getTourCollaborators } from '@/lib/api/tourCollaborators'
import { getTourArtistFinance, upsertTourArtistFinance } from '@/lib/api/tourArtistFinance'
import { getPerformingArtistIdsByStopIds } from '@/lib/api/tourStopPerformingArtists'
import { getStopPrivateData } from '@/lib/api/tourStopPrivate'
import type { TourAccessRole } from '@/lib/api/tourAccess'
import { DEFAULT_ORGANIZATION_ID } from '@/lib/organizations/constants'

type DbClient = SupabaseClient<Database>
type TourRow = Database['public']['Tables']['tours']['Row']
export type TourInsert = Database['public']['Tables']['tours']['Insert']
export type TourUpdate = Database['public']['Tables']['tours']['Update']

function parseSettings(raw: Json): TourPlannerSettings {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return DEFAULT_TOUR_PLANNER_SETTINGS
  }
  return { ...DEFAULT_TOUR_PLANNER_SETTINGS, ...(raw as unknown as TourPlannerSettings) }
}

function parseBudget(raw: Json | null): TourBudget | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const candidate = raw as unknown as TourBudget
  if (!Array.isArray(candidate.lines)) return EMPTY_TOUR_BUDGET
  return candidate
}

function rowToTour(row: TourRow): Tour {
  return {
    id: row.id,
    artistId: row.artist_id,
    name: row.name,
    description: row.description,
    startDate: row.start_date,
    endDate: row.end_date,
    archived: row.archived,
    sortOrder: row.sort_order,
    settings: parseSettings(row.settings),
    routeCache: (row.route_cache as RouteResult | null) ?? null,
    budget: parseBudget(row.budget),
    techDocuments: (row.tech_documents as unknown as TechDocument[]) ?? [],
    currency: row.currency,
    totalBudget: row.total_budget !== null ? Number(row.total_budget) : null,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function enrichTourForViewer(
  db: DbClient,
  tour: Tour,
  viewingArtistId: string,
  accessRole: TourAccessRole,
): Promise<Tour> {
  const collaborators = await getTourCollaborators(db, tour.id)
  let ownerArtistName: string | null = null
  if (accessRole === 'collaborator') {
    const { data } = await db.from('artists').select('name').eq('id', tour.artistId).maybeSingle()
    ownerArtistName = data?.name ?? null
  }

  const finance = await getTourArtistFinance(db, tour.id, viewingArtistId)
  const isOwner = tour.artistId === viewingArtistId

  return {
    ...tour,
    budget: finance?.budget ?? (isOwner ? tour.budget : null),
    totalBudget: finance?.totalBudget ?? (isOwner ? tour.totalBudget : null),
    currency: finance?.currency ?? tour.currency,
    accessRole,
    collaborators: collaborators.map((c) => ({
      artistId: c.artistId,
      artistName: c.artistName,
      artistSlug: c.artistSlug,
    })),
    ownerArtistName,
  }
}

export async function getToursByArtistId(db: DbClient, artistId: string, includeArchived = false): Promise<Tour[]> {
  const collaboratorTourIds = await getCollaboratorTourIds(db, artistId)

  let ownedQuery = db
    .from('tours')
    .select('*')
    .eq('artist_id', artistId)

  if (!includeArchived) {
    ownedQuery = ownedQuery.eq('archived', false)
  }

  const { data: owned, error: ownedError } = await ownedQuery
  if (ownedError) throw new Error(ownedError.message)

  let collaboratorRows: TourRow[] = []
  if (collaboratorTourIds.length > 0) {
    let collabQuery = db.from('tours').select('*').in('id', collaboratorTourIds)
    if (!includeArchived) {
      collabQuery = collabQuery.eq('archived', false)
    }
    const { data, error } = await collabQuery
    if (error) throw new Error(error.message)
    collaboratorRows = data ?? []
  }

  const merged = new Map<string, TourRow>()
  for (const row of owned ?? []) merged.set(row.id, row)
  for (const row of collaboratorRows) merged.set(row.id, row)

  const tours = [...merged.values()]
    .map(rowToTour)
    .sort((a, b) => a.sortOrder - b.sortOrder || b.createdAt.localeCompare(a.createdAt))

  return Promise.all(
    tours.map((tour) =>
      enrichTourForViewer(
        db,
        tour,
        artistId,
        tour.artistId === artistId ? 'owner' : 'collaborator',
      ),
    ),
  )
}

export async function getTourById(db: DbClient, tourId: string): Promise<Tour | null> {
  const { data, error } = await db.from('tours').select('*').eq('id', tourId).maybeSingle()
  if (error) throw new Error(error.message)
  return data ? rowToTour(data) : null
}

/**
 * Load a tour only if its owning artist belongs to the organization.
 * Tours have no organization_id column — isolation is via artists.
 */
export async function getTourByIdForOrganization(
  db: DbClient,
  tourId: string,
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<Tour | null> {
  const tour = await getTourById(db, tourId)
  if (!tour) return null

  const { data: artist, error } = await db
    .from('artists')
    .select('id, organization_id')
    .eq('id', tour.artistId)
    .maybeSingle()

  if (error) {
    // Pre-schema: allow tour without org check
    return tour
  }
  if (!artist) return null
  if (artist.organization_id && artist.organization_id !== organizationId) {
    return null
  }
  return tour
}

/**
 * Admin-style tour list for all artists in an organization.
 */
export async function listToursForOrganization(
  db: DbClient,
  organizationId: string = DEFAULT_ORGANIZATION_ID,
  includeArchived = false,
): Promise<Tour[]> {
  const { data: orgArtists, error: artistsError } = await db
    .from('artists')
    .select('id')
    .eq('organization_id', organizationId)

  if (artistsError) {
    // Fallback unscoped if column missing
    let query = db.from('tours').select('*')
    if (!includeArchived) query = query.eq('archived', false)
    const { data, error } = await query.order('sort_order', { ascending: true })
    if (error) throw new Error(error.message)
    return (data ?? []).map(rowToTour)
  }

  const artistIds = (orgArtists ?? []).map((a) => a.id)
  if (artistIds.length === 0) return []

  let query = db.from('tours').select('*').in('artist_id', artistIds)
  if (!includeArchived) {
    query = query.eq('archived', false)
  }
  const { data, error } = await query.order('sort_order', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []).map(rowToTour)
}

export async function createTour(db: DbClient, data: TourInsert): Promise<Tour> {
  const { data: row, error } = await db.from('tours').insert(data).select('*').single()
  if (error) throw new Error(error.message)
  if (!row) throw new Error('No data returned from createTour')
  return rowToTour(row)
}

export async function updateTour(db: DbClient, id: string, data: TourUpdate): Promise<Tour> {
  const { data: row, error } = await db.from('tours').update(data).eq('id', id).select('*').single()
  if (error) throw new Error(error.message)
  if (!row) throw new Error('No data returned from updateTour')
  return rowToTour(row)
}

export async function deleteTour(db: DbClient, id: string): Promise<void> {
  const { error } = await db.from('tours').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function duplicateTour(db: DbClient, tourId: string, userId: string): Promise<Tour> {
  const source = await getTourById(db, tourId)
  if (!source) throw new Error('Tour not found')

  const copy = await createTour(db, {
    artist_id: source.artistId,
    name: `${source.name} (Copy)`,
    description: source.description,
    start_date: source.startDate,
    end_date: source.endDate,
    settings: source.settings as unknown as Json,
    route_cache: source.routeCache as unknown as Json,
    budget: source.budget as Json,
    tech_documents: source.techDocuments as unknown as Json,
    currency: source.currency,
    total_budget: source.totalBudget,
    created_by: userId,
  })

  const { data: stops, error: stopsError } = await db
    .from('tour_stops')
    .select('*')
    .eq('tour_id', tourId)
    .order('sort_order', { ascending: true })

  if (stopsError) throw new Error(stopsError.message)

  const ownerFinance = await getTourArtistFinance(db, tourId, source.artistId)
  if (ownerFinance) {
    await upsertTourArtistFinance(db, copy.id, source.artistId, {
      budget: ownerFinance.budget,
      totalBudget: ownerFinance.totalBudget,
      currency: ownerFinance.currency,
    })
  }

  if (stops?.length) {
    const stopIds = stops.map((s) => s.id)
    const performingMap = await getPerformingArtistIdsByStopIds(db, stopIds)

    const { data: inserted, error: insertError } = await db.from('tour_stops').insert(
      stops.map((stop) => ({
        tour_id: copy.id,
        artist_id: stop.artist_id,
        sort_order: stop.sort_order,
        stop_date: stop.stop_date,
        is_travel_day: stop.is_travel_day,
        venue_name: stop.venue_name,
        venue_address: stop.venue_address,
        venue_city: stop.venue_city,
        venue_country: stop.venue_country,
        venue_lat: stop.venue_lat,
        venue_lng: stop.venue_lng,
        venue_validated: stop.venue_validated,
        hotel_name: stop.hotel_name,
        hotel_address: stop.hotel_address,
        hotel_city: stop.hotel_city,
        hotel_country: stop.hotel_country,
        hotel_lat: stop.hotel_lat,
        hotel_lng: stop.hotel_lng,
        hotel_validated: stop.hotel_validated,
        arrival_time: stop.arrival_time,
        show_status: stop.show_status,
        day_schedule: stop.day_schedule,
        per_diems: stop.per_diems,
        rooming: stop.rooming,
        travel_manifest: stop.travel_manifest,
        venue_details: stop.venue_details,
        venue_contact_info: stop.venue_contact_info,
        guest_list: stop.guest_list,
        guest_list_limit: stop.guest_list_limit,
        external_guest_notes: stop.external_guest_notes,
      })),
    ).select('id, sort_order')
    if (insertError) throw new Error(insertError.message)

    for (let i = 0; i < (inserted ?? []).length; i++) {
      const sourceStop = stops[i]
      const newStop = inserted![i]
      const performingIds = performingMap.get(sourceStop.id) ?? []
      if (performingIds.length > 0) {
        const { error } = await db.from('tour_stop_performing_artists').insert(
          performingIds.map((artistId) => ({ stop_id: newStop.id, artist_id: artistId })),
        )
        if (error) throw new Error(error.message)
      }

      const privateData = await getStopPrivateData(db, sourceStop.id, source.artistId)
      if (privateData) {
        const { error } = await db.from('tour_stop_artist_private').insert({
          stop_id: newStop.id,
          artist_id: source.artistId,
          deal: privateData.deal as Json,
          settlement: privateData.settlement as Json,
          private_notes: privateData.privateNotes,
          version: 1,
        })
        if (error) throw new Error(error.message)
      }
    }
  }

  return copy
}