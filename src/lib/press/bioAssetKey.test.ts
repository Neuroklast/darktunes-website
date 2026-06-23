import { describe, it, expect } from 'vitest'
import { buildBioAssetKey, formatDownloadAssetLabel } from './bioAssetKey'

describe('bioAssetKey', () => {
  it('builds canonical bio asset keys', () => {
    expect(buildBioAssetKey('artist-uuid', 'de', 'short', 'txt')).toBe(
      'bio:artist-uuid:de:short:txt',
    )
  })

  it('formats bio asset keys for display', () => {
    expect(formatDownloadAssetLabel('bio:artist-uuid:en:medium:pdf')).toBe('Medium Bio (EN) — PDF')
  })

  it('falls back to filename segment for non-bio keys', () => {
    expect(formatDownloadAssetLabel('press-photos/abc/photo.jpg')).toBe('photo.jpg')
  })
})