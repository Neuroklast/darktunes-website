'use client'

import Link from 'next/link'
import { ArrowClockwise, Warning } from '@phosphor-icons/react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { ERROR_CODES } from '@/lib/errorCodes'
import {
  assistantErrorKey,
  type AssistantAudience,
} from '@/lib/ai/presentation/errors'
import type { UiError } from '@/components/ai/types'

export function AssistantError({
  error,
  audience,
  onRetry,
  onRetryFast,
  onSelectArtist,
  canSelectArtist,
  showTechnical,
}: {
  error: UiError
  audience: AssistantAudience
  onRetry?: () => void
  onRetryFast?: () => void
  onSelectArtist?: () => void
  canSelectArtist?: boolean
  showTechnical?: boolean
}) {
  const t = useTranslations('ai')
  const tErrorsRaw = useTranslations('errors')
  const tErrors = tErrorsRaw as unknown as (key: string) => string
  const messageKey = (ERROR_CODES as readonly string[]).includes(error.code)
    ? assistantErrorKey(error.code, audience)
    : 'SERVER_ERROR'
  const message = tErrors(messageKey)
  const canRetry = error.retryable && Boolean(onRetry)
  const canRetryFast = error.suggestedModelRole === 'fast' && Boolean(onRetryFast)
  const showArtistAction =
    canSelectArtist &&
    Boolean(onSelectArtist) &&
    (error.code === 'AI_ARTIST_INVALID' ||
      error.code === 'AI_ARTIST_FORBIDDEN' ||
      error.code === 'FORBIDDEN_NO_ARTIST')
  const showAdminAction = audience === 'admin' && error.code === 'AI_DISABLED'

  return (
    <div
      className="rounded-lg border border-destructive/35 bg-destructive/5 p-3"
      role="alert"
      aria-live="assertive"
    >
      <div className="flex items-start gap-2">
        <Warning className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm leading-relaxed text-foreground">{message}</p>
          <div className="flex flex-wrap gap-2">
            {canRetry ? (
              <Button type="button" size="sm" variant="secondary" onClick={onRetry}>
                <ArrowClockwise className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                {t('retry')}
              </Button>
            ) : null}
            {canRetryFast ? (
              <Button type="button" size="sm" variant="outline" onClick={onRetryFast}>
                {t('retryWithFast')}
              </Button>
            ) : null}
            {showArtistAction ? (
              <Button type="button" size="sm" variant="outline" onClick={onSelectArtist}>
                {t('selectArtist')}
              </Button>
            ) : null}
            {showAdminAction ? (
              <Button asChild size="sm" variant="outline">
                <Link href="/admin/ai">{t('openAdminAi')}</Link>
              </Button>
            ) : null}
          </div>
          {showTechnical ? (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer select-none">{t('technicalDetails')}</summary>
              <p className="mt-1 break-words font-mono text-[11px]">
                {error.code}
                {error.detail ? ` — ${error.detail}` : ''}
              </p>
            </details>
          ) : null}
        </div>
      </div>
    </div>
  )
}
