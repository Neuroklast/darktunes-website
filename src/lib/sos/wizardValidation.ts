import type { ArtistRevenue, LabelArtist, SplitFee, TrackRevenueAssignment } from '@/lib/sos/types'
import { ownerPercentagesSumTo100, resolveAssignmentOwners } from '@/lib/sos/trackAssignmentSplits'
import { interpolate } from '@/lib/i18n/interpolate'

export type WizardIssueSeverity = 'error' | 'warning'

export interface WizardValidationIssue {
  id: string
  severity: WizardIssueSeverity
  title: string
  description: string
  actionLabel?: string
  actionTarget?: 'rules-mappings' | 'rules-splits' | 'rules-defaults' | 'upload' | 'setup' | 'settlements'
}

export interface WizardValidationInput {
  revenues: ArtistRevenue[]
  labelArtists: LabelArtist[]
  splitFees: SplitFee[]
  periodStart: string
  periodEnd: string
  hasBelieveFile: boolean
  hasBandcampFile: boolean
  hasShopifyFile: boolean
  hasPrintfulFile: boolean
  hasDarkmerchFile: boolean
  draftArtistNames?: string[]
  trackRevenueAssignments?: TrackRevenueAssignment[]
}

/** English defaults for wizard validation copy (also mirrored in accountingFallbacks). */
export const WIZARD_VALIDATION_FALLBACK = {
  validationMissingPeriodTitle: 'Billing period missing',
  validationMissingPeriodDesc: 'Please set the start and end month in the Setup step.',
  validationMissingPeriodAction: 'Go to Setup',
  validationNoRevenuesTitle: 'No revenues calculated',
  validationNoRevenuesDesc:
    'Upload at least one distributor CSV and wait for processing to finish.',
  validationNoRevenuesAction: 'Go to Upload',
  validationUnknownArtistTitle: 'Unknown artist: {artist}',
  validationUnknownArtistDesc:
    'This name is not on the label roster. Create an artist mapping or check the spelling.',
  validationUnknownArtistAction: 'Open mappings',
  validationNoPortalIdTitle: 'No portal link: {artist}',
  validationNoPortalIdDesc:
    'This artist is missing a portal link. Draft upload and notifications are limited.',
  validationNoPortalIdAction: 'Review roster',
  validationMissingSplitTitle: 'No individual split: {artist}',
  validationMissingSplitDesc:
    'The label default split is applied. Confirm that this is correct.',
  validationMissingSplitAction: 'Open splits',
  validationZeroPayoutTitle: 'Zero payout: {artist}',
  validationZeroPayoutDesc:
    'Revenue is present but payout is €0. Check splits, fees, and expenses.',
  validationZeroPayoutAction: 'Open defaults',
  validationExistingDraftTitle: 'Draft already exists: {artist}',
  validationExistingDraftDesc:
    'A draft already exists for this artist and period. Delete the draft or create a correction.',
  validationExistingDraftAction: 'Go to settlement',
  validationNoFilesTitle: 'No files uploaded',
  validationNoFilesDesc: 'Upload Believe, Bandcamp, Shopify, Printful, or Darkmerch CSV files.',
  validationNoFilesAction: 'Go to Upload',
  validationRosterNoPortalTitle: 'Roster without portal IDs',
  validationRosterNoPortalDesc:
    'No roster artist has a portal link. Statement uploads are not possible.',
  validationRosterNoPortalAction: 'Review roster',
  validationTrackSplitTitle: 'Track split must total 100%: {track}',
  validationTrackSplitDesc:
    'Owner percentages for this assignment do not add up to 100%. Revenue is not split until this is fixed.',
  validationTrackSplitAction: 'Open track splits',
} as const

export type WizardValidationLabels = {
  [K in keyof typeof WIZARD_VALIDATION_FALLBACK]: string
}

function rosterArtistIds(artists: LabelArtist[]): Set<string> {
  return new Set(
    artists
      .map((a) => a.artistId?.trim())
      .filter((id): id is string => !!id),
  )
}

function rosterNames(artists: LabelArtist[]): Set<string> {
  return new Set(artists.map((a) => a.name.toLowerCase()))
}

export function validateSosWizardState(
  input: WizardValidationInput,
  labels: WizardValidationLabels = WIZARD_VALIDATION_FALLBACK,
): WizardValidationIssue[] {
  const issues: WizardValidationIssue[] = []
  const rosterIds = rosterArtistIds(input.labelArtists)
  const roster = rosterNames(input.labelArtists)
  const splitByArtist = new Map(
    input.splitFees.map((s) => [s.artist.toLowerCase(), s]),
  )

  if (!input.periodStart || !input.periodEnd) {
    issues.push({
      id: 'missing-period',
      severity: 'error',
      title: labels.validationMissingPeriodTitle,
      description: labels.validationMissingPeriodDesc,
      actionLabel: labels.validationMissingPeriodAction,
      actionTarget: 'setup',
    })
  }

  if (input.revenues.length === 0) {
    issues.push({
      id: 'no-revenues',
      severity: 'error',
      title: labels.validationNoRevenuesTitle,
      description: labels.validationNoRevenuesDesc,
      actionLabel: labels.validationNoRevenuesAction,
      actionTarget: 'upload',
    })
  }

  for (const revenue of input.revenues) {
    const key = revenue.artist.toLowerCase()
    const rosterMatch = roster.has(key)
    const mappedArtist = input.labelArtists.find(
      (a) => a.name.toLowerCase() === key,
    )
    const hasPortalId = mappedArtist?.artistId?.trim()

    if (!rosterMatch && revenue.totalRevenue > 0) {
      issues.push({
        id: `unknown-artist-${key}`,
        severity: 'warning',
        title: interpolate(labels.validationUnknownArtistTitle, { artist: revenue.artist }),
        description: labels.validationUnknownArtistDesc,
        actionLabel: labels.validationUnknownArtistAction,
        actionTarget: 'rules-mappings',
      })
    }

    if (rosterMatch && !hasPortalId && revenue.finalAmount > 0) {
      issues.push({
        id: `no-portal-id-${key}`,
        severity: 'warning',
        title: interpolate(labels.validationNoPortalIdTitle, { artist: revenue.artist }),
        description: labels.validationNoPortalIdDesc,
        actionLabel: labels.validationNoPortalIdAction,
        actionTarget: 'rules-mappings',
      })
    }

    if (revenue.totalRevenue > 0 && !splitByArtist.has(key)) {
      issues.push({
        id: `missing-split-${key}`,
        severity: 'warning',
        title: interpolate(labels.validationMissingSplitTitle, { artist: revenue.artist }),
        description: labels.validationMissingSplitDesc,
        actionLabel: labels.validationMissingSplitAction,
        actionTarget: 'rules-splits',
      })
    }

    if (revenue.totalRevenue > 0 && Math.abs(revenue.finalAmount) < 0.005) {
      issues.push({
        id: `zero-payout-${key}`,
        severity: 'warning',
        title: interpolate(labels.validationZeroPayoutTitle, { artist: revenue.artist }),
        description: labels.validationZeroPayoutDesc,
        actionLabel: labels.validationZeroPayoutAction,
        actionTarget: 'rules-defaults',
      })
    }
  }

  for (const assignment of input.trackRevenueAssignments ?? []) {
    const owners = resolveAssignmentOwners(assignment)
    const forSum = owners.map((owner) => ({ percentage: owner.fraction * 100 }))
    if (owners.length > 0 && !ownerPercentagesSumTo100(forSum)) {
      issues.push({
        id: `track-split-${assignment.trackTitle.trim().toLowerCase()}`,
        severity: 'error',
        title: interpolate(labels.validationTrackSplitTitle, { track: assignment.trackTitle }),
        description: labels.validationTrackSplitDesc,
        actionLabel: labels.validationTrackSplitAction,
        actionTarget: 'rules-splits',
      })
    }
  }

  if (input.draftArtistNames && input.draftArtistNames.length > 0) {
    for (const name of input.draftArtistNames) {
      issues.push({
        id: `existing-draft-${name.toLowerCase()}`,
        severity: 'error',
        title: interpolate(labels.validationExistingDraftTitle, { artist: name }),
        description: labels.validationExistingDraftDesc,
        actionLabel: labels.validationExistingDraftAction,
        actionTarget: 'settlements',
      })
    }
  }

  const hasAnyFile =
    input.hasBelieveFile ||
    input.hasBandcampFile ||
    input.hasShopifyFile ||
    input.hasPrintfulFile ||
    input.hasDarkmerchFile

  if (!hasAnyFile && input.revenues.length === 0) {
    issues.push({
      id: 'no-files',
      severity: 'error',
      title: labels.validationNoFilesTitle,
      description: labels.validationNoFilesDesc,
      actionLabel: labels.validationNoFilesAction,
      actionTarget: 'upload',
    })
  }

  const errors = issues.filter((i) => i.severity === 'error')
  if (errors.length === 0 && rosterIds.size === 0 && input.labelArtists.length > 0) {
    issues.push({
      id: 'roster-no-portal-ids',
      severity: 'warning',
      title: labels.validationRosterNoPortalTitle,
      description: labels.validationRosterNoPortalDesc,
      actionLabel: labels.validationRosterNoPortalAction,
      actionTarget: 'rules-mappings',
    })
  }

  return issues
}

export function wizardHasBlockingIssues(issues: WizardValidationIssue[]): boolean {
  return issues.some((i) => i.severity === 'error')
}
