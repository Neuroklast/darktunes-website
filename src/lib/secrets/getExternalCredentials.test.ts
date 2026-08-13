import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import {
  getKnownApiConfiguration,
  invalidateCredentialCache,
} from './getExternalCredentials'

type DbClient = SupabaseClient<Database>

function makeCredentialsBuilder() {
  const result = { data: [], error: null }
  const p = Promise.resolve(result)
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    then: p.then.bind(p),
    catch: p.catch.bind(p),
    finally: p.finally.bind(p),
  }
}

function makeCountBuilder(count: number) {
  const result = { count, error: null }
  const p = Promise.resolve(result)
  return {
    select: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    then: p.then.bind(p),
    catch: p.catch.bind(p),
    finally: p.finally.bind(p),
  }
}

function makeConfigDb(opts: {
  publicBandsintownKeys?: number
  privateBandsintownKeys?: number
}): DbClient {
  return {
    from: vi.fn((table: string) => {
      if (table === 'api_credentials') return makeCredentialsBuilder()
      if (table === 'artists') return makeCountBuilder(opts.publicBandsintownKeys ?? 0)
      if (table === 'artist_private_data') {
        return makeCountBuilder(opts.privateBandsintownKeys ?? 0)
      }
      return makeCredentialsBuilder()
    }),
  } as unknown as DbClient
}

describe('getKnownApiConfiguration', () => {
  beforeEach(() => {
    invalidateCredentialCache()
    vi.stubEnv(
      'API_CREDENTIALS_ENCRYPTION_KEY',
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    )
  })

  it('treats Bandsintown as configured when only artist_private_data keys exist', async () => {
    const db = makeConfigDb({ publicBandsintownKeys: 0, privateBandsintownKeys: 2 })
    const config = await getKnownApiConfiguration(db)
    expect(config.bandsintown).toBe(true)
    expect(db.from).toHaveBeenCalledWith('artist_private_data')
  })

  it('still treats Bandsintown as configured from leftover public columns', async () => {
    const db = makeConfigDb({ publicBandsintownKeys: 1, privateBandsintownKeys: 0 })
    const config = await getKnownApiConfiguration(db)
    expect(config.bandsintown).toBe(true)
  })

  it('treats Bandsintown as unconfigured when no global or per-artist key exists', async () => {
    const db = makeConfigDb({ publicBandsintownKeys: 0, privateBandsintownKeys: 0 })
    const config = await getKnownApiConfiguration(db)
    expect(config.bandsintown).toBe(false)
  })
})
