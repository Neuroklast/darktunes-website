import { PLATFORM_ORDER } from './platformConfig'

export interface PlatformLinkEntry {
  key: string
  url: string
}

export interface PlatformLinkSources {
  platformLinks?: Record<string, string> | null
  spotifyUrl?: string | null
  appleMusicUrl?: string | null
  youtubeUrl?: string | null
  bandcampUrl?: string | null
}

/** Hub / aggregator keys — never shown as per-platform buttons. */
const HUB_PLATFORM_KEYS = new Set(['smartlink', 'songlink', 'page', 'link'])

/**
 * Builds ordered per-platform streaming entries for release/artist pages.
 * Merges persisted `platform_links` with individually stored URLs; excludes
 * song.link / Listen Everywhere hub links.
 */
export function buildPlatformLinkEntries(sources: PlatformLinkSources): PlatformLinkEntry[] {
  const merged: Record<string, string> = {}

  for (const [key, url] of Object.entries(sources.platformLinks ?? {})) {
    if (!url || HUB_PLATFORM_KEYS.has(key.toLowerCase())) continue
    merged[key] = url
  }

  const addIfMissing = (key: string, url: string | null | undefined): void => {
    if (url && !merged[key]) merged[key] = url
  }

  addIfMissing('spotify', sources.spotifyUrl)
  addIfMissing('appleMusic', sources.appleMusicUrl)
  addIfMissing('youtube', sources.youtubeUrl)
  addIfMissing('bandcamp', sources.bandcampUrl)

  const known = PLATFORM_ORDER.filter((k) => merged[k])
  const unknown = Object.keys(merged)
    .filter((k) => !PLATFORM_ORDER.includes(k))
    .sort()

  return [...known, ...unknown].map((k) => ({ key: k, url: merged[k] }))
}