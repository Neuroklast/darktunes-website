import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { DEFAULT_ORGANIZATION_ID } from '@/lib/organizations/constants'

type DbClient = SupabaseClient<Database>

export interface Genre {
  id: string
  name: string
  slug: string
  createdAt: string
}

type GenreRow = Database['public']['Tables']['genres']['Row']

function rowToGenre(row: GenreRow): Genre {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    createdAt: row.created_at,
  }
}

export async function listGenres(
  db: DbClient,
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<Genre[]> {
  const { data, error } = await db
    .from('genres')
    .select('*')
    .eq('organization_id', organizationId)
    .order('name', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []).map(rowToGenre)
}

export async function createGenre(
  db: DbClient,
  name: string,
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<Genre> {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const { data, error } = await db
    .from('genres')
    .insert({ name: name.trim(), slug, organization_id: organizationId })
    .select()
    .single()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('No data returned from createGenre')
  return rowToGenre(data)
}

export async function deleteGenre(db: DbClient, id: string): Promise<void> {
  const { error } = await db.from('genres').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
