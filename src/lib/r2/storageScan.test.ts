import { describe, expect, it } from 'vitest'
import { isOrphanObject } from '@/lib/r2/storageScan'
import { confirmationMatches } from '@/lib/r2/orphanPurge'
import { R2_ORPHAN_GRACE_MS, R2_ORPHAN_PURGE_CONFIRMATION } from '@/lib/r2/constants'

describe('isOrphanObject', () => {
  it('never flags referenced keys', () => {
    expect(
      isOrphanObject(
        { key: 'uploads/a.jpg', sizeBytes: 10, lastModified: new Date(0) },
        new Set(['uploads/a.jpg']),
        Date.now(),
      ),
    ).toBe(false)
  })

  it('protects objects inside the grace window', () => {
    const now = 1_000_000
    expect(
      isOrphanObject(
        { key: 'uploads/new.jpg', sizeBytes: 10, lastModified: new Date(now - 60_000) },
        new Set(),
        now,
      ),
    ).toBe(false)
  })

  it('flags old unreferenced objects', () => {
    const now = R2_ORPHAN_GRACE_MS + 50_000
    expect(
      isOrphanObject(
        { key: 'uploads/old.jpg', sizeBytes: 10, lastModified: new Date(0) },
        new Set(),
        now,
      ),
    ).toBe(true)
  })
})

describe('confirmationMatches', () => {
  it('requires the exact phrase', () => {
    expect(confirmationMatches(R2_ORPHAN_PURGE_CONFIRMATION)).toBe(true)
    expect(confirmationMatches('delete orphans')).toBe(false)
  })
})
