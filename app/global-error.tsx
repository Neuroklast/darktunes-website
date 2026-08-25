'use client'

/**
 * app/global-error.tsx — Next.js global error boundary.
 *
 * Catches rendering errors that escape the root layout (e.g. errors in
 * layout.tsx itself). Must include its own <html> and <body> tags.
 *
 * Special case — ChunkLoadError:
 *   Same stale-chunk problem as app/error.tsx.  After a Vercel re-deploy the
 *   old chunk hashes are gone; we detect the error and hard-reload silently.
 */

import { useEffect } from 'react'
import { hasAttemptedChunkReload, isChunkLoadError, shouldReloadForChunkError } from '@/lib/clientChunkError'
import { reportClientError } from '@/lib/clientErrorReporter'

interface GlobalErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    const storage = typeof window !== 'undefined' ? window.sessionStorage : null
    if (shouldReloadForChunkError(error, storage)) {
      window.location.reload()
      return
    }

    reportClientError('ui', error, {
      boundary: 'app/global-error.tsx',
      digest: error.digest ?? null,
      path: typeof window !== 'undefined' ? window.location.pathname : null,
    })

    if (process.env.NODE_ENV !== 'production') {
      console.error('[GlobalError]', error)
    }
  }, [error])

  const storage = typeof window !== 'undefined' ? window.sessionStorage : null
  if (isChunkLoadError(error) && !hasAttemptedChunkReload(error, storage)) {
    return <html lang="en"><body /></html>
  }

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#101010',
          color: '#ffffff',
          fontFamily: 'system-ui, sans-serif',
          flexDirection: 'column',
          gap: '1rem',
          padding: '1rem',
          textAlign: 'center',
        }}
      >
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>
          Critical error
        </h1>
        <p style={{ color: '#a1a1aa', margin: 0, maxWidth: '28rem' }}>
          The application encountered a fatal error and could not recover.
          Please refresh the page or contact support.
        </p>
        <button
          onClick={reset}
          style={{
            marginTop: '0.5rem',
            padding: '0.5rem 1.5rem',
            /* Brand accent — CSS custom properties unavailable in global-error boundary */
            backgroundColor: '#493687',
            color: '#ffffff',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: 'pointer',
            fontSize: '0.875rem',
          }}
        >
          Reload application
        </button>
      </body>
    </html>
  )
}
