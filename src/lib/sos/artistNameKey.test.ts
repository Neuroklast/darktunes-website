import { describe, expect, it } from 'vitest'
import {
  artistNamesMatch,
  filterByArtistName,
  findByArtistName,
  lookupByArtistName,
  normalizeArtistNameKey,
  preferCanonicalArtistName,
} from './artistNameKey'

describe('normalizeArtistNameKey', () => {
  it('treats FrozenPlasma and Frozen Plasma as the same artist', () => {
    expect(normalizeArtistNameKey('FrozenPlasma')).toBe(
      normalizeArtistNameKey('Frozen Plasma'),
    )
    expect(artistNamesMatch('FrozenPlasma', ' Frozen  Plasma ')).toBe(true)
  })

  it('does not collapse distinct names', () => {
    expect(artistNamesMatch('Frozen Plasma', 'NamNamBulu')).toBe(false)
  })
})

describe('preferCanonicalArtistName', () => {
  it('keeps the spaced roster name over a concatenated CSV name', () => {
    expect(preferCanonicalArtistName('FrozenPlasma', 'Frozen Plasma')).toBe('Frozen Plasma')
  })
})

describe('artist name lookups', () => {
  it('finds Frozen Plasma rules under the FrozenPlasma grouping key', () => {
    const fees = [{ artist: 'Frozen Plasma', percentage: 80 }]
    expect(findByArtistName(fees, 'frozenplasma')?.percentage).toBe(80)
    expect(filterByArtistName(fees, 'frozenplasma')).toHaveLength(1)
  })

  it('prefers the Frozen Plasma 80% rule over a leftover FrozenPlasma 50% row', () => {
    const fees = [
      { artist: 'FrozenPlasma', percentage: 50 },
      {
        artist: 'Frozen Plasma',
        percentage: 80,
        sourceOverrides: [
          { source: 'believe', percentage: 80 },
          { source: 'bandcamp', percentage: 50 },
        ],
      },
    ]
    const match = findByArtistName(fees, 'frozenplasma')
    expect(match?.artist).toBe('Frozen Plasma')
    expect(match?.percentage).toBe(80)
    expect(match?.sourceOverrides?.[0]?.percentage).toBe(80)
  })

  it('reads carry-forward maps keyed with leftover spaces', () => {
    expect(lookupByArtistName({ 'frozen plasma': 12.5 }, 'frozenplasma')).toBe(12.5)
    expect(lookupByArtistName({ frozenplasma: 8 }, 'frozenplasma')).toBe(8)
  })
})
