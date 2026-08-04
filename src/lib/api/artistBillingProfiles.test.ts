import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import {
  getBillingProfile,
  upsertBillingProfile,
  isBillingProfileComplete,
  type ArtistBillingProfile,
} from './artistBillingProfiles'

type DbClient = SupabaseClient<Database>
type BillingProfileRow = Database['public']['Tables']['artist_billing_profiles']['Row']

function makeBuilder(data: unknown = null, error: unknown = null) {
  const result = { data, error }
  const p = Promise.resolve(result)
  return {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    then: p.then.bind(p),
    catch: p.catch.bind(p),
    finally: p.finally.bind(p),
  }
}

function makeMockDb(data: unknown = null, error: unknown = null): DbClient {
  return { from: vi.fn().mockReturnValue(makeBuilder(data, error)) } as unknown as DbClient
}

const mockRow: BillingProfileRow = {
  id: 'bp-uuid-1',
  artist_id: 'artist-uuid',
  legal_name: 'Max Mustermann',
  street: 'Musterstraße 1',
  postal_code: '12345',
  city: 'Berlin',
  country: 'DE',
  tax_number: 'DE123456789',
  vat_id: null,
  is_small_business: false,
  tax_status: 'standard',
  iban: 'DE89370400440532013000',
  bic: 'COBADEFFXXX',
  paypal_email: null,
  vat_vies_valid: null,
  vat_vies_checked_at: null,
  vat_vies_trader_name: null,
  vat_vies_request_id: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

describe('getBillingProfile', () => {
  it('returns mapped domain object on success', async () => {
    const db = makeMockDb(mockRow)
    const result = await getBillingProfile(db, 'artist-uuid')
    expect(result).not.toBeNull()
    expect(result!.id).toBe('bp-uuid-1')
    expect(result!.artistId).toBe('artist-uuid')
    expect(result!.legalName).toBe('Max Mustermann')
    expect(result!.street).toBe('Musterstraße 1')
    expect(result!.postalCode).toBe('12345')
    expect(result!.city).toBe('Berlin')
    expect(result!.country).toBe('DE')
    expect(result!.taxNumber).toBe('DE123456789')
    expect(result!.vatId).toBeUndefined()
    expect(result!.isSmallBusiness).toBe(false)
    expect(result!.taxStatus).toBe('standard')
    expect(result!.iban).toBe('DE89370400440532013000')
    expect(result!.bic).toBe('COBADEFFXXX')
    expect(result!.paypalEmail).toBeUndefined()
  })

  it('returns null when profile not found (PGRST116)', async () => {
    const db = makeMockDb(null, { code: 'PGRST116', message: 'not found' })
    const result = await getBillingProfile(db, 'artist-uuid')
    expect(result).toBeNull()
  })

  it('throws on database error', async () => {
    const db = makeMockDb(null, { code: '42501', message: 'RLS violation' })
    await expect(getBillingProfile(db, 'artist-uuid')).rejects.toThrow('RLS violation')
  })

  it('maps null optional fields to undefined', async () => {
    const rowWithNulls: BillingProfileRow = {
      ...mockRow,
      tax_number: null,
      vat_id: null,
      iban: null,
      bic: null,
      paypal_email: null,
    }
    const db = makeMockDb(rowWithNulls)
    const result = await getBillingProfile(db, 'artist-uuid')
    expect(result!.taxNumber).toBeUndefined()
    expect(result!.vatId).toBeUndefined()
    expect(result!.iban).toBeUndefined()
    expect(result!.bic).toBeUndefined()
    expect(result!.paypalEmail).toBeUndefined()
  })
})

describe('upsertBillingProfile', () => {
  it('inserts and returns mapped domain object', async () => {
    const db = makeMockDb(mockRow)
    const result = await upsertBillingProfile(db, 'artist-uuid', {
      legalName: 'Max Mustermann',
      street: 'Musterstraße 1',
      postalCode: '12345',
      city: 'Berlin',
      country: 'DE',
      taxNumber: 'DE123456789',
      taxStatus: 'standard',
      isSmallBusiness: false,
      iban: 'DE89370400440532013000',
      bic: 'COBADEFFXXX',
    })
    expect(result.legalName).toBe('Max Mustermann')
    expect(result.taxNumber).toBe('DE123456789')
  })

  it('succeeds when optional fields are omitted', async () => {
    const db = makeMockDb(mockRow)
    const result = await upsertBillingProfile(db, 'artist-uuid', {
      legalName: 'Test Artist',
      street: 'Street 1',
      postalCode: '12345',
      city: 'City',
      country: 'DE',
      taxStatus: 'standard',
      isSmallBusiness: false,
    })
    expect(result.legalName).toBe('Max Mustermann') // mapped from mockRow
  })

  it('throws on database error', async () => {
    const db = makeMockDb(null, { message: 'constraint violation' })
    await expect(
      upsertBillingProfile(db, 'artist-uuid', {
        legalName: 'Test',
        street: 'Street',
        postalCode: '12345',
        city: 'City',
        country: 'DE',
        taxStatus: 'standard',
        isSmallBusiness: false,
      }),
    ).rejects.toThrow('constraint violation')
  })

  it('throws when no data returned', async () => {
    const db = makeMockDb(null, null)
    await expect(
      upsertBillingProfile(db, 'artist-uuid', {
        legalName: 'Test',
        street: 'Street',
        postalCode: '12345',
        city: 'City',
        country: 'DE',
        taxStatus: 'standard',
        isSmallBusiness: false,
      }),
    ).rejects.toThrow('No data returned from upsertBillingProfile')
  })
})

describe('isBillingProfileComplete', () => {
  const completeProfile: ArtistBillingProfile = {
    id: 'bp-1',
    artistId: 'artist-1',
    legalName: 'Max Mustermann',
    street: 'Musterstraße 1',
    postalCode: '12345',
    city: 'Berlin',
    country: 'DE',
    taxNumber: 'DE123456789',
    vatId: undefined,
    isSmallBusiness: false,
    taxStatus: 'standard',
    iban: undefined,
    bic: undefined,
    paypalEmail: undefined,
    vatViesValid: null,
    vatViesCheckedAt: null,
    vatViesTraderName: null,
    vatViesRequestId: null,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  }

  it('returns true for a complete profile with taxNumber', () => {
    expect(isBillingProfileComplete(completeProfile)).toBe(true)
  })

  it('returns true when vatId is provided instead of taxNumber', () => {
    const profile: ArtistBillingProfile = {
      ...completeProfile,
      taxNumber: undefined,
      vatId: 'DE123456789',
    }
    expect(isBillingProfileComplete(profile)).toBe(true)
  })

  it('returns false when profile is null', () => {
    expect(isBillingProfileComplete(null)).toBe(false)
  })

  it('returns false when a required address field is empty', () => {
    const profile: ArtistBillingProfile = { ...completeProfile, city: '' }
    expect(isBillingProfileComplete(profile)).toBe(false)
  })

  it('returns false when both taxNumber and vatId are missing', () => {
    const profile: ArtistBillingProfile = {
      ...completeProfile,
      taxNumber: undefined,
      vatId: undefined,
    }
    expect(isBillingProfileComplete(profile)).toBe(false)
  })

  it('returns false when taxNumber is blank whitespace', () => {
    const profile: ArtistBillingProfile = {
      ...completeProfile,
      taxNumber: '   ',
      vatId: undefined,
    }
    expect(isBillingProfileComplete(profile)).toBe(false)
  })

  it('requires VIES-valid VAT for reverse_charge', () => {
    const base: ArtistBillingProfile = {
      ...completeProfile,
      taxNumber: undefined,
      vatId: 'ESB12345678',
      taxStatus: 'reverse_charge',
      isSmallBusiness: false,
      vatViesValid: null,
    }
    expect(isBillingProfileComplete(base)).toBe(false)
    expect(isBillingProfileComplete({ ...base, vatViesValid: false })).toBe(false)
    expect(isBillingProfileComplete({ ...base, vatViesValid: true })).toBe(true)
  })
})
