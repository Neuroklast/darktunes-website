/** Case- and whitespace-insensitive key so "FrozenPlasma" matches "Frozen Plasma". */
export function normalizeArtistNameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '')
}

export function artistNamesMatch(a: string, b: string): boolean {
  return normalizeArtistNameKey(a) === normalizeArtistNameKey(b)
}

/** Prefer the roster/display name that still has spaces. */
export function preferCanonicalArtistName(current: string, candidate: string): string {
  if (!current) return candidate
  if (!current.includes(' ') && candidate.includes(' ')) return candidate
  return current
}

function artistRuleRank(item: { artist: string }): number {
  const rec = item as {
    artist: string
    percentage?: number
    digitalPercentage?: number
    physicalPercentage?: number
    sourceOverrides?: unknown[]
    releaseOverrides?: unknown[]
  }
  let score = 0
  if (item.artist.includes(' ')) score += 1
  if (rec.digitalPercentage != null) score += 2
  if (rec.physicalPercentage != null) score += 2
  if (rec.releaseOverrides && rec.releaseOverrides.length > 0) score += 4
  if (rec.sourceOverrides && rec.sourceOverrides.length > 0) score += 8
  if (rec.percentage != null && rec.percentage !== 50) score += 1
  return score
}

export function findByArtistName<T extends { artist: string }>(
  items: readonly T[],
  nameKey: string,
): T | undefined {
  const matches = items.filter((item) => normalizeArtistNameKey(item.artist) === nameKey)
  if (matches.length <= 1) return matches[0]
  return matches.reduce((best, item) =>
    artistRuleRank(item) > artistRuleRank(best) ? item : best,
  )
}

export function filterByArtistName<T extends { artist: string }>(
  items: readonly T[],
  nameKey: string,
): T[] {
  return items.filter((item) => normalizeArtistNameKey(item.artist) === nameKey)
}

export function lookupByArtistName<T>(
  map: Record<string, T> | undefined,
  nameKey: string,
): T | undefined {
  if (!map) return undefined
  const direct = map[nameKey]
  if (direct !== undefined) return direct
  for (const [key, value] of Object.entries(map)) {
    if (normalizeArtistNameKey(key) === nameKey) return value
  }
  return undefined
}
