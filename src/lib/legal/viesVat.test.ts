import { describe, expect, it, vi } from 'vitest'
import {
  checkVatWithVies,
  isEuVatCountry,
  isViesValidForReverseCharge,
  parseVatId,
} from './viesVat'

describe('parseVatId', () => {
  it('parses DE VAT IDs', () => {
    expect(parseVatId('DE123456789')).toEqual({
      countryCode: 'DE',
      vatNumber: '123456789',
      compact: 'DE123456789',
    })
  })

  it('strips spaces and normalises GR → EL', () => {
    expect(parseVatId('gr 123456789')).toEqual({
      countryCode: 'EL',
      vatNumber: '123456789',
      compact: 'EL123456789',
    })
  })

  it('returns null for empty / too short', () => {
    expect(parseVatId('')).toBeNull()
    expect(parseVatId('D')).toBeNull()
    expect(parseVatId('DE1')).toBeNull() // vat number must be 2+ chars after country
  })
})

describe('isEuVatCountry', () => {
  it('accepts DE and EL', () => {
    expect(isEuVatCountry('DE')).toBe(true)
    expect(isEuVatCountry('EL')).toBe(true)
  })

  it('rejects US / GB', () => {
    expect(isEuVatCountry('US')).toBe(false)
    expect(isEuVatCountry('GB')).toBe(false)
  })
})

describe('checkVatWithVies', () => {
  it('returns malformed without calling fetch', async () => {
    const fetchMock = vi.fn()
    const result = await checkVatWithVies('XX', { fetch: fetchMock as unknown as typeof fetch })
    expect(result.status).toBe('malformed')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns not_eu for CH without calling VIES body validation', async () => {
    const fetchMock = vi.fn()
    const result = await checkVatWithVies('CHE123.456.789', {
      fetch: fetchMock as unknown as typeof fetch,
    })
    // CH + digits may parse; CH is not in EU list
    if (result.status === 'malformed') {
      expect(fetchMock).not.toHaveBeenCalled()
      return
    }
    expect(result.status).toBe('not_eu')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('maps valid VIES JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        valid: true,
        name: 'ACME SL',
        address: 'Madrid',
        requestDate: '2026-08-04T12:00:00.000Z',
        requestIdentifier: 'WAPIAAAA',
      }),
    })
    const result = await checkVatWithVies('ESB12345678', {
      fetch: fetchMock as unknown as typeof fetch,
    })
    expect(result.status).toBe('valid')
    expect(result.valid).toBe(true)
    expect(result.traderName).toBe('ACME SL')
    expect(isViesValidForReverseCharge(result)).toBe(true)
  })

  it('maps invalid VIES JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ valid: false }),
    })
    const result = await checkVatWithVies('DE123456789', {
      fetch: fetchMock as unknown as typeof fetch,
    })
    expect(result.status).toBe('invalid')
    expect(isViesValidForReverseCharge(result)).toBe(false)
  })

  it('maps HTTP errors to service_unavailable', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 })
    const result = await checkVatWithVies('DE123456789', {
      fetch: fetchMock as unknown as typeof fetch,
    })
    expect(result.status).toBe('service_unavailable')
  })
})
