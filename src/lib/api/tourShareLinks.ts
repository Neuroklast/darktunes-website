/**
 * DAL for public read-only tour share links.
 */

import { randomBytes } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

type DbClient = SupabaseClient<Database>
type Row = Database['public']['Tables']['tour_share_links']['Row']

export interface TourShareLink {
  id: string
  tourId: string
  artistId: string
  token: string
  label: string | null
  isActive: boolean
  expiresAt: string | null
  createdBy: string | null
  createdAt: string
  revokedAt: string | null
}

function rowToLink(row: Row): TourShareLink {
  return {
    id: row.id,
    tourId: row.tour_id,
    artistId: row.artist_id,
    token: row.token,
    label: row.label,
    isActive: row.is_active,
    expiresAt: row.expires_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
  }
}

function generateToken(): string {
  return randomBytes(24).toString('base64url')
}

function isActive(link: TourShareLink): boolean {
  if (!link.isActive || link.revokedAt) return false
  if (link.expiresAt && new Date(link.expiresAt).getTime() < Date.now()) return false
  return true
}

export async function listTourShareLinks(
  db: DbClient,
  tourId: string,
  artistId: string,
): Promise<TourShareLink[]> {
  const { data, error } = await db
    .from('tour_share_links')
    .select('*')
    .eq('tour_id', tourId)
    .eq('artist_id', artistId)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []).map(rowToLink).filter(isActive)
}

export async function createTourShareLink(
  db: DbClient,
  input: {
    tourId: string
    artistId: string
    createdBy: string
    label?: string
    expiresAt?: string | null
  },
): Promise<TourShareLink> {
  const { data, error } = await db
    .from('tour_share_links')
    .insert({
      tour_id: input.tourId,
      artist_id: input.artistId,
      token: generateToken(),
      label: input.label ?? null,
      expires_at: input.expiresAt ?? null,
      created_by: input.createdBy,
      is_active: true,
    })
    .select()
    .single()

  if (error) throw new Error(error.message)
  if (!data) throw new Error('No data returned from createTourShareLink')
  return rowToLink(data)
}

export async function revokeTourShareLink(
  db: DbClient,
  artistId: string,
  linkId: string,
): Promise<void> {
  const { error } = await db
    .from('tour_share_links')
    .update({
      revoked_at: new Date().toISOString(),
      is_active: false,
    })
    .eq('id', linkId)
    .eq('artist_id', artistId)

  if (error) throw new Error(error.message)
}

export async function getTourShareLinkByToken(
  db: DbClient,
  token: string,
): Promise<TourShareLink | null> {
  const { data, error } = await db
    .from('tour_share_links')
    .select('*')
    .eq('token', token)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) return null
  const link = rowToLink(data)
  if (!isActive(link)) return null
  return link
}
