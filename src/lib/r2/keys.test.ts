import { describe, expect, it } from 'vitest'
import {
  extractKeysFromText,
  extractKeysFromUnknown,
  extractR2Key,
  invoiceObjectKey,
  isOlderThan,
  objectPrefix,
} from '@/lib/r2/keys'

const CDN = 'https://cdn.example.com'

describe('extractR2Key', () => {
  it('accepts a raw key', () => {
    expect(extractR2Key('cover-art/abc.jpg', CDN)).toBe('cover-art/abc.jpg')
  })

  it('strips the CDN host', () => {
    expect(extractR2Key('https://cdn.example.com/uploads/a.webp', CDN)).toBe('uploads/a.webp')
  })

  it('rejects foreign hosts', () => {
    expect(extractR2Key('https://i.ytimg.com/vi/x/default.jpg', CDN)).toBeNull()
  })

  it('accepts r2.dev hosts', () => {
    expect(extractR2Key('https://pub-123.r2.dev/statements/a.pdf', CDN)).toBe('statements/a.pdf')
  })
})

describe('extractKeysFromText', () => {
  it('finds CDN URLs inside HTML', () => {
    const html = '<img src="https://cdn.example.com/uploads/hero.jpg">'
    expect(extractKeysFromText(html, CDN)).toEqual(['uploads/hero.jpg'])
  })
})

describe('extractKeysFromUnknown', () => {
  it('walks nested JSON', () => {
    const keys = extractKeysFromUnknown(
      { photo: 'https://cdn.example.com/profile-photos/a.jpg', nested: ['uploads/b.png'] },
      CDN,
    )
    expect(keys).toContain('profile-photos/a.jpg')
    expect(keys).toContain('uploads/b.png')
  })
})

describe('objectPrefix', () => {
  it('uses the first segment', () => {
    expect(objectPrefix('cover-art/hash.jpg')).toBe('cover-art/')
    expect(objectPrefix('readme.txt')).toBe('(root)')
  })
})

describe('invoiceObjectKey', () => {
  it('matches the write-once convention', () => {
    expect(invoiceObjectKey('artist-1', 'inv-1')).toBe('invoices/artist-1/inv-1.pdf')
  })
})

describe('isOlderThan', () => {
  it('treats missing dates as old', () => {
    expect(isOlderThan(null, 1000, 10_000)).toBe(true)
  })

  it('respects the grace window', () => {
    expect(isOlderThan(new Date(9000), 2000, 10_000)).toBe(false)
    expect(isOlderThan(new Date(7000), 2000, 10_000)).toBe(true)
  })
})
