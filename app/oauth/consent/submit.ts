'use server'

import { redirect } from 'next/navigation'
import { createServerSupabaseClient, createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import { resolveEffectiveAccess } from '@/lib/rbac/resolveAccess'
import { configuredMcpClients, mcpEnabled } from '@/lib/mcp/config'

export async function decideOAuthConsent(form: FormData): Promise<void> {
  const id = form.get('authorization_id')
  const decision = form.get('decision')
  if (!mcpEnabled() || typeof id !== 'string' || !/^[A-Za-z0-9_-]{8,512}$/.test(id) ||
      (decision !== 'approve' && decision !== 'deny')) throw new Error('Invalid authorization request.')
  const auth = await createServerSupabaseClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) throw new Error('Sign in before authorizing this application.')
  const access = await resolveEffectiveAccess(await createServiceRoleSupabaseClient(), user.id)
  if (!['artist', 'editor', 'admin'].includes(access.primaryRole ?? '')) throw new Error('Account does not have MCP access.')
  const { data: details, error: detailError } = await auth.auth.oauth.getAuthorizationDetails(id)
  if (detailError || !details || !('authorization_id' in details)) throw new Error('Authorization request unavailable.')
  const client = details.client as { id?: string; client_id?: string }
  if (!configuredMcpClients().has(client.id ?? client.client_id ?? '')) throw new Error('Client not authorized.')
  if (access.primaryRole === 'admin' || access.primaryRole === 'editor') {
    const { data: aal, error } = await auth.auth.mfa.getAuthenticatorAssuranceLevel()
    if (error || aal?.currentLevel !== 'aal2') throw new Error('MFA verification is required.')
  }
  const result = decision === 'approve'
    ? await auth.auth.oauth.approveAuthorization(id)
    : await auth.auth.oauth.denyAuthorization(id)
  if (result.error || !result.data?.redirect_url) throw new Error('Could not complete OAuth authorization.')
  // This URL is issued by Supabase Auth after validating the registered client redirect URI.
  const target = new URL(result.data.redirect_url)
  if (target.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && target.hostname === 'localhost')) {
    throw new Error('Invalid OAuth redirect.')
  }
  redirect(target.toString())
}
