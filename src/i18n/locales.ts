/**
 * Supported UI locales — single source for routing, cookies, and date formatting.
 */

export const LOCALES = ['en', 'de', 'fr'] as const

export type AppLocale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: AppLocale = 'de'

export const LOCALE_META: Record<
  AppLocale,
  { flag: string; label: string; bcp47: string }
> = {
  de: { flag: '🇩🇪', label: 'Deutsch', bcp47: 'de-DE' },
  en: { flag: '🇬🇧', label: 'English', bcp47: 'en-US' },
  fr: { flag: '🇫🇷', label: 'Français', bcp47: 'fr-FR' },
}

export function isAppLocale(value: string | null | undefined): value is AppLocale {
  return value === 'en' || value === 'de' || value === 'fr'
}

/** BCP 47 tag for Intl / toLocaleDateString */
export function toBcp47(locale: string | null | undefined): string {
  if (locale === 'de') return LOCALE_META.de.bcp47
  if (locale === 'fr') return LOCALE_META.fr.bcp47
  return LOCALE_META.en.bcp47
}

/** Parse Accept-Language primary tag to a supported locale, or null. */
export function parseAcceptLanguage(header: string): AppLocale | null {
  const primary = header.split(',')[0]?.split(';')[0]?.trim().split('-')[0]?.toLowerCase()
  if (primary === 'de') return 'de'
  if (primary === 'en') return 'en'
  if (primary === 'fr') return 'fr'
  return null
}
