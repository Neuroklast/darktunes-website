/**
 * Resolve notification recipients for staff and artist audiences.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { StaffRole } from './types'

type DbClient = SupabaseClient<Database>

export async function resolveStaffUserIds(
  db: DbClient,
  roles: readonly StaffRole[] = ['admin', 'editor'],
): Promise<string[]> {
  if (roles.length === 0) return []

  // Match resolveEffectiveAccess(): a profile's primary role takes precedence.
  // A secondary user_roles assignment must not receive privileged notifications
  // when the actual session still resolves as editor/artist.
  const { data, error } = await db.from('users').select('id').in('role', [...roles])
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => row.id)
}

/** All portal members of an artist (user_id). */
export async function resolveArtistMemberUserIds(
  db: DbClient,
  artistId: string,
): Promise<string[]> {
  const { data, error } = await db
    .from('artist_members')
    .select('user_id')
    .eq('artist_id', artistId)

  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => row.user_id).filter(Boolean)
}
