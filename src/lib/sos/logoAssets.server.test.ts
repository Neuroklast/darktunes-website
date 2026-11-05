import { describe, expect, it, vi } from 'vitest'
import { compactSosLogo, hydrateSosLogo } from './logoAssets.server'
import { normalizeAccountingConfig } from './sosAccountingSettings'

const LOGO = 'data:image/png;base64,aGVsbG8='

function mockDb() {
  const upsert = vi.fn().mockResolvedValue({ error: null })
  const maybeSingle = vi.fn().mockResolvedValue({
    data: { data_url: LOGO },
    error: null,
  })
  const eq = vi.fn(() => ({ maybeSingle }))
  const select = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ upsert, select }))
  return { db: { from } as never, from, upsert, select, eq, maybeSingle }
}

describe('shared SOS logo assets', () => {
  it('stores only one content-addressed logo reference in workspace config', async () => {
    const { db, upsert } = mockDb()
    const config = normalizeAccountingConfig({ labelInfo: { logo: LOGO, logoBase64: LOGO } })
    const compact = await compactSosLogo(db, config)
    expect(upsert).toHaveBeenCalledTimes(1)
    const id = compact.labelInfo.logoAssetId
    expect(id).toMatch(/^[0-9a-f]{32}$/)
    expect(compact.labelInfo.logo).toBeUndefined()
    expect(compact.labelInfo.logoBase64).toBeUndefined()
    expect(upsert).toHaveBeenCalledWith({ id, data_url: LOGO }, {
      onConflict: 'id', ignoreDuplicates: true,
    })
    const restored = await hydrateSosLogo(db, compact)
    expect(restored.labelInfo.logo).toBe(LOGO)
    expect(restored.labelInfo.logoBase64).toBe(LOGO)
  })

  it('preserves legacy inline logos without requiring an asset lookup', async () => {
    const { db, from } = mockDb()
    const config = normalizeAccountingConfig({ labelInfo: { logo: LOGO } })
    expect((await hydrateSosLogo(db, config)).labelInfo.logo).toBe(LOGO)
    expect(from).not.toHaveBeenCalled()
  })

  it('does not write an asset for logo-free settings', async () => {
    const { db, from } = mockDb()
    const config = normalizeAccountingConfig({})
    expect(await compactSosLogo(db, config)).toEqual(config)
    expect(from).not.toHaveBeenCalled()
  })

  it('fails closed when a referenced logo is missing', async () => {
    const { db, maybeSingle } = mockDb()
    maybeSingle.mockResolvedValue({ data: null, error: null })
    const config = normalizeAccountingConfig({ labelInfo: { logoAssetId: 'deadbeef' } })
    await expect(hydrateSosLogo(db, config)).rejects.toThrow('missing')
  })
})
