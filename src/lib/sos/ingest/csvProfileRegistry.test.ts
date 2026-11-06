import { describe, expect, it } from 'vitest'
import { DEFAULT_CSV_PROFILES } from './default-profiles'
import { buildCsvProfileRegistry, csvProfileDefinitionKey } from './csvProfileRegistry'
import { matchProfile } from './parser-facade'
import { fingerprintHeaders } from './importSample'

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
  it('honors a confirmed exact header fingerprint over system heuristics', () => {
    const system = DEFAULT_CSV_PROFILES[0]
    const columns = ['payout date', 'paid to you', 'bandcamp id', 'item date', 'item type']
    const confirmed = {
      ...system,
      id: 'user-confirmed-layout',
      isSystemDefault: false,
      headerFingerprint: fingerprintHeaders(columns),
    }
    const registry = buildCsvProfileRegistry([confirmed])
    expect(matchProfile(columns, registry.profiles)?.id).toBe(confirmed.id)
  })

  it('does not remove a custom definition with distinct header mappings', () => {
    const system = DEFAULT_CSV_PROFILES[0]
    const custom = {
      ...system,
      id: 'custom-export',
      name: 'My custom export',
      isSystemDefault: false,
      autoDetectHeaders: ['custom field', 'custom amount'],
    }
    const registry = buildCsvProfileRegistry([custom])
    expect(registry.profiles.some(profile => profile.id === custom.id)).toBe(true)
    expect(registry.shadowedProfiles).toHaveLength(0)
  })
  it('does not activate a legacy custom profile with a built-in system ID', () => {
    const system = DEFAULT_CSV_PROFILES[0]
    const oldCopy = { ...system, isSystemDefault: false, columnMapping: { ...system.columnMapping, netRevenue: 'old balance' } }
    const registry = buildCsvProfileRegistry([oldCopy])
    expect(registry.profiles.filter(profile => profile.id === system.id)).toHaveLength(1)
    expect(registry.shadowedProfiles).toContain(oldCopy)
  })

})
