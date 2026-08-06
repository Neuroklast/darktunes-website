import { defineRouting } from 'next-intl/routing'
import { SECONDS_PER_YEAR } from '@/lib/datetime/constants'
import { DEFAULT_LOCALE, LOCALES } from './locales'

export const routing = defineRouting({
  locales: [...LOCALES],
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: 'never',
  localeCookie: {
    name: 'NEXT_LOCALE',
    maxAge: SECONDS_PER_YEAR,
  },
})