'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'

type ConsentDetails = {
  authorization_id?: string
  redirect_url?: string
  client?: { name?: string }
  redirect_uri?: string
  scope?: string
}

export function McpOAuthConsent() {
  const query = useSearchParams()
  const authorizationId = query.get('authorization_id') ?? ''
  const [details, setDetails] = useState<ConsentDetails | null>(null)
  const [needsLogin, setNeedsLogin] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const supabase = useMemo(() => createBrowserSupabaseClient(), [])

  useEffect(() => {
    let cancelled = false
    if (!/^[\w-]{1,200}$/.test(authorizationId)) {
      setError('Missing or invalid authorization request.')
      return
    }
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (cancelled) return
      if (!user) {
        setNeedsLogin(true)
        return
      }
      const { data, error: detailsError } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId)
      if (cancelled) return
      if (detailsError || !data) {
        setError('Authorization request expired or could not be verified.')
        return
      }
      const result = data as ConsentDetails
      if (!result.authorization_id && result.redirect_url) {
        window.location.assign(result.redirect_url)
        return
      }
      if (!result.authorization_id || !result.client) {
        setError('Invalid authorization details.')
        return
      }
      setDetails(result)
    })()
    return () => { cancelled = true }
  }, [authorizationId, supabase])

  const loginReturnTo = `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`
  const loginUrl = `/login?returnTo=${encodeURIComponent(loginReturnTo)}`

  async function decide(allow: boolean) {
    if (!details || busy) return
    setBusy(true)
    setError('')
    try {
      const result = allow
        ? await supabase.auth.oauth.approveAuthorization(authorizationId)
        : await supabase.auth.oauth.denyAuthorization(authorizationId)
      if (result.error || !result.data?.redirect_url) {
        setError('Unable to complete authorization. Please retry.')
        setBusy(false)
        return
      }
      // Redirect URI is validated by Supabase OAuth against the registered client.
      window.location.assign(result.data.redirect_url)
    } catch {
      setError('Unable to complete authorization. Please retry.')
      setBusy(false)
    }
  }

  return (
    <section className="w-full max-w-lg rounded-xl border border-border bg-card p-8 space-y-5" aria-labelledby="oauth-title">
      <header className="space-y-2">
        <p className="text-xs tracking-widest uppercase text-muted-foreground">darkTunes Music Group</p>
        <h1 id="oauth-title" className="text-2xl font-semibold">Connect an external app</h1>
      </header>
      {error ? <p className="text-destructive" role="alert">{error}</p> : null}
      {needsLogin ? (
        <div className="space-y-4">
          <p>Sign in with your darkTunes account to review this request.</p>
          <a className="inline-flex rounded-md bg-primary px-4 py-2 text-primary-foreground" href={loginUrl}>Sign in</a>
        </div>
      ) : details ? (
        <>
          <p><strong>{details.client?.name || 'An external application'}</strong> wants access to your darkTunes account.</p>
          <dl className="space-y-2 text-sm">
            <div><dt className="font-medium">Requested scopes</dt>
              <dd className="text-muted-foreground">{details.scope || 'Basic account access'}</dd></div>
            <div><dt className="font-medium">Callback</dt>
              <dd className="break-all text-muted-foreground">{details.redirect_uri || 'Provided by OAuth server'}</dd></div>
          </dl>
          <p className="text-sm text-muted-foreground">
            This connector currently exposes authorized, read-only CMS tools. Your existing darkTunes role
            restricts which data the application can access. Do not approve unknown clients.
          </p>
          <div className="flex gap-3">
            <button type="button" disabled={busy} onClick={() => void decide(false)}
              className="flex-1 rounded-md border border-border px-4 py-2 disabled:opacity-50">Deny</button>
            <button type="button" disabled={busy} onClick={() => void decide(true)}
              className="flex-1 rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50">Authorize</button>
          </div>
        </>
      ) : !error ? <p className="text-muted-foreground" role="status">Checking authorization…</p> : null}
    </section>
  )
}
