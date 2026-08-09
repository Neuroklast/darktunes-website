import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { getFeatureFlagsForRole } from '@/lib/api/featureFlags'
import { getFeatureToggles } from '@/lib/featureToggles'
import { DEFAULT_ORGANIZATION_ID } from '@/lib/organizations/constants'

type DbClient = SupabaseClient<Database>

/** Per-label site toggle — single source of truth for promo pool availability. */
export async function isPromoPoolEnabled(
  db: DbClient,
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<boolean> {
  const toggles = await getFeatureToggles(db, organizationId).catch(() => null)
  return toggles?.promoPool ?? true
}

export async function isPressApplicationsEnabled(db: DbClient): Promise<boolean> {
  const flags = await getFeatureFlagsForRole(db, 'journalist').catch(() => ({} as Record<string, boolean>))
  return flags['press.applications'] !== false
}

export async function isPressZipDownloadEnabled(db: DbClient): Promise<boolean> {
  const flags = await getFeatureFlagsForRole(db, 'journalist').catch(() => ({} as Record<string, boolean>))
  return flags['press.zip_download'] !== false
}

export async function isPressAudioPreviewEnabled(db: DbClient): Promise<boolean> {
  const flags = await getFeatureFlagsForRole(db, 'journalist').catch(() => ({} as Record<string, boolean>))
  return flags['press.audio_preview'] !== false
}

/** Replaced by global `promoPool` toggle — hidden from admin UI, ignored at runtime. */
export const DEPRECATED_PORTAL_FEATURE_FLAGS = new Set(['press.promo_tracks'])