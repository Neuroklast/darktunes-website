import { describe, expect, it } from 'vitest'
import { DEFAULT_CSV_PROFILES } from './default-profiles'
import { buildCsvProfileRegistry, csvProfileDefinitionKey } from './csvProfileRegistry'

describe('CSV profile registry', () => {
  it('hides exact built-in clones without modifying persisted settings', () => {
    const system = DEFAULT_CSV_PROFILES[0]
    const custom = { ...system, id: 'saved-clone', isSystemDefault: false }
    const stored = [custom]
    const result = buildCsvProfileRegistry(stored)
    expect(result.profiles.filter(p => csvProfileDefinitionKey(p) === csvProfileDefinitionKey(system))).toHaveLength(1)
    expect(result.shadowedProfiles).toEqual([custom])
    expect(stored).toHaveLength(1)
    expect(stored[0]).toBe(custom)
  })

  it('preserves an intentional different mapping for review', () => {
    const system = DEFAULT_CSV_PROFILES[0]
    const alternative = { ...system, id: 'different-mapping', isSystemDefault: false, columnMapping: { ...system.columnMapping, artistName: 'different artist' } }
    const result = buildCsvProfileRegistry([alternative])
    expect(result.profiles).toHaveLength(DEFAULT_CSV_PROFILES.length + 1)
    expect(result.nameConflicts).toContain(system.name.toLowerCase())
  })

  it('keeps an exact confirmed fingerprint even with a matching mapping', () => {
    const system = DEFAULT_CSV_PROFILES[0]
    const confirmed = { ...system, id: 'confirmed', headerFingerprint: 'a\u001fb' }
    const result = buildCsvProfileRegistry([confirmed])
    expect(result.profiles).toContain(confirmed)
  })
})
