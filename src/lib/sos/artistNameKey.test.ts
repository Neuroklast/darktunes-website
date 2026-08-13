import { describe, expect, it } from 'vitest'
import {
  artistNamesMatch,
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
