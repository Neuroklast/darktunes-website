import { createHash } from 'crypto'
import type { S3Client } from '@aws-sdk/client-s3'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { downloadObjectBufferFromR2, putObjectToR2 } from '@/lib/r2Utils'
import { ASSET_OPTIMIZE_BATCH, ASSET_OPTIMIZE_BUDGET_MS } from '@/lib/r2/constants'
import { optimizeImage } from '@/lib/images/optimizeImage'

type ServiceDb = SupabaseClient<Database>

export interface AssetOptimizationResult {
  processed: number
  skipped: number
  bytes_saved: number
  next_cursor: string | null
  truncated: boolean
}

function sha256Hex(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}

export async function optimizeCatalogAssets(options: {
  db: ServiceDb
  s3: S3Client
  bucket: string
  cursor?: string | null
  assetIds?: string[]
}): Promise<AssetOptimizationResult> {
  const deadline = Date.now() + ASSET_OPTIMIZE_BUDGET_MS
  let query = options.db
    .from('assets')
    .select('id, r2_key, mime_type, size_bytes, filename, original_filename, is_press_approved, original_size_bytes')
    .like('mime_type', 'image/%')
    .order('id', { ascending: true })
    .limit(ASSET_OPTIMIZE_BATCH)

  if (options.assetIds && options.assetIds.length > 0) {
    query = query.in('id', options.assetIds)
  } else {
    query = query.is('optimized_at', null)
    if (options.cursor) {
      query = query.gt('id', options.cursor)
    }
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  const rows = data ?? []

  let processed = 0
  let skipped = 0
  let bytesSaved = 0
  let lastId: string | null = null
  let truncated = false

  for (const row of rows) {
    if (Date.now() >= deadline) {
      truncated = true
      break
    }
    lastId = row.id
    try {
      const original = Buffer.from(await downloadObjectBufferFromR2(row.r2_key, options.s3, options.bucket))
      const result = await optimizeImage({
        buffer: original,
        mimeType: row.mime_type,
        filename: row.filename,
        pressApproved: row.is_press_approved,
      })
      if (result.skipped) {
        await options.db
          .from('assets')
          .update({ optimized_at: new Date().toISOString() })
          .eq('id', row.id)
        skipped += 1
        continue
      }

      await putObjectToR2(options.s3, options.bucket, row.r2_key, result.buffer, result.mimeType)
      const saved = Math.max(0, original.length - result.buffer.length)
      bytesSaved += saved
      await options.db
        .from('assets')
        .update({
          mime_type: result.mimeType,
          size_bytes: result.buffer.length,
          filename: result.filename,
          sha256_hash: sha256Hex(result.buffer),
          original_size_bytes: row.original_size_bytes ?? row.size_bytes,
          optimized_at: new Date().toISOString(),
        })
        .eq('id', row.id)
      processed += 1
    } catch {
      skipped += 1
    }
  }

  const nextCursor =
    options.assetIds && options.assetIds.length > 0
      ? null
      : rows.length === ASSET_OPTIMIZE_BATCH || truncated
        ? lastId
        : null
  return {
    processed,
    skipped,
    bytes_saved: bytesSaved,
    next_cursor: nextCursor,
    truncated: nextCursor != null,
  }
}
