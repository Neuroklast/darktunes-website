import { ASSET_OPTIMIZE_BATCH } from '@/lib/r2/constants'
import type { AssetOptimizationResult } from '@/lib/images/optimizeAssets'

async function postBatch(
  headers: HeadersInit,
  body: { cursor?: string; asset_ids?: string[] },
): Promise<AssetOptimizationResult> {
  const res = await fetch('/api/admin/asset-optimizations', {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify(body),
  })
  const json = (await res.json()) as AssetOptimizationResult & { error?: string }
  if (!res.ok) throw new Error(json.error ?? 'Failed to optimize catalog images')
  return json
}

export async function drainAssetOptimizations(options: {
  headers: HeadersInit
  assetIds?: string[]
}): Promise<{ processed: number; skipped: number; bytes_saved: number }> {
  let processed = 0
  let skipped = 0
  let bytesSaved = 0

  if (options.assetIds && options.assetIds.length > 0) {
    for (let offset = 0; offset < options.assetIds.length; offset += ASSET_OPTIMIZE_BATCH) {
      const chunk = options.assetIds.slice(offset, offset + ASSET_OPTIMIZE_BATCH)
      const batch = await postBatch(options.headers, { asset_ids: chunk })
      processed += batch.processed
      skipped += batch.skipped
      bytesSaved += batch.bytes_saved
    }
    return { processed, skipped, bytes_saved: bytesSaved }
  }

  let cursor: string | null = null
  for (;;) {
    const batch = await postBatch(options.headers, cursor ? { cursor } : {})
    processed += batch.processed
    skipped += batch.skipped
    bytesSaved += batch.bytes_saved
    if (!batch.truncated || !batch.next_cursor) break
    cursor = batch.next_cursor
  }
  return { processed, skipped, bytes_saved: bytesSaved }
}
