/**
 * Inline SVG flags — emoji flags render as "DE"/"GB"/"FR" letters on many
 * Windows systems, so we never use regional-indicator emoji for the switcher.
 */

import type { AppLocale } from '@/i18n/locales'
import { cn } from '@/lib/utils'

interface LocaleFlagIconProps {
  locale: AppLocale
  className?: string
  title?: string
}

export function LocaleFlagIcon({ locale, className, title }: LocaleFlagIconProps) {
  const common = cn('inline-block shrink-0 rounded-[2px] shadow-sm ring-1 ring-black/10', className)

  if (locale === 'de') {
    return (
      <svg
        viewBox="0 0 24 16"
        className={common}
        aria-hidden={title ? undefined : true}
        role={title ? 'img' : undefined}
        aria-label={title}
      >
        {title ? <title>{title}</title> : null}
        <rect width="24" height="16" fill="#000" />
        <rect y="5.33" width="24" height="5.34" fill="#D00" />
        <rect y="10.67" width="24" height="5.33" fill="#FFCE00" />
      </svg>
    )
  }

  if (locale === 'fr') {
    return (
      <svg
        viewBox="0 0 24 16"
        className={common}
        aria-hidden={title ? undefined : true}
        role={title ? 'img' : undefined}
        aria-label={title}
      >
        {title ? <title>{title}</title> : null}
        <rect width="8" height="16" fill="#002395" />
        <rect x="8" width="8" height="16" fill="#FFF" />
        <rect x="16" width="8" height="16" fill="#ED2939" />
      </svg>
    )
  }

  // English — simplified Union Jack (readable at 24×16)
  return (
    <svg
      viewBox="0 0 24 16"
      className={common}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      aria-label={title}
    >
      {title ? <title>{title}</title> : null}
      <rect width="24" height="16" fill="#012169" />
      <path d="M0 0 L24 16 M24 0 L0 16" stroke="#FFF" strokeWidth="3.2" />
      <path d="M0 0 L24 16 M24 0 L0 16" stroke="#C8102E" strokeWidth="1.6" />
      <path d="M12 0 V16 M0 8 H24" stroke="#FFF" strokeWidth="5" />
      <path d="M12 0 V16 M0 8 H24" stroke="#C8102E" strokeWidth="2.6" />
    </svg>
  )
}
