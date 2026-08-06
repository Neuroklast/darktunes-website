'use client'

/**
 * LocaleFlagSwitcher — flag button showing the active locale; opens a menu
 * to pick Deutsch / English / Français. Sets NEXT_LOCALE and reloads.
 *
 * Uses SVG flags (not emoji) so Windows does not show "DE"/"GB"/"FR" letters.
 * Uses full reload so admin/portal shells always pick up the new locale cookie
 * (router.refresh() is slow/unreliable on force-dynamic dashboards).
 */

import { useLocale } from 'next-intl'
import { Check } from '@phosphor-icons/react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { LocaleFlagIcon } from '@/components/LocaleFlagIcon'
import { SECONDS_PER_YEAR } from '@/lib/datetime/constants'
import { cn } from '@/lib/utils'
import { LOCALES, LOCALE_META, type AppLocale } from '@/i18n/locales'
import type { Locale } from '@/i18n/types'

function setLocaleCookie(locale: Locale) {
  document.cookie = `NEXT_LOCALE=${locale}; path=/; max-age=${SECONDS_PER_YEAR}; samesite=lax`
}

interface LocaleFlagSwitcherProps {
  className?: string
  size?: 'sm' | 'md'
  align?: 'start' | 'center' | 'end'
}

export function LocaleFlagSwitcher({
  className,
  size = 'sm',
  align = 'end',
}: LocaleFlagSwitcherProps) {
  const locale = useLocale() as Locale
  const currentCode = (LOCALES.includes(locale as AppLocale) ? locale : 'de') as AppLocale
  const currentMeta = LOCALE_META[currentCode]

  const selectLocale = (next: Locale) => {
    if (next === locale) return
    setLocaleCookie(next)
    // Full reload: cookie-based next-intl + heavy portal/admin RSC trees need a
    // hard navigation for a snappy, reliable language change.
    window.location.reload()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            'min-w-[44px] min-h-[44px] gap-1.5 border border-border/40 px-2 py-1 hover:border-accent/40',
            size === 'md' && 'px-2.5',
            className,
          )}
          aria-label={`Language: ${currentMeta.label}. Open language menu`}
        >
          <LocaleFlagIcon locale={currentCode} className="h-4 w-6" title={currentMeta.label} />
          <span className="sr-only">{currentMeta.label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="min-w-[11rem]">
        {LOCALES.map((code) => {
          const option = LOCALE_META[code]
          const selected = code === currentCode
          return (
            <DropdownMenuItem
              key={code}
              onSelect={(event) => {
                // Keep menu from swallowing the navigation on slow shells
                event.preventDefault()
                selectLocale(code)
              }}
              className="cursor-pointer gap-2.5"
              aria-checked={selected}
              role="menuitemradio"
            >
              <LocaleFlagIcon locale={code} className="h-3.5 w-[21px]" />
              <span className="flex-1">{option.label}</span>
              {selected ? (
                <Check size={16} weight="bold" className="text-accent" aria-hidden="true" />
              ) : (
                <span className="w-4" aria-hidden="true" />
              )}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
