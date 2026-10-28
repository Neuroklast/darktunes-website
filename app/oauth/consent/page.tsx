import { redirect } from 'next/navigation'
import { createServerSupabaseClient, createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import { resolveEffectiveAccess } from '@/lib/rbac/resolveAccess'
import { configuredMcpClients, mcpEnabled } from '@/lib/mcp/config'
import { decideOAuthConsent } from './submit'
import { ConsentLogin, ConsentMfa } from './ConsentControls'

export const dynamic = 'force-dynamic'

function validId(value: string | undefined): value is string {
  return Boolean(value && /^[A-Za-z0-9_-]{8,512}$/.test(value))
}

export default async function OAuthConsentPage({
  searchParams,
}: { searchParams: Promise<{ authorization_id?: string }> }) {
  const id = (await searchParams).authorization_id
  if (!mcpEnabled()) return <main className="mx-auto max-w-xl p-8">ChatGPT integration is not enabled.</main>
  if (!validId(id)) return <main className="mx-auto max-w-xl p-8">Invalid authorization request.</main>

  const auth = await createServerSupabaseClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return <ConsentLogin />

  const access = await resolveEffectiveAccess(await createServiceRoleSupabaseClient(), user.id)
  if (access.primaryRole !== 'artist' && access.primaryRole !== 'editor' && access.primaryRole !== 'admin') {
    return <main className="mx-auto max-w-xl p-8">This account has no MCP permissions.</main>
  }

  const { data, error } = await auth.auth.oauth.getAuthorizationDetails(id)
  if (error || !data) return <main className="mx-auto max-w-xl p-8">Authorization request expired or unavailable.</main>
  if (!('authorization_id' in data)) {
    if (data.redirect_url) {
      const target = new URL(data.redirect_url)
      if (target.protocol === 'https:') redirect(target.toString())
    }
    return <main className="mx-auto max-w-xl p-8">Authorization already processed.</main>
  }
  const client = data.client as { id?: string; client_id?: string; name?: string }
  const clientId = client.id ?? client.client_id
  if (!clientId || !configuredMcpClients().has(clientId)) {
    return <main className="mx-auto max-w-xl p-8">This OAuth client is not allowed. Contact your administrator.</main>
  }
  const { data: assurance, error: assuranceError } = await auth.auth.mfa.getAuthenticatorAssuranceLevel()
  if (assuranceError) return <main className="mx-auto max-w-xl p-8">Could not verify session security.</main>
  const needsMfa = access.primaryRole === 'admin' || access.primaryRole === 'editor'
  if (needsMfa && assurance?.currentLevel !== 'aal2') return <ConsentMfa />

  return (
    <main className="mx-auto my-12 max-w-xl rounded-xl border border-zinc-700 bg-zinc-950 p-8 text-zinc-100">
      <h1 className="text-2xl font-bold">Connect ChatGPT to darkTunes</h1>
      <p className="mt-4 text-sm text-zinc-300">
        {client.name ?? 'An external app'} is requesting access to the tools available to your darkTunes account.
        Tools respect your role and linked artist permissions. Read tools may return non-public information.
        Prepare tools only create previews. They do not publish or commit changes.
      </p>
      <p className="mt-4 text-xs text-zinc-400">Scope: {data.scope || 'default'}</p>
      <p className="mt-2 break-all text-xs text-zinc-400">Redirect: {data.redirect_uri}</p>
      <form action={decideOAuthConsent} className="mt-6 flex gap-3">
        <input type="hidden" name="authorization_id" value={id} />
        <button className="rounded bg-white px-5 py-2 font-semibold text-black" name="decision" value="approve" type="submit">Allow access</button>
        <button className="rounded border border-zinc-600 px-5 py-2" name="decision" value="deny" type="submit">Deny</button>
      </form>
    </main>
  )
}
