import type { CsvImportProfile } from './types'
import { DEFAULT_CSV_PROFILES } from './default-profiles'

/**
 * Compare the actual file recognition and mapping definition, not the generated
 * ID or display label. Persisted copies are never removed from the workspace.
 */
function normalized(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()
}

export function csvProfileDefinitionKey(profile: CsvImportProfile): string {
  const headers = [...new Set(profile.autoDetectHeaders.map(normalized).filter(Boolean))].sort()
  const mapping = Object.entries(profile.columnMapping)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && Boolean(entry[1].trim()))
    .map(([key, value]) => [key, normalized(value)] as const)
    .sort(([a], [b]) => a.localeCompare(b))
  return JSON.stringify({
    type: profile.type,
    delimiter: profile.delimiter,
    headers,
    mapping,
    fingerprint: profile.headerFingerprint || '',
  })
}

export interface CsvProfileRegistry {
  profiles: CsvImportProfile[]
  shadowedProfiles: CsvImportProfile[]
  nameConflicts: string[]
}

/**
 * System definitions are stable and tied to specialized importer routing.
 * Remove only exact semantic copies from the ACTIVE registry, preserving every
 * stored custom profile untouched for export, inspection and later editing.
 */
export function buildCsvProfileRegistry(
  savedCustom: CsvImportProfile[],
  systems: CsvImportProfile[] = DEFAULT_CSV_PROFILES,
): CsvProfileRegistry {
  const keys = new Set<string>()
  const ids = new Set<string>()
  const profiles: CsvImportProfile[] = []
  const shadowedProfiles: CsvImportProfile[] = []

  // Keep exact user-confirmed header signatures available for the fast path,
  // but canonical system copies must precede their legacy clones.
  for (const profile of [...systems, ...savedCustom]) {
    const key = csvProfileDefinitionKey(profile)
    // An old workspace may contain a custom copy with the *same stable ID*
    // as a built-in but different columns. It must not replace the specialized
    // system parser nor create duplicate React keys.
    if (keys.has(key) || ids.has(profile.id)) shadowedProfiles.push(profile)
    else {
      keys.add(key)
      ids.add(profile.id)
      profiles.push(profile)
    }
  }

  const nameMap = new Map<string, Set<string>>()
  for (const profile of profiles) {
    const name = normalized(profile.name)
    if (!name) continue
    const signatures = nameMap.get(name) ?? new Set<string>()
    signatures.add(csvProfileDefinitionKey(profile))
    nameMap.set(name, signatures)
  }
  const nameConflicts = [...nameMap.entries()]
    .filter(([, signatures]) => signatures.size > 1)
    .map(([name]) => name)

  return { profiles, shadowedProfiles, nameConflicts }
}
