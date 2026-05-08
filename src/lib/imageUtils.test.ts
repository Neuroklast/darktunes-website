import { describe, it, expect } from 'vitest'
import { getOptimizedImageUrl, getSquareThumbnail } from './imageUtils'

const R2_URL = 'https://cdn.darktunes.com/artists/czarina.jpg'

describe('getOptimizedImageUrl', () => {
  it('returns a wsrv.nl URL with the encoded source and the requested width', () => {
    const result = getOptimizedImageUrl(R2_URL, 800)
    expect(result).toBe(
      `https://wsrv.nl/?url=${encodeURIComponent(R2_URL)}&w=800&output=webp`,
    )
  })

  it('returns an empty string when sourceUrl is empty', () => {
    expect(getOptimizedImageUrl('', 800)).toBe('')
  })

  it('encodes URLs that contain query parameters', () => {
    const url = 'https://cdn.darktunes.com/img?v=1&size=600'
    const result = getOptimizedImageUrl(url, 400)
    expect(result).toContain(encodeURIComponent(url))
    expect(result).toContain('&w=400')
  })

  it('always requests webp output format', () => {
    const result = getOptimizedImageUrl(R2_URL, 300)
    expect(result).toContain('output=webp')
  })
})

describe('getSquareThumbnail', () => {
  it('returns a wsrv.nl URL with cover fit and equal width/height', () => {
    const result = getSquareThumbnail(R2_URL, 200)
    expect(result).toContain('&w=200&h=200')
    expect(result).toContain('fit=cover')
    expect(result).toContain('output=webp')
  })

  it('defaults to 200 × 200 when no size is given', () => {
    const result = getSquareThumbnail(R2_URL)
    expect(result).toContain('&w=200&h=200')
  })

  it('returns an empty string when sourceUrl is empty', () => {
    expect(getSquareThumbnail('')).toBe('')
  })
})
