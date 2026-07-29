'use client'

/**
 * High-visibility disclaimer for public / third-party analytics figures
 * (e.g. scraped Spotify popularity). Not settlement data — non-binding.
 * Do not name scrape vendors in UI copy.
 */

import { useTranslations } from 'next-intl'
import { WarningCircle } from '@phosphor-icons/react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { cn } from '@/lib/utils'

const WHY_KEYS = [
  'analytics_public_metrics_disclaimer_why_1',
  'analytics_public_metrics_disclaimer_why_2',
  'analytics_public_metrics_disclaimer_why_3',
  'analytics_public_metrics_disclaimer_why_4',
  'analytics_public_metrics_disclaimer_why_5',
  'analytics_public_metrics_disclaimer_why_6',
] as const

interface PublicMetricsDisclaimerProps {
  className?: string
  /** Compact: lead + source-of-truth only (e.g. page chrome). Full adds why + legal. */
  variant?: 'full' | 'compact'
}

export function PublicMetricsDisclaimer({
  className,
  variant = 'full',
}: PublicMetricsDisclaimerProps) {
  const t = useTranslations('portal')

  return (
    <Alert
      role="alert"
      className={cn(
        'border-2 border-amber-500/70 bg-amber-500/15 text-foreground shadow-sm',
        'dark:bg-amber-500/10 dark:border-amber-400/60',
        '[&>svg]:text-amber-700 dark:[&>svg]:text-amber-300',
        'items-start',
        className,
      )}
    >
      <WarningCircle className="size-5 shrink-0" weight="fill" aria-hidden="true" />
      <AlertTitle className="line-clamp-none text-base font-semibold text-amber-950 dark:text-amber-100">
        {t('analytics_public_metrics_disclaimer_title')}
      </AlertTitle>
      <AlertDescription className="col-start-2 space-y-3 text-sm text-foreground/95">
        <p className="font-medium leading-relaxed">
          {t('analytics_public_metrics_disclaimer_lead')}
        </p>
        <p className="leading-relaxed border-l-2 border-amber-600/50 pl-3 text-foreground/90">
          {t('analytics_public_metrics_disclaimer_truth')}
        </p>

        {variant === 'full' && (
          <>
            <details className="rounded-md border border-amber-600/30 bg-background/40 open:bg-background/60">
              <summary className="cursor-pointer select-none px-3 py-2.5 min-h-[44px] flex items-center text-sm font-semibold text-amber-950 dark:text-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-md">
                {t('analytics_public_metrics_disclaimer_why_title')}
              </summary>
              <ul className="list-disc space-y-2 px-3 pb-3 pl-8 text-sm leading-relaxed text-foreground/90">
                {WHY_KEYS.map((key) => (
                  <li key={key}>{t(key)}</li>
                ))}
              </ul>
            </details>

            <details className="rounded-md border border-amber-600/30 bg-background/40 open:bg-background/60">
              <summary className="cursor-pointer select-none px-3 py-2.5 min-h-[44px] flex items-center text-sm font-semibold text-amber-950 dark:text-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-md">
                {t('analytics_public_metrics_disclaimer_legal_title')}
              </summary>
              <div className="space-y-2 px-3 pb-3 text-sm leading-relaxed text-foreground/90">
                <p>{t('analytics_public_metrics_disclaimer_legal_1')}</p>
                <p>{t('analytics_public_metrics_disclaimer_legal_2')}</p>
                <p>{t('analytics_public_metrics_disclaimer_legal_3')}</p>
              </div>
            </details>
          </>
        )}
      </AlertDescription>
    </Alert>
  )
}
