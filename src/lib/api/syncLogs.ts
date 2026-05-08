import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { SyncLog } from '@/types'

type DbClient = SupabaseClient<Database>
type SyncLogRow = Database['public']['Tables']['sync_logs']['Row']
type SyncLogInsert = Database['public']['Tables']['sync_logs']['Insert']

export type { SyncLogInsert }

function rowToSyncLog(row: SyncLogRow): SyncLog {
  return {
    id: row.id,
    artistId: row.artist_id ?? null,
    triggeredBy: row.triggered_by,
    status: row.status,
    details: row.details ?? null,
    createdAt: row.created_at,
  }
}

export async function getSyncLogs(
  db: DbClient,
  artistId?: string,
  limit = 20,
): Promise<SyncLog[]> {
  let query = db
    .from('sync_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (artistId) {
    query = query.eq('artist_id', artistId)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []).map(rowToSyncLog)
}

export async function createSyncLog(
  db: DbClient,
  logData: SyncLogInsert,
): Promise<SyncLog> {
  const { data, error } = await db.from('sync_logs').insert(logData).select().single()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('No data returned from createSyncLog')
  return rowToSyncLog(data)
}

export async function updateSyncLogStatus(
  db: DbClient,
  id: string,
  status: SyncLog['status'],
  details?: Record<string, unknown>,
): Promise<SyncLog> {
  const update: Database['public']['Tables']['sync_logs']['Update'] = { status }
  if (details !== undefined) update.details = details
  const { data, error } = await db
    .from('sync_logs')
    .update(update)
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('No data returned from updateSyncLogStatus')
  return rowToSyncLog(data)
}
