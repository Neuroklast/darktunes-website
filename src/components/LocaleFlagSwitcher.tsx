'use client'

/**
 * LocaleFlagSwitcher — flag button showing the active locale; opens a menu
 * to pick Deutsch / English / Français. Sets NEXT_LOCALE and refreshes RSC tree.
 */

import { useLocale } from 'next-intl'
import { useRouter } from 'next/navigation'
import { Check } from '@phosphor-icons/react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
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
  const router = useRouter()
  const currentMeta = LOCALE_META[locale as AppLocale] ?? LOCALE_META.de

  const selectLocale = (next: Locale) => {
    if (next === locale) return
    setLocaleCookie(next)
    router.refresh()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            'min-w-[44px] min-h-[44px] gap-1.5 border border-border/40 px-2 py-1 text-base leading-none hover:border-accent/40',
            size === 'md' && 'px-2.5',
            className,
          )}
          aria-label={`Language: ${currentMeta.label}. Open language menu`}
        >
          <span aria-hidden="true" className="text-lg leading-none">
            {currentMeta.flag}
          </span>
          <span className="sr-only">{currentMeta.label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="min-w-[10rem]">
        {LOCALES.map((code) => {
          const option = LOCALE_META[code]
          const selected = code === locale
          return (
            <DropdownMenuItem
              key={code}
              onSelect={() => selectLocale(code)}
              className="cursor-pointer gap-2"
              aria-checked={selected}
              role="menuitemradio"
            >
              <span aria-hidden="true" className="text-base leading-none">
                {option.flag}
              </span>
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
