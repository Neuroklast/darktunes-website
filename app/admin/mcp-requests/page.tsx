import { createServerSupabaseClient, createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import { resolveEffectiveAccess } from '@/lib/rbac/resolveAccess'
import { redirect } from 'next/navigation'
import { reviewMcpProposal } from './actions'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ConsentMfa } from '@/app/oauth/consent/ConsentControls'
export const dynamic = 'force-dynamic'

export default async function McpReviewPage() {
  const session = await createServerSupabaseClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) redirect('/login')
  const db = await createServiceRoleSupabaseClient()
  const access = await resolveEffectiveAccess(db, user.id)
  if (access.primaryRole !== 'admin') redirect('/admin')
  const { data: assurance, error: assuranceError } = await session.auth.mfa.getAuthenticatorAssuranceLevel()
  if (assuranceError || assurance?.currentLevel !== 'aal2') return <ConsentMfa />
  const { data: rows, error } = await (db as unknown as SupabaseClient).from('mcp_editorial_requests')
    .select('id,collection,target_id,changes,created_at,user_id')
    .eq('status', 'pending').order('created_at', { ascending: true }).limit(25)
  return (
    <main className="mx-auto max-w-5xl space-y-5 p-6 text-zinc-100">
      <h1 className="text-2xl font-bold">AI / MCP editorial reviews</h1>
      <p className="text-sm text-zinc-400">Only an MFA-verified administrator can apply changes. Proposals never publish or delete content automatically.</p>
      {error && <p role="alert">Requests unavailable. Apply the MCP editorial migration.</p>}
      {!error && !rows?.length && <p>No pending requests.</p>}
      {rows?.map((row) => (
        <section key={row.id} className="rounded-lg border border-zinc-700 bg-zinc-900 p-5">
          <h2 className="font-semibold">{row.collection}</h2>
          <p className="mt-1 break-all text-xs text-zinc-400">Record {row.target_id} · Requested by {row.user_id}</p>
          <pre className="mt-4 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-black p-3 text-xs">{JSON.stringify(row.changes, null, 2)}</pre>
          <form action={reviewMcpProposal} className="mt-4 flex gap-3">
            <input type="hidden" name="id" value={row.id} />
            <button name="decision" value="approve" className="rounded bg-white px-4 py-2 text-black">Approve</button>
            <button name="decision" value="reject" className="rounded border border-zinc-500 px-4 py-2">Reject</button>
          </form>
        </section>
      ))}
    </main>
  )
}
