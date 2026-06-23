export type BioDownloadTier = 'short' | 'medium' | 'long'
export type BioDownloadLocale = 'de' | 'en'
export type BioDownloadFormat = 'txt' | 'pdf'

const TIER_LABELS: Record<BioDownloadTier, string> = {
  short: 'Short Bio',
  medium: 'Medium Bio',
  long: 'Long Bio',
}

export function buildBioAssetKey(
  artistId: string,
  locale: BioDownloadLocale,
  tier: BioDownloadTier,
  format: BioDownloadFormat,
): string {
  return `bio:${artistId}:${locale}:${tier}:${format}`
}

export function formatDownloadAssetLabel(assetKey: string): string {
  if (!assetKey.startsWith('bio:')) {
    const segment = assetKey.split('/').pop()
    return segment && segment.length > 0 ? segment : assetKey
  }

  const parts = assetKey.split(':')
  if (parts.length < 5) return assetKey

  const tier = parts[3] as BioDownloadTier
  const locale = parts[2] as BioDownloadLocale
  const format = parts[4] as BioDownloadFormat
  const tierLabel = TIER_LABELS[tier] ?? parts[3]
  const localeLabel = locale === 'en' ? 'EN' : 'DE'
  const formatLabel = format === 'pdf' ? 'PDF' : 'TXT'
  return `${tierLabel} (${localeLabel}) — ${formatLabel}`
}