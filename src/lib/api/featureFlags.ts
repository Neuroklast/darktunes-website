/**
 * Portal feature flags (artist/journalist module toggles).
 * Scoped by organization_id — each label enables portal modules independently.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { PortalFeatureFlag } from '@/types'
import { DEFAULT_ORGANIZATION_ID } from '@/lib/organizations/constants'

type DbClient = SupabaseClient<Database>
type FlagRow = Database['public']['Tables']['portal_feature_flags']['Row']

/** Canonical catalog of portal flags (copied to new orgs on provision). */
export const DEFAULT_PORTAL_FEATURE_FLAG_CATALOG: Array<{
  id: string
  label: string
  enabled: boolean
  target_role: 'artist' | 'journalist'
}> = [
  { id: 'artist.analytics', label: 'Artist Analytics Dashboard', enabled: true, target_role: 'artist' },
  { id: 'artist.statements', label: 'Artist Statements', enabled: true, target_role: 'artist' },
  { id: 'artist.marketing', label: 'Artist Marketing', enabled: true, target_role: 'artist' },
  { id: 'artist.invoices', label: 'Artist Invoices', enabled: true, target_role: 'artist' },
  { id: 'artist.documents', label: 'Artist Document Vault', enabled: true, target_role: 'artist' },
  { id: 'artist.calendar', label: 'Artist Release Calendar', enabled: true, target_role: 'artist' },
  { id: 'artist.epk_builder', label: 'EPK Canvas Builder', enabled: true, target_role: 'artist' },
  { id: 'artist.fan_page', label: 'Fan Page Builder', enabled: true, target_role: 'artist' },
  { id: 'artist.tour_planner', label: 'Tour Planner (TRACK)', enabled: true, target_role: 'artist' },
  { id: 'journalist.accreditation', label: 'Journalist Accreditation', enabled: true, target_role: 'journalist' },
  { id: 'press.applications', label: 'Press Portal Applications', enabled: true, target_role: 'journalist' },
  { id: 'press.zip_download', label: 'Press Kit ZIP Download', enabled: true, target_role: 'journalist' },
  { id: 'press.audio_preview', label: 'Promo Track In-Browser Preview', enabled: true, target_role: 'journalist' },
  { id: 'press.contact', label: 'Press Inquiry Form', enabled: true, target_role: 'journalist' },
]

function rowToFlag(row: FlagRow): PortalFeatureFlag {
  return {
    id: row.id,
    label: row.label,
    enabled: row.enabled,
    targetRole: row.target_role as 'artist' | 'journalist',
    updatedAt: row.updated_at,
  }
}

export async function getFeatureFlags(
  db: DbClient,
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<PortalFeatureFlag[]> {
  const { data, error } = await db
    .from('portal_feature_flags')
    .select('*')
    .eq('organization_id', organizationId)
    .order('id', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []).map(rowToFlag)
}

export async function getFeatureFlagsForRole(
  db: DbClient,
  role: 'artist' | 'journalist',
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<Record<string, boolean>> {
  const { data, error } = await db
    .from('portal_feature_flags')
    .select('id, enabled')
    .eq('organization_id', organizationId)
    .eq('target_role', role)
  if (error) throw new Error(error.message)
  const map: Record<string, boolean> = {}
  for (const row of data ?? []) {
    map[row.id] = row.enabled
  }
  return map
}

export async function updateFeatureFlag(
  db: DbClient,
  id: string,
  enabled: boolean,
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<PortalFeatureFlag> {
  const { data, error } = await db
    .from('portal_feature_flags')
    .update({ enabled })
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select()
    .single()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('No data returned from updateFeatureFlag')
  return rowToFlag(data)
}

/**
 * Ensure a new organization has the default portal flag catalog.
 * Idempotent — skips existing (organization_id, id) pairs.
 */
export async function ensurePortalFeatureFlagsForOrganization(
  db: DbClient,
  organizationId: string,
): Promise<number> {
  const rows = DEFAULT_PORTAL_FEATURE_FLAG_CATALOG.map((flag) => ({
    organization_id: organizationId,
    id: flag.id,
    label: flag.label,
    enabled: flag.enabled,
    target_role: flag.target_role,
  }))
  const { data, error } = await db
    .from('portal_feature_flags')
    .upsert(rows, { onConflict: 'organization_id,id', ignoreDuplicates: true })
    .select('id')
  if (error) throw new Error(error.message)
  return data?.length ?? 0
}
