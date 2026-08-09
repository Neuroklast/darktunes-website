import { describe, it, expect } from 'vitest'
import type { ReleaseSubmission } from '@/types'
import {
  buildBelieveExportCsv,
  buildBelieveReleaseExport,
  validateBelieveExport,
} from './believeExport'

const baseSubmission: ReleaseSubmission = {
  id: 'sub-1',
  artistId: 'artist-1',
  status: 'accepted',
  title: 'Dark Horizon',
  releaseDate: '2026-09-01',
  type: 'single',
  genre: 'Gothic Metal',
  catalogNumber: 'DT-042',
  isrc: 'DE-HM1-26-00001',
  labelCopy: '┬® darkTunes 2026',
  audioDownloadUrl: 'https://example.com/audio.wav',
  coverArtUrl: 'https://example.com/cover.jpg',
  coverArtVerified: true,
  spotifyUrl: null,
  appleMusicUrl: null,
  youtubeUrl: null,
  notes: 'Radio edit',
  formData: null,
  adminReply: null,
  adminReplyAt: null,
  progressNote: null,
  createdAt: '2026-06-01T00:00:00Z',
  updatedAt: '2026-06-02T00:00:00Z',
}

describe('validateBelieveExport', () => {
  it('passes for a complete accepted submission', () => {
    const result = validateBelieveExport(baseSubmission, 'Necrovoid')
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('fails when required fields are missing', () => {
    const result = validateBelieveExport(
      { ...baseSubmission, title: '  ', audioDownloadUrl: '' },
      '',
    )
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Artist name is required')
    expect(result.errors).toContain('Release title is required')
    expect(result.errors).toContain('Audio download URL is required')
  })

  it('warns on missing ISRC and non-accepted status', () => {
    const result = validateBelieveExport(
      { ...baseSubmission, isrc: null, status: 'received' },
      'Necrovoid',
    )
    expect(result.valid).toBe(true)
    expect(result.warnings.some((w) => w.includes('ISRC'))).toBe(true)
    expect(result.warnings.some((w) => w.includes('received'))).toBe(true)
  })
})

describe('buildBelieveReleaseExport', () => {
  it('maps submission fields to export shape', () => {
    const exported = buildBelieveReleaseExport(baseSubmission, 'Necrovoid')
    expect(exported.exportVersion).toBe('1.0')
    expect(exported.artistName).toBe('Necrovoid')
    expect(exported.releaseTitle).toBe('Dark Horizon')
    expect(exported.isrc).toBe('DE-HM1-26-00001')
    expect(exported.status).toBe('accepted')
  })
})

describe('buildBelieveExportCsv', () => {
  it('produces a header row and one data row', () => {
    const exported = buildBelieveReleaseExport(baseSubmission, 'Necrovoid')
    const csv = buildBelieveExportCsv(exported)
    const lines = csv.split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toContain('Artist Name')
    expect(lines[1]).toContain('Necrovoid')
    expect(lines[1]).toContain('Dark Horizon')
  })

  it('escapes commas in field values', () => {
    const exported = buildBelieveReleaseExport(
      { ...baseSubmission, notes: 'feat. Artist A, Artist B' },
      'Necrovoid',
    )
    const csv = buildBelieveExportCsv(exported)
    expect(csv).toContain('"feat. Artist A, Artist B"')
  })
})
