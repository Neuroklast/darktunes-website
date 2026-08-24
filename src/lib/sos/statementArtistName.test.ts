import { describe, expect, it } from 'vitest'
import { artistNameFromEmbed } from './statementArtistName'

describe('artistNameFromEmbed', () => {
  it('reads a many-to-one object embed', () => {
    expect(artistNameFromEmbed({ name: 'Neuroklast' })).toBe('Neuroklast')
  })

  it('reads the first row of an array embed', () => {
    expect(artistNameFromEmbed([{ name: 'Neuroklast' }, { name: 'Other' }])).toBe('Neuroklast')
  })

  it('does not throw on missing or malformed joins', () => {
    expect(artistNameFromEmbed(null)).toBe('')
    expect(artistNameFromEmbed(undefined)).toBe('')
    expect(artistNameFromEmbed([])).toBe('')
    expect(artistNameFromEmbed({ name: 12 })).toBe('')
  })
})
