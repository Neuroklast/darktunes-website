import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { cacheReleaseCoverArt, isAlreadyCachedCoverUrl } from './coverArtUpload'

describe('isAlreadyCachedCoverUrl', () => {
  it('treats label CDN, r2.dev, and R2 API hosts as already cached', () => {
    expect(isAlreadyCachedCoverUrl('https://cdn.darktunes.com/cover-art/abc.jpg')).toBe(true)
    expect(isAlreadyCachedCoverUrl('https://pub-123.r2.dev/cover-art/abc.jpg')).toBe(true)
    expect(isAlreadyCachedCoverUrl('https://acct.r2.cloudflarestorage.com/cover-art/abc.jpg')).toBe(
      true,
    )
    expect(isAlreadyCachedCoverUrl('https://i.scdn.co/image/abc')).toBe(false)
    expect(isAlreadyCachedCoverUrl('https://is1-ssl.mzstatic.com/image/thumb/x/100x100.jpg')).toBe(
      false,
    )
    expect(isAlreadyCachedCoverUrl(null)).toBe(false)
  })
})

describe('cacheReleaseCoverArt', () => {
  it('skips download when the release already has a cached CDN cover', async () => {
    const errors: string[] = []
    const db = { from: vi.fn() } as unknown as SupabaseClient<Database>
    const uploadToR2 = vi.fn().mockResolvedValue('https://cdn.darktunes.com/cover-art/new.jpg')

    await cacheReleaseCoverArt(
      db,
      uploadToR2,
      'rel-1',
      'Nightfall',
      'https://i.scdn.co/image/abc',
      errors,
      'https://cdn.darktunes.com/cover-art/existing.jpg',
    )

    expect(uploadToR2).not.toHaveBeenCalled()
    expect(db.from).not.toHaveBeenCalled()
    expect(errors).toEqual([])
  })

  it('records upload failures instead of swallowing them', async () => {
    const errors: string[] = []
    const db = {
      from: vi.fn(),
    } as unknown as SupabaseClient<Database>
    const uploadToR2 = vi.fn().mockRejectedValue(new Error('R2 EBUSY'))

    await cacheReleaseCoverArt(
      db,
      uploadToR2,
      'rel-1',
      'Nightfall',
      'https://i.scdn.co/image/abc',
      errors,
    )

    expect(errors.some((e) => e.includes('Cover art upload failed') && e.includes('Nightfall'))).toBe(
      true,
    )
    expect(db.from).not.toHaveBeenCalled()
  })
})
