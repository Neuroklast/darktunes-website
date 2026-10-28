'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient, createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import { resolveEffectiveAccess } from '@/lib/rbac/resolveAccess'

export async function reviewMcpProposal(form: FormData): Promise<void> {
  const id = form.get('id')
  const decision = form.get('decision')
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id) ||
      (decision !== 'approve' && decision !== 'reject')) throw new Error('Invalid request.')
  const session = await createServerSupabaseClient()
  const { data: { user }, error } = await session.auth.getUser()
  if (!user || error) throw new Error('Authentication required.')
  const db = await createServiceRoleSupabaseClient()
  const access = await resolveEffectiveAccess(db, user.id)
  if (access.primaryRole !== 'admin') throw new Error('Admin access required.')
  const { data: aal, error: aalError } = await session.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aalError || aal?.currentLevel !== 'aal2') throw new Error('Verify MFA before approving content.')
  const { error: reviewError } = await db.rpc('mcp_review_editorial_request' as never, {
    p_id: id, p_reviewer: user.id, p_approve: decision === 'approve',
  } as never)
  if (reviewError) throw new Error('Review failed. The item may be stale or the migration is missing.')
  revalidatePath('/admin/mcp-requests')
}
