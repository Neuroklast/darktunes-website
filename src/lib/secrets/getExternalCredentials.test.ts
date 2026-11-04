import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { encryptCredential } from '@/lib/secrets/credentialCrypto'
import {
  getApiCredential,
  getKnownApiConfiguration,
  getSyncCredentials,
  invalidateCredentialCache,
} from './getExternalCredentials'

type DbClient = SupabaseClient<Database>
type CredentialRow = { key: string; value: string }

function makeCredentialsBuilder(rows: CredentialRow[] = [], gate?: Promise<void>) {
  const result = Promise.resolve().then(async () => {
    await gate
    return { data: [...rows], error: null }
  })
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    then: result.then.bind(result),
    catch: result.catch.bind(result),
    finally: result.finally.bind(result),
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
  credentialRows?: CredentialRow[]
  gate?: Promise<void>
}): DbClient {
  return {
    from: vi.fn((table: string) => {
      if (table === 'api_credentials') return makeCredentialsBuilder(opts.credentialRows, opts.gate)
      if (table === 'artists') return makeCountBuilder(opts.publicBandsintownKeys ?? 0)
      if (table === 'artist_private_data') {
        return makeCountBuilder(opts.privateBandsintownKeys ?? 0)
      }
      return makeCredentialsBuilder()
    }),
  } as unknown as DbClient
}

beforeEach(() => {
  invalidateCredentialCache()
  vi.stubEnv(
    'API_CREDENTIALS_ENCRYPTION_KEY',
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  )
})

describe('getKnownApiConfiguration', () => {
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

  it('reads credential status once without decrypting secret values', async () => {
    // Prefix proves configured status; payload is intentionally undecryptable.
    const db = makeConfigDb({
      credentialRows: [
        { key: 'spotify_client_id', value: 'v1:unreadable' },
        { key: 'spotify_client_secret', value: 'v1:unreadable' },
        { key: 'nvidia_api_key', value: 'v1:unreadable' },
      ],
    })
    const config = await getKnownApiConfiguration(db)
    expect(config.spotify).toBe(true)
    expect(config.nvidia).toBe(true)
    const calls = (db.from as ReturnType<typeof vi.fn>).mock.calls
    expect(calls.filter(([table]) => table === 'api_credentials')).toHaveLength(1)
  })
})

describe('credential cache', () => {
  it('loads all configured secrets in one query even for parallel getters', async () => {
    const rows = [
      { key: 'spotify_client_id', value: encryptCredential('spotify-id') },
      { key: 'spotify_client_secret', value: encryptCredential('spotify-secret') },
      { key: 'discogs_token', value: encryptCredential('discogs-value') },
    ]
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => { release = resolve })
    const db = makeConfigDb({ credentialRows: rows, gate })

    const sync = getSyncCredentials(db)
    const single = getApiCredential(db, 'discogs_token')
    const missing = getApiCredential(db, 'songkick_api_key')

    expect((db.from as ReturnType<typeof vi.fn>).mock.calls.filter(([t]) => t === 'api_credentials'))
      .toHaveLength(1)
    release?.()

    expect(await sync).toEqual({
      spotify: { clientId: 'spotify-id', clientSecret: 'spotify-secret' },
      discogsToken: 'discogs-value',
      songkickApiKey: undefined,
      bandsintownApiKey: undefined,
      odesliApiKey: undefined,
    })
    expect(await single).toBe('discogs-value')
    expect(await missing).toBeNull()
    expect((db.from as ReturnType<typeof vi.fn>).mock.calls.filter(([t]) => t === 'api_credentials'))
      .toHaveLength(1)
  })

  it('caches missing keys and refreshes both values and misses after invalidation', async () => {
    const rows: CredentialRow[] = []
    const db = makeConfigDb({ credentialRows: rows })

    expect(await getApiCredential(db, 'nvidia_api_key')).toBeNull()
    expect(await getApiCredential(db, 'nvidia_api_key')).toBeNull()
    expect((db.from as ReturnType<typeof vi.fn>).mock.calls.filter(([t]) => t === 'api_credentials'))
      .toHaveLength(1)

    rows.push({ key: 'nvidia_api_key', value: encryptCredential('new-secret') })
    expect(await getApiCredential(db, 'nvidia_api_key')).toBeNull()
    invalidateCredentialCache()
    expect(await getApiCredential(db, 'nvidia_api_key')).toBe('new-secret')
    expect((db.from as ReturnType<typeof vi.fn>).mock.calls.filter(([t]) => t === 'api_credentials'))
      .toHaveLength(2)
  })

  it('does not re-populate the cache with an invalidated in-flight result', async () => {
    const oldRows = [{ key: 'nvidia_api_key', value: encryptCredential('old') }]
    const newRows = [{ key: 'nvidia_api_key', value: encryptCredential('new') }]
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => { release = resolve })
    const dbOld = makeConfigDb({ credentialRows: oldRows, gate })
    const dbNew = makeConfigDb({ credentialRows: newRows })

    const oldLoad = getApiCredential(dbOld, 'nvidia_api_key')
    invalidateCredentialCache()
    expect(await getApiCredential(dbNew, 'nvidia_api_key')).toBe('new')
    release?.()
    expect(await oldLoad).toBe('old')
    expect(await getApiCredential(dbNew, 'nvidia_api_key')).toBe('new')
    expect((dbNew.from as ReturnType<typeof vi.fn>).mock.calls.filter(([t]) => t === 'api_credentials'))
      .toHaveLength(1)
  })
})
