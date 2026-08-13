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
