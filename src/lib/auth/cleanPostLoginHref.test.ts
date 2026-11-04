import { describe, expect, it } from 'vitest'
import { cleanPostLoginHref } from './cleanPostLoginHref'

describe('cleanPostLoginHref', () => {
  it('removes a stale unauthorized error after successful sign-in', () => {
    expect(cleanPostLoginHref('?error=unauthorized')).toBe('/login')
  })

  it('removes a stale artist membership error after successful sign-in', () => {
    expect(cleanPostLoginHref('?error=no_artist')).toBe('/login')
  })

  it('preserves a safe deep link without old errors', () => {
    expect(cleanPostLoginHref('?error=unauthorized&returnTo=%2Fadmin%2Freleases%3Ftab%3Dnew'))
      .toBe('/login?returnTo=%2Fadmin%2Freleases%3Ftab%3Dnew')
  })

  it('preserves an OAuth consent return path', () => {
    expect(cleanPostLoginHref('?returnTo=%2Foauth%2Fconsent%3Fauthorization_id%3Dabc'))
      .toBe('/login?returnTo=%2Foauth%2Fconsent%3Fauthorization_id%3Dabc')
  })

  it.each([
    '?returnTo=https%3A%2F%2Fevil.example%2F',
    '?returnTo=%2F%2Fevil.example',
    '?returnTo=%2F%5Cevil.example',
    '?returnTo=%2Flogin',
    '?returnTo=%2Flogin%3Ferror%3Dunauthorized',
  ])('rejects an external or recursive return path: %s', (query) => {
    expect(cleanPostLoginHref(query)).toBe('/login')
  })
})
