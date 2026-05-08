import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { Concert } from '@/types'

type DbClient = SupabaseClient<Database>
type ConcertRow = Database['public']['Tables']['concerts']['Row']

export type ConcertInsert = Database['public']['Tables']['concerts']['Insert']
export type ConcertUpdate = Database['public']['Tables']['concerts']['Update']

function rowToConcert(row: ConcertRow): Concert {
  return {
    id: row.id,
    artistId: row.artist_id ?? null,
    artistName: row.artist_name,
    eventName: row.event_name,
    venueName: row.venue_name ?? undefined,
    city: row.city ?? undefined,
    country: row.country ?? undefined,
    eventDate: row.event_date,
    ticketUrl: row.ticket_url ?? undefined,
    songkickId: row.songkick_id ?? undefined,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function getConcerts(
  db: DbClient,
  artistId?: string,
): Promise<Concert[]> {
  let query = db
    .from('concerts')
    .select('*')
    .order('event_date', { ascending: true })

  if (artistId) {
    query = query.eq('artist_id', artistId)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []).map(rowToConcert)
}

export async function upsertConcert(
  db: DbClient,
  concertData: ConcertInsert,
): Promise<Concert> {
  const { data, error } = await db
    .from('concerts')
    .upsert(concertData, { onConflict: 'songkick_id' })
    .select()
    .single()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('No data returned from upsertConcert')
  return rowToConcert(data)
}

export async function deleteConcert(db: DbClient, id: string): Promise<void> {
  const { error } = await db.from('concerts').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
