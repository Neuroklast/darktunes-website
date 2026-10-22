'use client'

import { useEffect } from 'react'
import type { FallbackProps } from 'react-error-boundary'
import { useTranslations } from 'next-intl'
import { Alert, AlertTitle, AlertDescription } from './components/ui/alert'
import { Button } from './components/ui/button'
import { Warning, ArrowsClockwise } from '@phosphor-icons/react'
import { reportClientError } from '@/lib/clientErrorReporter'

/**
 * Last-resort client error boundary.
 *
 * Production must never render raw exception messages: they can contain SQL,
 * internal URLs, tokens, or stack details. Show a safe explanation plus an
 * optional React error digest that support can match to server logs.
 */
export const ErrorFallback = ({ error, resetErrorBoundary }: FallbackProps) => {
  const t = useTranslations('errors')
  const reference =
    error instanceof Error && typeof (error as Error & { digest?: unknown }).digest === 'string'
      ? ((error as Error & { digest: string }).digest)
      : null

  useEffect(() => {
    reportClientError('ui', error, { boundary: 'ErrorFallback' })
  }, [error])

  if (process.env.NODE_ENV === 'development') throw error

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4">
        <Alert variant="destructive">
          <Warning size={20} />
          <AlertTitle>{t('ERROR_BOUNDARY_TITLE')}</AlertTitle>
          <AlertDescription>{t('ERROR_BOUNDARY_BODY')}</AlertDescription>
        </Alert>

        {reference ? (
          <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            {t('ERROR_BOUNDARY_REFERENCE', { reference })}
          </p>
        ) : null}

        <Button onClick={resetErrorBoundary} className="w-full" variant="outline">
          <ArrowsClockwise size={16} className="mr-2" aria-hidden />
          {t('ERROR_BOUNDARY_RETRY')}
        </Button>
      </div>
    </div>
  )
}
