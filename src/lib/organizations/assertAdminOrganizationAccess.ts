/**
 * Ensure a staff user may administer the request organization.
 *
 * - platform_admins: all orgs
 * - organization_users membership: that org
 * - Org #0 (darkTunes): legacy admin/editor allowed without membership row
 *   (schema backfill / transitional single-tenant)
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { ApiError } from '@/lib/errors'
import { DEFAULT_ORGANIZATION_ID } from '@/lib/organizations/constants'
import type { Database } from '@/types/database'

type DbClient = SupabaseClient<Database>

export async function assertAdminOrganizationAccess(
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

    // Schema not applied yet (missing relation) — keep single-tenant admin working.
    if (memberError) {
      const msg = memberError.message.toLowerCase()
      if (
        organizationId === DEFAULT_ORGANIZATION_ID &&
        (msg.includes('does not exist') ||
          msg.includes('schema cache') ||
          msg.includes('relation') ||
          memberError.code === '42P01' ||
          memberError.code === 'PGRST205')
      ) {
        return
      }
      // Soft-fail: unknown errors on Org #0 only
      if (organizationId === DEFAULT_ORGANIZATION_ID) return
      throw new ApiError(503, 'Organization membership check failed')
    }

    if (membership) return

    // Transition: darkTunes Org #0 still accepts global admin/editor roles without a row.
    if (organizationId === DEFAULT_ORGANIZATION_ID) return

    throw new ApiError(403, 'Forbidden: not a member of this organization')
  } catch (err) {
    if (err instanceof ApiError) throw err
    if (organizationId === DEFAULT_ORGANIZATION_ID) return
    throw new ApiError(503, 'Organization membership check failed')
  }
}
