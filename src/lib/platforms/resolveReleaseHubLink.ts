export interface ReleaseHubLinkSources {
  smartlinkUrl?: string | null
  smartUrl?: string | null
  platformLinks?: Record<string, string> | null
}

const HUB_PLATFORM_KEYS = ['smartlink', 'songlink', 'page', 'link'] as const

function normalizeUrl(url: string | null | undefined): string | undefined {
  const trimmed = url?.trim()
  return trimmed || undefined
}

/**
 * Resolves the release-level hub / smart link (Linktree, presave, song.link, etc.).
 * Manual `smartlinkUrl` takes priority over Odesli `smartUrl` and platform_links hubs.
 */
export function resolveReleaseHubLink(sources: ReleaseHubLinkSources): string | undefined {
  const manual = normalizeUrl(sources.smartlinkUrl)
  if (manual) return manual

  const odesli = normalizeUrl(sources.smartUrl)
  if (odesli) return odesli

  for (const key of HUB_PLATFORM_KEYS) {
    const url = normalizeUrl(sources.platformLinks?.[key])
    if (url) return url
  }

  return undefined
}

/**
 * Label key for the hub button: manual smartlinks use `smartLink`, Odesli hubs use `listenEverywhere`.
 */
export function resolveReleaseHubLinkLabelKey(sources: ReleaseHubLinkSources): 'smartLink' | 'listenEverywhere' {
  return normalizeUrl(sources.smartlinkUrl) ? 'smartLink' : 'listenEverywhere'
}