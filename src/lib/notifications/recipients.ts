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

  const [primary, assigned] = await Promise.all([
    db.from('users').select('id').in('role', [...roles]),
    db.from('user_roles').select('user_id').in('role', [...roles]),
  ])
  if (primary.error) throw new Error(primary.error.message)
  if (assigned.error) throw new Error(assigned.error.message)
  return [...new Set([
    ...(primary.data ?? []).map((row) => row.id),
    ...(assigned.data ?? []).map((row) => row.user_id),
  ])]
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
