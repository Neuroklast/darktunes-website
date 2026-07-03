import { describe, it, expect } from 'vitest'
import { buildSubmissionExportRows, buildSubmissionsCsv } from './submissionExport'
import type { ReleaseSubmission, ReleaseSubmissionTrack } from '@/types'

const submission: ReleaseSubmission = {
  id: 'sub-1',
  artistId: 'art-1',
  organizationId: '00000000-0000-0000-0000-000000000000',
  status: 'received',
  title: 'My Album',
  releaseDate: '2024-06-01',
  type: 'album',
  genre: 'Techno',
  catalogNumber: 'DT-001',
  isrc: null,
  labelCopy: null,
  audioDownloadUrl: 'https://example.com/audio',
  coverArtUrl: 'https://example.com/cover',
  coverArtVerified: true,
  spotifyUrl: null,
  appleMusicUrl: null,
  youtubeUrl: null,
  notes: null,
  formData: { ean: '4006381333931' },
  adminReply: null,
  adminReplyAt: null,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
}

const track: ReleaseSubmissionTrack = {
  id: 'tr-1',
  submissionId: 'sub-1',
  trackNumber: 1,
  title: 'Track One',
  isrc: 'DE-ABC-24-00001',
  composer: 'A',
  author: 'B',
  genre: 'Techno',
  language: 'DE',
  gema: true,
  explicit: false,
  live: false,
  cover: false,
  instrumental: false,
  previewStartSeconds: 30,
  durationSeconds: 210,
  formData: null,
  displayOrder: 0,
  createdAt: '2024-01-01T00:00:00Z',
}

describe('submissionExport', () => {
  it('builds one row per track with release metadata', () => {
    const rows = buildSubmissionExportRows({
      submissions: [submission],
      tracksBySubmission: new Map([['sub-1', [track]]]),
      artistNames: new Map([['art-1', 'Artist X']]),
      schemaFields: [{ fieldKey: 'ean', fieldScope: 'release', isVisible: true } as never],
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].artistName).toBe('Artist X')
    expect(rows[0].ean).toBe('4006381333931')
    expect(rows[0]['Song Title']).toBe('Track One')
  })

  it('builds CSV with headers', () => {
    const rows = buildSubmissionExportRows({
      submissions: [submission],
      tracksBySubmission: new Map(),
      artistNames: new Map([['art-1', 'Artist X']]),
      schemaFields: [],
    })
    const csv = buildSubmissionsCsv(rows)
    expect(csv.split('\n')[0]).toContain('submissionId')
    expect(csv).toContain('My Album')
  })
})