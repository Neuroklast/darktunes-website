'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'

export function ConsentLogin() {
  const router = useRouter()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    setBusy(true)
    const { error } = await createBrowserSupabaseClient().auth.signInWithPassword({
      email: String(fields.get('email') ?? ''),
      password: String(fields.get('password') ?? ''),
    })
    setBusy(false)
    if (error) setError('Sign-in failed. Check your email and password.')
    else router.refresh()
  }
  return (
    <main className="mx-auto my-12 max-w-md rounded-xl border border-zinc-700 bg-zinc-950 p-8 text-white">
      <h1 className="text-2xl font-bold">Sign in to darkTunes</h1>
      <p className="mt-2 text-sm text-zinc-400">Sign in to review the ChatGPT connection request.</p>
      <form onSubmit={login} className="mt-6 flex flex-col gap-4">
        <label>Email<input name="email" type="email" required autoComplete="username" className="mt-1 w-full rounded bg-zinc-800 p-2" /></label>
        <label>Password<input name="password" type="password" required autoComplete="current-password" className="mt-1 w-full rounded bg-zinc-800 p-2" /></label>
        {error && <p role="alert" className="text-red-400">{error}</p>}
        <button disabled={busy} className="rounded bg-white p-2 font-semibold text-black" type="submit">{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </main>
  )
}

export function ConsentMfa() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    const supabase = createBrowserSupabaseClient()
    const { data: list, error: listError } = await supabase.auth.mfa.listFactors()
    const factor = list?.totp?.find((item) => item.status === 'verified')
    if (listError || !factor) { setError('Set up a verified authenticator app on your darkTunes account first.'); setBusy(false); return }
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: factor.id })
    if (!challenge || challengeError) { setError('Could not start MFA challenge.'); setBusy(false); return }
    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId: factor.id, challengeId: challenge.id, code,
    })
    setBusy(false)
    if (verifyError) setError('Verification code was not accepted.')
    else router.refresh()
  }
  return (
    <main className="mx-auto my-12 max-w-md rounded-xl border border-zinc-700 bg-zinc-950 p-8 text-white">
      <h1 className="text-2xl font-bold">Two-factor verification</h1>
      <p className="mt-2 text-sm text-zinc-400">Admin and editor accounts must verify MFA before granting ChatGPT access.</p>
      <form onSubmit={verify} className="mt-6 flex flex-col gap-4">
        <label>Authenticator code<input value={code} onChange={(e) => setCode(e.target.value)} pattern="[0-9]{6}" inputMode="numeric" maxLength={6} required className="mt-1 w-full rounded bg-zinc-800 p-2" /></label>
        {error && <p role="alert" className="text-red-400">{error}</p>}
        <button disabled={busy} className="rounded bg-white p-2 font-semibold text-black" type="submit">Verify</button>
      </form>
    </main>
  )
}
