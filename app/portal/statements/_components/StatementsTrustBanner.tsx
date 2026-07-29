'use client'

/**
 * Page-level trust banner: SOS provenance vs Spotify for Artists / public metrics.
 */

import { useTranslations } from 'next-intl'
import { ShieldCheck } from '@phosphor-icons/react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

export function StatementsTrustBanner() {
  const t = useTranslations('portal')

  return (
    <Alert
      role="region"
      aria-label={t('statements_trust_title')}
      className="border-2 border-emerald-600/50 bg-emerald-500/10 text-foreground [&>svg]:text-emerald-700 dark:[&>svg]:text-emerald-300"
    >
      <ShieldCheck className="size-5" weight="fill" aria-hidden="true" />
      <AlertTitle className="line-clamp-none text-base font-semibold text-emerald-950 dark:text-emerald-100">
        {t('statements_trust_title')}
      </AlertTitle>
      <AlertDescription className="col-start-2 space-y-2 text-sm text-foreground/95">
        <p className="leading-relaxed">{t('statements_trust_lead')}</p>
        <ul className="list-disc space-y-1 pl-5 text-xs sm:text-sm leading-relaxed">
          <li>{t('statements_trust_point_1')}</li>
          <li>{t('statements_trust_point_2')}</li>
          <li>{t('statements_trust_point_3')}</li>
        </ul>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {t('statements_trust_s4a_note')}
        </p>
      </AlertDescription>
    </Alert>
  )
}
