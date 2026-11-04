'use client'

import { useState, type FormEvent } from 'react'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'

export function McpMfa() {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const auth = createBrowserSupabaseClient().auth
      const { data: factors, error: factorError } = await auth.mfa.listFactors()
      const factor = factors?.totp?.find(item => item.status === 'verified')
      if (factorError || !factor) {
        setError('Please enroll and verify an authenticator app in your account settings.')
        return
      }
      const { data: challenge, error: challengeError } = await auth.mfa.challenge({ factorId: factor.id })
      if (challengeError || !challenge) {
        setError('Could not start the two-factor challenge.')
        return
      }
      const { error: verifyError } = await auth.mfa.verify({
        factorId: factor.id, challengeId: challenge.id, code,
      })
      if (verifyError) {
        setError('Incorrect or expired authenticator code.')
        return
      }
      window.location.reload()
    } catch {
      setError('Two-factor verification failed. Please retry.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="w-full max-w-lg rounded-xl border border-border bg-card p-8 space-y-5">
      <h1 className="text-2xl font-semibold">Two-factor verification required</h1>
      <p className="text-sm text-muted-foreground">
        Verify your authenticator to authorize the connector or approve a CMS change.
      </p>
      <form onSubmit={verify} className="space-y-4">
        <label className="block text-sm">Six-digit code
          <input value={code} onChange={e => setCode(e.target.value)}
            pattern="[0-9]{6}" inputMode="numeric" maxLength={6}
            autoComplete="one-time-code" required
            className="mt-2 block w-full rounded-md border border-border bg-background p-3" />
        </label>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <button disabled={busy} type="submit"
          className="rounded-md bg-primary px-5 py-2 text-primary-foreground disabled:opacity-50">
          {busy ? 'Verifying…' : 'Verify'}
        </button>
      </form>
    </section>
  )
}
