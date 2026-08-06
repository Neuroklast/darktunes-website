import { getRequestConfig } from 'next-intl/server'
import { cookies, headers } from 'next/headers'
import { SITE_SETTINGS_DEFAULTS } from '@/lib/api/siteSettings'
import { resolveBrandFromSettings } from '@/lib/brand'
import { brandI18nValues } from '@/lib/brand/i18nValues'
import { getCachedSiteSettings } from '@/lib/cache/publicQueries'
import { resolveBrandPlaceholders } from '@/i18n/resolveBrandPlaceholders'
import type { Locale } from './types'
import { isAppLocale, parseAcceptLanguage } from './locales'
import { routing } from './routing'

export default getRequestConfig(async () => {
  const cookieStore = await cookies()
  const headerStore = await headers()

  const cookieLocale = cookieStore.get('NEXT_LOCALE')?.value
  let locale: Locale = routing.defaultLocale

  const pathname = headerStore.get('x-pathname') ?? ''

  if (isAppLocale(cookieLocale)) {
    locale = cookieLocale
  } else {
    const fromHeader = parseAcceptLanguage(headerStore.get('accept-language') ?? '')
    if (fromHeader) {
      locale = fromHeader
    } else {
      locale = pathname.startsWith('/portal') ? 'en' : routing.defaultLocale
    }
  }

  const { loadMessages, resolveBundle } = await import('./loadMessages')
  const bundle = resolveBundle(pathname)
  const rawMessages = await loadMessages(locale, bundle)
  const settings =
    (await getCachedSiteSettings().catch(() => null)) ?? SITE_SETTINGS_DEFAULTS
  const brand = brandI18nValues(resolveBrandFromSettings(settings))

  return {
    locale,
    messages: resolveBrandPlaceholders(rawMessages, brand),
  }
})