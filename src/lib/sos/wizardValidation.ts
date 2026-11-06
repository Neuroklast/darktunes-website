import type { ArtistRevenue, LabelArtist, SplitFee, TrackRevenueAssignment } from '@/lib/sos/types'
import { normalizeArtistNameKey } from '@/lib/sos/artistNameKey'
import { ownerPercentagesSumTo100, resolveAssignmentOwners } from '@/lib/sos/trackAssignmentSplits'
import { interpolate } from '@/lib/i18n/interpolate'
import { accountingPeriodMonths, sourcePeriodOutside } from '@/lib/sos/accountingPeriod'

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
  skippedRowCount?: number
  skipReasons?: string[]
  emptyCurrencyRowCount?: number
  skippedRowsBySource?: { name: string; count: number }[]
  emptyCurrencyRowsBySource?: { name: string; count: number }[]
  /** Unmodified source-reporting bounds for traceability, not a replacement billing period. */
  sourcePeriods?: { name: string; start?: string; end?: string }[]
  /** Session files that parsed but have no bronze archive id. */
  unarchivedSourceFiles?: string[]
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
  validationParseSkipsTitle: '{count} rows skipped during import',
  validationParseSkipsDesc:
    'Intentional filters (Bandcamp payout, empty lines, transfers without artist). Reasons: {reasons}.',
  validationEmptyCurrencyTitle: '{count} rows had no currency and were treated as EUR',
  validationEmptyCurrencyDesc:
    'Believe sometimes leaves the currency cell empty. Those rows stay in EUR. Missing or zero FX rates still abort processing.',
  validationCurrencySources: 'Affected source files: {sources}.',
  validationSkipSources: 'Rows skipped by source: {sources}.',
  validationIncompleteArchiveTitle: 'Source files are not archived',
  validationIncompleteArchiveDesc:
    'These files are not in storage yet: {files}. Retry archive before creating statements. Preview and Excel still work.',
  validationIncompleteArchiveAction: 'Go to Upload',
  validationLongPeriodTitle: 'Billing period spans {count} months',
  validationLongPeriodDesc: 'This is longer than one year. Check that all source dates belong to this statement before approving payouts.',
  validationSourcePeriodOutsideTitle: '{count} source file(s) extend beyond this period',
  validationSourcePeriodOutsideDesc: 'Source reporting dates are outside the selected billing period: {files}. Confirm that these rows were deliberately included.',
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
  return new Set(artists.map((a) => normalizeArtistNameKey(a.name)))
}

export function validateSosWizardState(
  input: WizardValidationInput,
  labels: WizardValidationLabels = WIZARD_VALIDATION_FALLBACK,
): WizardValidationIssue[] {
  const issues: WizardValidationIssue[] = []
  const rosterIds = rosterArtistIds(input.labelArtists)
  const roster = rosterNames(input.labelArtists)
  const splitByArtist = new Map(
    input.splitFees.map((s) => [normalizeArtistNameKey(s.artist), s]),
  )

  const unarchived = (input.unarchivedSourceFiles ?? []).filter(Boolean)
  if (unarchived.length > 0) {
    issues.push({
      id: 'incomplete-archive',
      severity: 'error',
      title: labels.validationIncompleteArchiveTitle,
      description: interpolate(labels.validationIncompleteArchiveDesc, {
        files: unarchived.join(', '),
      }),
      actionLabel: labels.validationIncompleteArchiveAction,
      actionTarget: 'upload',
    })
  }

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

  const months = accountingPeriodMonths(input.periodStart, input.periodEnd)
  if (months != null && months > 12) {
    issues.push({
      id: 'unusually-long-period',
      severity: 'warning',
      title: interpolate(labels.validationLongPeriodTitle, { count: String(months) }),
      description: labels.validationLongPeriodDesc,
      actionTarget: 'setup',
    })
  }

  if (months != null) {
    const outside = (input.sourcePeriods ?? []).filter(source =>
      source.start && source.end &&
      sourcePeriodOutside(input.periodStart, input.periodEnd, source.start, source.end),
    )
    if (outside.length > 0) {
      const shown = outside.slice(0, 6).map(source => source.name)
      issues.push({
        id: 'source-period-outside',
        severity: 'warning',
        title: interpolate(labels.validationSourcePeriodOutsideTitle, { count: String(outside.length) }),
        description: interpolate(labels.validationSourcePeriodOutsideDesc, {
          files: shown.join(', ') + (outside.length > shown.length ? ` (+${outside.length - shown.length})` : ''),
        }),
        actionLabel: labels.validationIncompleteArchiveAction,
        actionTarget: 'upload',
      })
    }
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
    const key = normalizeArtistNameKey(revenue.artist)
    const rosterMatch = roster.has(key)
    const mappedArtist = input.labelArtists.find(
      (a) => normalizeArtistNameKey(a.name) === key,
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

  const formatSources = (sources: { name: string; count: number }[]) => {
    const sorted = sources.filter(source => Number.isFinite(source.count) && source.count > 0)
      .sort((a, b) => b.count - a.count)
    return sorted.slice(0, 5).map(source => `${source.name} (${source.count.toLocaleString()})`).join(', ') +
      (sorted.length > 5 ? ` (+${sorted.length - 5})` : '')
  }

  if ((input.skippedRowCount ?? 0) > 0) {
    const reasons = (input.skipReasons ?? []).filter(Boolean)
    issues.push({
      id: 'parse-skips',
      severity: 'warning',
      title: interpolate(labels.validationParseSkipsTitle, { count: String(input.skippedRowCount) }),
      description: interpolate(labels.validationParseSkipsDesc, {
        reasons: reasons.length > 0 ? reasons.join(', ') : 'filtered rows',
      }) + ((input.skippedRowsBySource?.length ?? 0) > 0 ? ' ' +
        interpolate(labels.validationSkipSources, { sources: formatSources(input.skippedRowsBySource ?? []) }) : ''),
      actionLabel: labels.validationNoFilesAction,
      actionTarget: 'upload',
    })
  }

  if ((input.emptyCurrencyRowCount ?? 0) > 0) {
    issues.push({
      id: 'empty-currency',
      severity: 'warning',
      title: interpolate(labels.validationEmptyCurrencyTitle, {
        count: String(input.emptyCurrencyRowCount),
      }),
      description: labels.validationEmptyCurrencyDesc +
        ((input.emptyCurrencyRowsBySource?.length ?? 0) > 0 ? ' ' +
          interpolate(labels.validationCurrencySources, {
            sources: formatSources(input.emptyCurrencyRowsBySource ?? []),
          }) : ''),
      actionTarget: 'upload',
    })
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
