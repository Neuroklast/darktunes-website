'use client'

/**
 * app/global-error.tsx — Next.js global error boundary.
 *
 * Catches rendering errors that escape the root layout (e.g. errors in
 * layout.tsx itself). Must include its own <html> and <body> tags.
 *
 * next-intl is unavailable here because the root layout failed, so the copy is
 * resolved from the browser language with a safe English fallback.
 *
 * Special case — ChunkLoadError:
 *   Same stale-chunk problem as app/error.tsx: hard-reload silently.
 */

import { useEffect, useState } from 'react'
import { hasAttemptedChunkReload, isChunkLoadError, shouldReloadForChunkError } from '@/lib/clientChunkError'
import { reportClientError } from '@/lib/clientErrorReporter'

interface GlobalErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

const COPY = {
  en: {
    title: 'This page could not be loaded',
    body: 'Your data is safe. Reload the page to try again. If it keeps happening, send the reference below to the label team.',
    button: 'Reload page',
    reference: 'Reference for support:',
  },
  de: {
    title: 'Diese Seite konnte nicht geladen werden',
    body: 'Deine Daten sind sicher. Lade die Seite neu, um es erneut zu versuchen. Wenn das Problem bleibt, sende die Referenz unten an dein Label.',
    button: 'Seite neu laden',
    reference: 'Referenz für den Support:',
  },
  fr: {
    title: 'Cette page n’a pas pu être chargée',
    body: 'Vos données sont en sécurité. Rechargez la page pour réessayer. Si le problème persiste, envoyez la référence ci-dessous à votre label.',
    button: 'Recharger la page',
    reference: 'Référence pour le support :',
  },
} as const

function resolveCopy() {
  if (typeof navigator === 'undefined') return COPY.en
  const language = navigator.language.slice(0, 2).toLowerCase()
  if (language === 'de' || language === 'fr') return COPY[language]
  return COPY.en
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  const [copy, setCopy] = useState<(typeof COPY)[keyof typeof COPY]>(COPY.en)

  useEffect(() => {
    setCopy(resolveCopy())
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
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>{copy.title}</h1>
        <p style={{ color: '#a1a1aa', margin: 0, maxWidth: '28rem' }}>{copy.body}</p>
        {error.digest ? (
          <p style={{ color: '#a1a1aa', margin: 0, fontSize: '0.75rem' }}>
            {copy.reference} {error.digest}
          </p>
        ) : null}
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
          {copy.button}
        </button>
      </body>
    </html>
  )
}
