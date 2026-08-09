import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

type DbClient = SupabaseClient<Database>
type Insert = Database['public']['Tables']['organization_users']['Insert']

export async function addOrganizationUser(
  db: DbClient,
  payload: Pick<Insert, 'organization_id' | 'user_id' | 'role'>,
): Promise<void> {
  const { error } = await db.from('organization_users').insert(payload)
  if (error) throw new Error(error.message)
}
