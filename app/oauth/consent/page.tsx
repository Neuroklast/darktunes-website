import type { Metadata } from 'next'
import { Suspense } from 'react'
import { McpOAuthConsent } from './McpOAuthConsent'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Authorize app | darkTunes', robots: { index: false, follow: false } }

export default function OAuthConsentPage() {
  return (
    <main className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
      <Suspense fallback={<p>Checking authorization…</p>}>
        <McpOAuthConsent />
      </Suspense>
    </main>
  )
}
