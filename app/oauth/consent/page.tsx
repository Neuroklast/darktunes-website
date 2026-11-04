import type { Metadata } from 'next'
import { Suspense } from 'react'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { McpOAuthConsent } from './McpOAuthConsent'
import { McpMfa } from './McpMfa'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Authorize app | darkTunes', robots: { index: false, follow: false } }

export default async function OAuthConsentPage() {
  if (process.env.MCP_CONNECTOR_ENABLED !== 'true') {
    return <main className="p-8">The darkTunes connector is disabled.</main>
  }
  const auth = await createServerSupabaseClient()
  const { data: { user } } = await auth.auth.getUser()
  let requiresMfa = false
  if (user) {
    const { data, error } = await auth.auth.mfa.getAuthenticatorAssuranceLevel()
    requiresMfa = Boolean(error || data?.currentLevel !== 'aal2')
  }
  return (
    <main className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
      {requiresMfa ? <McpMfa /> : (
        <Suspense fallback={<p>Checking authorization…</p>}>
          <McpOAuthConsent />
        </Suspense>
      )}
    </main>
  )
}
