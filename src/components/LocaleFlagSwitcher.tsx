'use client'

/**
 * LocaleFlagSwitcher — flag button showing the active locale; opens a menu
 * to pick Deutsch / English / Français. Sets NEXT_LOCALE and reloads.
 *
 * Uses SVG flags (not emoji) so Windows does not show "DE"/"GB"/"FR" letters.
 * Uses full navigation so admin/portal shells always re-render with the new
 * cookie (router.refresh() is slow/unreliable on force-dynamic dashboards).
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

/** Exported for unit tests — writes the NEXT_LOCALE cookie used by next-intl. */
export function setLocaleCookie(locale: Locale): void {
  if (typeof document === 'undefined') return
  const secure =
    typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; secure' : ''
  document.cookie = `NEXT_LOCALE=${locale}; path=/; max-age=${SECONDS_PER_YEAR}; samesite=lax${secure}`
}

/** Full navigation so RSC + SW always see the new cookie (not a soft refresh). */
export function navigateWithNewLocale(): void {
  if (typeof window === 'undefined') return
  // Replace keeps history clean; cache: 'reload' is a hint for fetch, not assign.
  // Bust any document cache with a no-op hash-free assign of the current URL.
  const { pathname, search, hash } = window.location
  window.location.assign(`${pathname}${search}${hash}`)
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
  const currentCode = ((LOCALES as readonly string[]).includes(locale)
    ? locale
    : 'de') as AppLocale
  const currentMeta = LOCALE_META[currentCode]

  const selectLocale = (next: Locale) => {
    if (next === currentCode) return
    setLocaleCookie(next)
    navigateWithNewLocale()
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
          <LocaleFlagIcon locale={currentCode} className="h-4 w-6" />
          <span className="sr-only">{currentMeta.label}</span>
        </Button>
      </DropdownMenuTrigger>
      {/* z-[100] above sticky dashboard headers (z-50) */}
      <DropdownMenuContent align={align} className="z-[100] min-w-[11rem]">
        {LOCALES.map((code) => {
          const option = LOCALE_META[code]
          const selected = code === currentCode
          return (
            <DropdownMenuItem
              key={code}
              onSelect={() => {
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
