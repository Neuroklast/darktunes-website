import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { cacheReleaseCoverArt } from './coverArtUpload'

describe('cacheReleaseCoverArt', () => {
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
