import type { S3Client } from '@aws-sdk/client-s3'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { deleteObjectFromR2 } from '@/lib/r2Utils'
import { R2_DELETE_BATCH, R2_ORPHAN_GRACE_MS, R2_ORPHAN_PURGE_CONFIRMATION } from '@/lib/r2/constants'
import { isOlderThan } from '@/lib/r2/keys'
import { collectReferencedKeys } from '@/lib/r2/referencedKeys'
import { getLatestStorageSnapshot } from '@/lib/r2/storageScan'

type ServiceDb = SupabaseClient<Database>

export function confirmationMatches(value: unknown): boolean {
  return typeof value === 'string' && value.trim() === R2_ORPHAN_PURGE_CONFIRMATION
}

export async function purgeOrphanObjects(options: {
  db: ServiceDb
  s3: S3Client
  bucket: string
  publicUrl: string
  now?: number
}): Promise<{ deleted: number; skipped: number; remaining: number }> {
  const now = options.now ?? Date.now()
  const snapshot = await getLatestStorageSnapshot(options.db)
  if (!snapshot || snapshot.status !== 'completed') {
    throw new Error('No completed storage scan')
  }

  const referenced = await collectReferencedKeys(options.db, options.publicUrl)
  const { data, error } = await options.db
    .from('r2_orphan_objects')
    .select('id, object_key, last_modified')
    .eq('snapshot_id', snapshot.id)
    .order('object_key', { ascending: true })
    .limit(R2_DELETE_BATCH)
  if (error) throw new Error(error.message)

  const rows = data ?? []
  let deleted = 0
  let skipped = 0
  const removedIds: string[] = []

  for (const row of rows) {
    const lastModified = row.last_modified ? new Date(row.last_modified) : null
    if (referenced.has(row.object_key) || !isOlderThan(lastModified, R2_ORPHAN_GRACE_MS, now)) {
      skipped += 1
      removedIds.push(row.id)
      continue
    }
    await deleteObjectFromR2(row.object_key, options.s3, options.bucket)
    deleted += 1
    removedIds.push(row.id)
  }

  if (removedIds.length > 0) {
    const { error: deleteError } = await options.db.from('r2_orphan_objects').delete().in('id', removedIds)
    if (deleteError) throw new Error(deleteError.message)
  }

  const { count, error: countError } = await options.db
    .from('r2_orphan_objects')
    .select('*', { count: 'exact', head: true })
    .eq('snapshot_id', snapshot.id)
  if (countError) throw new Error(countError.message)

  const remaining = count ?? 0
  await options.db
    .from('r2_storage_snapshots')
    .update({
      orphan_count: remaining,
    })
    .eq('id', snapshot.id)

  return { deleted, skipped, remaining }
}
