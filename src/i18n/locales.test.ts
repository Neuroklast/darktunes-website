import { describe, expect, it } from 'vitest'
import {
  isAppLocale,
  LOCALES,
  parseAcceptLanguage,
  toBcp47,
} from './locales'

describe('locales', () => {
  it('includes en, de, and fr', () => {
    expect([...LOCALES].sort()).toEqual(['de', 'en', 'fr'])
  })

  it('isAppLocale accepts only supported codes', () => {
    expect(isAppLocale('fr')).toBe(true)
    expect(isAppLocale('en')).toBe(true)
    expect(isAppLocale('de')).toBe(true)
    expect(isAppLocale('es')).toBe(false)
    expect(isAppLocale(undefined)).toBe(false)
  })

  it('parseAcceptLanguage maps primary tags', () => {
    expect(parseAcceptLanguage('fr-FR,fr;q=0.9')).toBe('fr')
    expect(parseAcceptLanguage('de-DE,de;q=0.9')).toBe('de')
    expect(parseAcceptLanguage('en-US,en;q=0.8')).toBe('en')
    expect(parseAcceptLanguage('es-ES')).toBeNull()
  })

  it('toBcp47 maps UI locales to Intl tags', () => {
    expect(toBcp47('fr')).toBe('fr-FR')
    expect(toBcp47('de')).toBe('de-DE')
    expect(toBcp47('en')).toBe('en-US')
    expect(toBcp47('unknown')).toBe('en-US')
  })
})
