import { describe, expect, it } from 'vitest'
import {
  ARTIST_PROFILE_PREVIEW_ROWS_DEFAULT,
  artistProfileNewsColumns,
  artistProfileVideoColumns,
  artistProfileVisibleCount,
  clampArtistProfilePreviewRows,
} from './artistProfilePreview'

describe('clampArtistProfilePreviewRows', () => {
  it('defaults null/undefined/NaN to 2', () => {
    expect(clampArtistProfilePreviewRows(null)).toBe(ARTIST_PROFILE_PREVIEW_ROWS_DEFAULT)
    expect(clampArtistProfilePreviewRows(undefined)).toBe(ARTIST_PROFILE_PREVIEW_ROWS_DEFAULT)
    expect(clampArtistProfilePreviewRows(Number.NaN)).toBe(ARTIST_PROFILE_PREVIEW_ROWS_DEFAULT)
  })

  it('clamps to 1–12', () => {
    expect(clampArtistProfilePreviewRows(0)).toBe(1)
    expect(clampArtistProfilePreviewRows(-3)).toBe(1)
    expect(clampArtistProfilePreviewRows(99)).toBe(12)
    expect(clampArtistProfilePreviewRows(5.9)).toBe(5)
  })
})

describe('artistProfileVisibleCount', () => {
  it('multiplies rows by columns', () => {
    expect(artistProfileVisibleCount(2, 3)).toBe(6)
    expect(artistProfileVisibleCount(2, 2)).toBe(4)
    expect(artistProfileVisibleCount(2, 1)).toBe(2)
  })

  it('floors invalid inputs to at least 1', () => {
    expect(artistProfileVisibleCount(0, 3)).toBe(3)
    expect(artistProfileVisibleCount(2, 0)).toBe(2)
  })
})

describe('artistProfileVideoColumns', () => {
  it('returns 1 / 2 / 3 for mobile / md / xl', () => {
    expect(artistProfileVideoColumns(false, false)).toBe(1)
    expect(artistProfileVideoColumns(true, false)).toBe(2)
    expect(artistProfileVideoColumns(true, true)).toBe(3)
    // xl implies desktop; if only xl is true still prefer 3
    expect(artistProfileVideoColumns(false, true)).toBe(3)
  })
})

describe('artistProfileNewsColumns', () => {
  it('returns 1 mobile / 2 md+', () => {
    expect(artistProfileNewsColumns(false)).toBe(1)
    expect(artistProfileNewsColumns(true)).toBe(2)
  })
})
