import type { ReleaseSubmission } from '@/types'

/** Believe-oriented metadata package for distributor handoff (manual upload). */
export interface BelieveReleaseExport {
  exportVersion: '1.0'
  exportedAt: string
  submissionId: string
  artistName: string
  releaseTitle: string
  releaseDate: string | null
  releaseType: string | null
  genre: string | null
  catalogNumber: string | null
  isrc: string | null
  labelCopy: string | null
  audioDownloadUrl: string
  coverArtUrl: string
  coverArtVerified: boolean
  spotifyUrl: string | null
  appleMusicUrl: string | null
  youtubeUrl: string | null
  notes: string | null
  status: ReleaseSubmission['status']
}

export interface BelieveExportValidation {
  valid: boolean
  errors: string[]
  warnings: string[]
}

const BELIEVE_CSV_HEADERS = [
  'Artist Name',
  'Release Title',
  'Release Date',
  'Release Type',
  'Genre',
  'Catalog Number',
  'ISRC',
  'Label Copy',
  'Audio URL',
  'Cover Art URL',
  'Cover Verified',
  'Spotify URL',
  'Apple Music URL',
  'YouTube URL',
  'Notes',
  'Submission Status',
] as const

function escapeCsvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function rowToCsv(cells: (string | number | boolean | null | undefined)[]): string {
  return cells.map(escapeCsvCell).join(',')
}

export function validateBelieveExport(
  submission: ReleaseSubmission,
  artistName: string,
): BelieveExportValidation {
  const errors: string[] = []
  const warnings: string[] = []

  if (!artistName.trim()) errors.push('Artist name is required')
  if (!submission.title.trim()) errors.push('Release title is required')
  if (!submission.audioDownloadUrl.trim()) errors.push('Audio download URL is required')
  if (!submission.coverArtUrl.trim()) errors.push('Cover art URL is required')

  if (!submission.isrc?.trim()) warnings.push('ISRC is missing ÔÇö required for most distributor deliveries')
  if (!submission.releaseDate) warnings.push('Release date is missing')
  if (!submission.coverArtVerified) warnings.push('Cover art is not verified')
  if (submission.status !== 'accepted' && submission.status !== 'reviewed') {
    warnings.push(`Submission status is "${submission.status}" ÔÇö export is intended for reviewed or accepted releases`)
  }

  return { valid: errors.length === 0, errors, warnings }
}

export function buildBelieveReleaseExport(
  submission: ReleaseSubmission,
  artistName: string,
): BelieveReleaseExport {
  return {
    exportVersion: '1.0',
    exportedAt: new Date().toISOString(),
    submissionId: submission.id,
    artistName: artistName.trim(),
    releaseTitle: submission.title.trim(),
    releaseDate: submission.releaseDate,
    releaseType: submission.type,
    genre: submission.genre,
    catalogNumber: submission.catalogNumber,
    isrc: submission.isrc,
    labelCopy: submission.labelCopy,
    audioDownloadUrl: submission.audioDownloadUrl,
    coverArtUrl: submission.coverArtUrl,
    coverArtVerified: submission.coverArtVerified,
    spotifyUrl: submission.spotifyUrl,
    appleMusicUrl: submission.appleMusicUrl,
    youtubeUrl: submission.youtubeUrl,
    notes: submission.notes,
    status: submission.status,
  }
}

export function buildBelieveExportCsv(exportData: BelieveReleaseExport): string {
  const lines = [
    rowToCsv([...BELIEVE_CSV_HEADERS]),
    rowToCsv([
      exportData.artistName,
      exportData.releaseTitle,
      exportData.releaseDate,
      exportData.releaseType,
      exportData.genre,
      exportData.catalogNumber,
      exportData.isrc,
      exportData.labelCopy,
      exportData.audioDownloadUrl,
      exportData.coverArtUrl,
      exportData.coverArtVerified,
      exportData.spotifyUrl,
      exportData.appleMusicUrl,
      exportData.youtubeUrl,
      exportData.notes,
      exportData.status,
    ]),
  ]
  return lines.join('\n')
}
