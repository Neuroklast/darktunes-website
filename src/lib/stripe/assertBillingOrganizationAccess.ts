/**
 * Billing may only be started for orgs the caller belongs to (or platform ops).
 * Stricter than staff CMS access: no Org #0 legacy free-pass without membership.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { ApiError } from '@/lib/errors'
import type { Database } from '@/types/database'

type DbClient = SupabaseClient<Database>

export async function assertBillingOrganizationAccess(
  db: DbClient,
  userId: string,
  organizationId: string,
): Promise<void> {
  try {
    const { data: platformAdmin, error: platformError } = await db
      .from('platform_admins')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle()

    if (!platformError && platformAdmin) return

    const { data: membership, error: memberError } = await db
      .from('organization_users')
      .select('user_id')
      .eq('user_id', userId)
      .eq('organization_id', organizationId)
      .maybeSingle()

    if (memberError) {
      const msg = memberError.message.toLowerCase()
      if (
        msg.includes('does not exist') ||
        msg.includes('schema cache') ||
        msg.includes('relation') ||
        memberError.code === '42P01' ||
        memberError.code === 'PGRST205'
      ) {
        throw new ApiError(503, 'Organization membership is not available')
      }
      throw new ApiError(503, 'Organization membership check failed')
    }

    if (membership) return

    throw new ApiError(403, 'Forbidden: not a member of this organization')
  } catch (err) {
    if (err instanceof ApiError) throw err
    throw new ApiError(503, 'Organization membership check failed')
  }
}
