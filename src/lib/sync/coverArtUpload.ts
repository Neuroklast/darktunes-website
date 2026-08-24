import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

type DbClient = SupabaseClient<Database>

/** True when the URL already points at our object storage (no re-download). */
export function isAlreadyCachedCoverUrl(url: string | null | undefined): boolean {
  if (!url) return false
  try {
    const host = new URL(url).hostname.toLowerCase()
    return (
      host.startsWith('cdn.') ||
      host.endsWith('.r2.dev') ||
      host.endsWith('.r2.cloudflarestorage.com')
    )
  } catch {
    return false
  }
}

/**
 * Uploads remote cover art to R2 and persists the CDN URL.
 * Failures are appended to `errors` — callers must not swallow them.
 */
export async function cacheReleaseCoverArt(
  db: DbClient,
  uploadToR2: (imageUrl: string, keyPrefix: string) => Promise<string>,
  releaseId: string,
  releaseTitle: string,
  artworkUrl: string | undefined,
  errors: string[],
  existingCoverArt?: string | null,
): Promise<void> {
  if (!artworkUrl) return
  if (isAlreadyCachedCoverUrl(artworkUrl) || isAlreadyCachedCoverUrl(existingCoverArt)) return

  try {
    const coverArt = await uploadToR2(artworkUrl, 'cover-art')
    await db.from('releases').update({ cover_art: coverArt }).eq('id', releaseId)
  } catch (uploadErr) {
    errors.push(
      `Cover art upload failed for "${releaseTitle}": ${
        uploadErr instanceof Error ? uploadErr.message : String(uploadErr)
      }`,
    )
  }
}
