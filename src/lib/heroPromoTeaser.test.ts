import { describe, expect, it } from 'vitest'
import {
  formatHeroPromoTeaser,
  HERO_PROMO_TEASER_MAX_CHARS,
  resolveHeroItemDescription,
} from './heroPromoTeaser'

const FALLBACK =
  'Experience the latest evolution in alternative music. A sonic journey that pushes boundaries and defies expectations.'

describe('formatHeroPromoTeaser', () => {
  it('returns null for empty or whitespace promo text', () => {
    expect(formatHeroPromoTeaser(null)).toBeNull()
    expect(formatHeroPromoTeaser(undefined)).toBeNull()
    expect(formatHeroPromoTeaser('')).toBeNull()
    expect(formatHeroPromoTeaser('   \n\t  ')).toBeNull()
  })

  it('returns short promo text unchanged', () => {
    expect(formatHeroPromoTeaser('Brand new single out now.')).toBe(
      'Brand new single out now.',
    )
  })

  it('collapses whitespace and newlines', () => {
    expect(formatHeroPromoTeaser('Line one.\n\n  Line two.')).toBe(
      'Line one. Line two.',
    )
  })

  it('truncates long text with an ellipsis at a word boundary', () => {
    const long =
      'The darkTunes roster returns with a crushing new single that blends industrial drums, soaring choruses, and raw live energy for the summer festival circuit.'
    const teaser = formatHeroPromoTeaser(long, 80)
    expect(teaser).not.toBeNull()
    expect(teaser!.endsWith('…')).toBe(true)
    expect(teaser!.length).toBeLessThanOrEqual(80)
    expect(teaser).not.toContain('\n')
    // Should not mid-cut a word if a space is available
    expect(teaser!.slice(0, -1).endsWith(' ')).toBe(false)
  })

  it('uses the default max length constant', () => {
    const long = 'word '.repeat(100).trim()
    const teaser = formatHeroPromoTeaser(long)
    expect(teaser).not.toBeNull()
    expect(teaser!.endsWith('…')).toBe(true)
    expect(teaser!.length).toBeLessThanOrEqual(HERO_PROMO_TEASER_MAX_CHARS)
  })
})

describe('resolveHeroItemDescription', () => {
  it('uses release promo teaser and never the global fallback when promo exists', () => {
    const result = resolveHeroItemDescription({
      kind: 'release',
      promoText: 'Crushing new single out Friday — full story on the release page.',
      fallback: FALLBACK,
    })
    expect(result).toContain('Crushing new single')
    expect(result).not.toContain('Experience the latest evolution')
  })

  it('uses news excerpt teaser and never the global fallback when excerpt exists', () => {
    const result = resolveHeroItemDescription({
      kind: 'news',
      excerpt: 'Label announces summer festival package with three roster acts.',
      fallback: FALLBACK,
    })
    expect(result).toContain('Label announces summer festival')
    expect(result).not.toContain('Experience the latest evolution')
  })

  it('falls back only when the featured item has no own text', () => {
    expect(
      resolveHeroItemDescription({
        kind: 'release',
        promoText: '   ',
        fallback: FALLBACK,
      }),
    ).toBe(FALLBACK)

    expect(
      resolveHeroItemDescription({
        kind: 'news',
        excerpt: '',
        fallback: FALLBACK,
      }),
    ).toBe(FALLBACK)
  })

  it('returns null when item text and fallback are both empty', () => {
    expect(
      resolveHeroItemDescription({
        kind: 'release',
        promoText: null,
        fallback: '  ',
      }),
    ).toBeNull()
  })

  it('truncates long item text with ellipsis and still skips fallback', () => {
    const long = 'alpha '.repeat(80).trim()
    const result = resolveHeroItemDescription({
      kind: 'release',
      promoText: long,
      fallback: FALLBACK,
    })
    expect(result).not.toBeNull()
    expect(result!.endsWith('…')).toBe(true)
    expect(result).not.toContain('Experience the latest')
  })
})
