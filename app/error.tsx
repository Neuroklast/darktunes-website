'use client'

/**
 * app/error.tsx — Next.js error boundary for route segments.
 *
 * Catches rendering errors in the page tree below the root layout and shows a
 * safe, user-facing message with a retry button. Raw exception messages are
 * never rendered in production; the React digest is shown as a support
 * reference only.
 *
 * Special case — ChunkLoadError:
 *   After a new deployment the old JS chunk hashes no longer exist on the CDN.
 *   Any browser tab opened before the deploy hits 404s when webpack lazy-loads
 *   those chunks. The only reliable fix is a hard reload, so we do that
 *   silently instead of showing an error UI.
 */

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Warning } from '@phosphor-icons/react'
import { hasAttemptedChunkReload, isChunkLoadError, shouldReloadForChunkError } from '@/lib/clientChunkError'
import { reportClientError } from '@/lib/clientErrorReporter'

interface ErrorPageProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  const tErrors = useTranslations('errors')
  const router = useRouter()
  const pathname = usePathname()
  const reference = error.digest ?? null
  const canAnalyze = pathname.startsWith('/admin') || pathname.startsWith('/portal')

  useEffect(() => {
    const storage = typeof window !== 'undefined' ? window.sessionStorage : null
    if (shouldReloadForChunkError(error, storage)) {
      window.location.reload()
      return
    }

    reportClientError('ui', error, {
      boundary: 'app/error.tsx',
      digest: error.digest ?? null,
      path: typeof window !== 'undefined' ? window.location.pathname : null,
    })

    if (process.env.NODE_ENV !== 'production') {
      console.error('[ErrorBoundary]', error)
    }
  }, [error])

  const storage = typeof window !== 'undefined' ? window.sessionStorage : null
  if (isChunkLoadError(error) && !hasAttemptedChunkReload(error, storage)) return null

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="max-w-md w-full border-destructive/40">
        <CardHeader className="text-center pb-2">
          <div className="flex justify-center mb-3">
            <Warning size={48} weight="fill" className="text-destructive" aria-hidden />
          </div>
          <CardTitle className="text-xl">{tErrors('ERROR_BOUNDARY_TITLE')}</CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-muted-foreground text-sm">
            {process.env.NODE_ENV === 'development'
              ? error.message
              : tErrors('ERROR_BOUNDARY_BODY')}
          </p>
          {reference && process.env.NODE_ENV !== 'development' ? (
            <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              {tErrors('ERROR_BOUNDARY_REFERENCE', { reference })}
            </p>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button onClick={reset} variant="default">
              {tErrors('ERROR_BOUNDARY_RETRY')}
            </Button>
            {canAnalyze && reference ? (
              <Button
                variant="outline"
                onClick={() => {
                  if (pathname.startsWith('/admin')) {
                    router.push(`/admin/ai?error_ref=${encodeURIComponent(reference)}`)
                    return
                  }
                  router.push(`/portal?ai_error=${encodeURIComponent(reference)}`)
                }}
              >
                {tErrors('ERROR_BOUNDARY_ANALYZE')}
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
