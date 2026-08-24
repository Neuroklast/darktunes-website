'use client'

/**
 * app/error.tsx — Next.js error boundary for route segments.
 *
 * Catches rendering errors in the page tree below the root layout.
 * Shows a user-friendly message with a retry button.
 *
 * Special case — ChunkLoadError:
 *   After a new Vercel deployment the old JS chunk hashes no longer exist on
 *   the CDN.  Any browser tab that was open before the deploy will hit 404s
 *   when webpack tries to lazy-load those chunks.  The only reliable fix is a
 *   hard page reload so the browser fetches the current HTML and new chunk
 *   manifest.  We detect this silently and reload without showing an error UI.
 */

import { useEffect } from 'react'
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
            <Warning size={48} weight="fill" className="text-destructive" />
          </div>
          <CardTitle className="text-xl">Something went wrong</CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-muted-foreground text-sm">
            {process.env.NODE_ENV === 'development'
              ? error.message
              : 'An unexpected error occurred. Please try again or contact support if the problem persists.'}
          </p>
          <Button onClick={reset} variant="default">
            Try again
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
