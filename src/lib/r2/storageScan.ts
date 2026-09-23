import type { S3Client } from '@aws-sdk/client-s3'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Json } from '@/types/database'
import type { Database } from '@/types/database'
import {
  abortMultipartUpload,
  listIncompleteMultipartUploads,
  listR2ObjectsPage,
  type R2ObjectMeta,
} from '@/lib/r2Utils'
import {
  R2_MULTIPART_STALE_MS,
  R2_ORPHAN_GRACE_MS,
  R2_SCAN_BUDGET_MS,
} from '@/lib/r2/constants'
import { isOlderThan, objectPrefix } from '@/lib/r2/keys'
import { collectReferencedKeys } from '@/lib/r2/referencedKeys'

type ServiceDb = SupabaseClient<Database>
type SnapshotRow = Database['public']['Tables']['r2_storage_snapshots']['Row']

export interface PrefixStat {
  prefix: string
  bytes: number
  count: number
}

export interface StorageScanResult {
  snapshot: SnapshotRow
  truncated: boolean
}

function asPrefixStats(value: Json): PrefixStat[] {
  if (!Array.isArray(value)) return []
  const stats: PrefixStat[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const record = item as Record<string, unknown>
    const prefix = typeof record.prefix === 'string' ? record.prefix : null
    const bytes = typeof record.bytes === 'number' ? record.bytes : Number(record.bytes)
    const count = typeof record.count === 'number' ? record.count : Number(record.count)
    if (!prefix || !Number.isFinite(bytes) || !Number.isFinite(count)) continue
    stats.push({ prefix, bytes: Math.max(0, Math.floor(bytes)), count: Math.max(0, Math.floor(count)) })
  }
  return stats
}

function prefixesToJson(stats: Map<string, PrefixStat>): Json {
  return [...stats.values()].sort((a, b) => b.bytes - a.bytes) as unknown as Json
}

function mergePrefix(stats: Map<string, PrefixStat>, key: string, sizeBytes: number): void {
  const prefix = objectPrefix(key)
  const current = stats.get(prefix) ?? { prefix, bytes: 0, count: 0 }
  current.bytes += sizeBytes
  current.count += 1
  stats.set(prefix, current)
}

export function isOrphanObject(
  object: R2ObjectMeta,
  referenced: Set<string>,
  now = Date.now(),
): boolean {
  if (referenced.has(object.key)) return false
  return isOlderThan(object.lastModified, R2_ORPHAN_GRACE_MS, now)
}

async function abortStaleMultiparts(
  s3: S3Client,
  bucket: string,
  now = Date.now(),
): Promise<number> {
  const uploads = await listIncompleteMultipartUploads(s3, bucket)
  let aborted = 0
  for (const upload of uploads) {
    if (!isOlderThan(upload.initiated, R2_MULTIPART_STALE_MS, now)) continue
    try {
      await abortMultipartUpload(s3, bucket, upload.key, upload.uploadId)
      aborted += 1
    } catch {
      // Best-effort; remaining uploads show up on the next scan.
    }
  }
  return aborted
}

export async function getLatestStorageSnapshot(db: ServiceDb): Promise<SnapshotRow | null> {
  const { data, error } = await db
    .from('r2_storage_snapshots')
    .select('*')
    .order('scanned_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

export async function runStorageScan(options: {
  db: ServiceDb
  s3: S3Client
  bucket: string
  publicUrl: string
  actorId: string
  cursor?: string | null
  now?: number
}): Promise<StorageScanResult> {
  const now = options.now ?? Date.now()
  const deadline = now + R2_SCAN_BUDGET_MS

  let snapshot: SnapshotRow | null = null
  if (options.cursor) {
    snapshot = await getLatestStorageSnapshot(options.db)
    if (!snapshot || snapshot.status !== 'running' || snapshot.next_cursor !== options.cursor) {
      snapshot = null
    }
  }

  if (!snapshot) {
    const { data, error } = await options.db
      .from('r2_storage_snapshots')
      .insert({
        status: 'running',
        scanned_by: options.actorId,
      })
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    snapshot = data
  }

  const referenced = await collectReferencedKeys(options.db, options.publicUrl)
  const prefixStats = new Map<string, PrefixStat>()
  for (const stat of asPrefixStats(snapshot.prefixes)) {
    prefixStats.set(stat.prefix, { ...stat })
  }

  let usedBytes = snapshot.used_bytes
  let objectCount = snapshot.object_count
  let orphanBytes = snapshot.orphan_count > 0 ? snapshot.orphan_bytes : 0
  let orphanCount = snapshot.orphan_count
  let cursor = options.cursor ?? snapshot.next_cursor
  let truncated = false
  const newOrphans: Array<{
    snapshot_id: string
    object_key: string
    size_bytes: number
    last_modified: string | null
    prefix: string
  }> = []

  try {
    for (;;) {
      if (Date.now() >= deadline) {
        truncated = true
        break
      }
      const page = await listR2ObjectsPage(options.s3, options.bucket, cursor)
      for (const object of page.objects) {
        usedBytes += object.sizeBytes
        objectCount += 1
        mergePrefix(prefixStats, object.key, object.sizeBytes)
        if (isOrphanObject(object, referenced, now)) {
          orphanBytes += object.sizeBytes
          orphanCount += 1
          newOrphans.push({
            snapshot_id: snapshot.id,
            object_key: object.key,
            size_bytes: object.sizeBytes,
            last_modified: object.lastModified ? object.lastModified.toISOString() : null,
            prefix: objectPrefix(object.key),
          })
        }
      }
      cursor = page.nextCursor
      if (!cursor) break
    }

    if (newOrphans.length > 0) {
      const { error: orphanError } = await options.db.from('r2_orphan_objects').insert(newOrphans)
      if (orphanError) throw new Error(orphanError.message)
    }

    let multipartAborted = snapshot.multipart_aborted_count
    if (!truncated) {
      multipartAborted += await abortStaleMultiparts(options.s3, options.bucket, now)
    }

    const patch = {
      used_bytes: usedBytes,
      object_count: objectCount,
      orphan_bytes: orphanBytes,
      orphan_count: orphanCount,
      multipart_aborted_count: multipartAborted,
      prefixes: prefixesToJson(prefixStats),
      truncated,
      next_cursor: truncated ? cursor : null,
      status: truncated ? ('running' as const) : ('completed' as const),
      completed_at: truncated ? null : new Date().toISOString(),
      error_message: null,
    }

    const { data: updated, error: updateError } = await options.db
      .from('r2_storage_snapshots')
      .update(patch)
      .eq('id', snapshot.id)
      .select('*')
      .single()
    if (updateError) throw new Error(updateError.message)
    return { snapshot: updated, truncated }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Scan failed'
    await options.db
      .from('r2_storage_snapshots')
      .update({ status: 'failed', error_message: message, truncated: true })
      .eq('id', snapshot.id)
    throw err
  }
}

export function snapshotToResponse(snapshot: SnapshotRow) {
  return {
    id: snapshot.id,
    status: snapshot.status,
    used_bytes: snapshot.used_bytes,
    object_count: snapshot.object_count,
    orphan_bytes: snapshot.orphan_bytes,
    orphan_count: snapshot.orphan_count,
    multipart_aborted_count: snapshot.multipart_aborted_count,
    prefixes: asPrefixStats(snapshot.prefixes),
    truncated: snapshot.truncated,
    next_cursor: snapshot.next_cursor,
    scanned_at: snapshot.scanned_at,
    completed_at: snapshot.completed_at,
    error_message: snapshot.error_message,
  }
}
