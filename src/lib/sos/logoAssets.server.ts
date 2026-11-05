/**
 * Store SOS artwork once, rather than embedding the same base64 image in each
 * period workspace and rules preset. The table is private (service-role only).
 *
 * A content hash is a deduplication key, not an access token.
 */
import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { SosAccountingSettings } from '@/lib/sos/sosAccountingSettings'

type DbClient = SupabaseClient<Database>
const DATA_URL = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/i
const MAX_DATA_URL_LENGTH = 8 * 1024 * 1024

function embeddedLogo(settings: SosAccountingSettings): string | null {
  const { logoBase64, logo } = settings.labelInfo
  for (const candidate of [logoBase64, logo]) {
    if (typeof candidate === 'string' && DATA_URL.test(candidate)) return candidate
  }
  return null
}

/** Persist a data URL before committing a configuration that references it. */
export async function compactSosLogo(
  db: DbClient,
  settings: SosAccountingSettings,
): Promise<SosAccountingSettings> {
  const dataUrl = embeddedLogo(settings)
  if (!dataUrl) {
    // A reference-only configuration already uses the compact representation.
    return settings
  }
  if (dataUrl.length > MAX_DATA_URL_LENGTH) throw new Error('SOS logo exceeds the 8 MB limit')
  const id = createHash('md5').update(dataUrl).digest('hex')
  const { error } = await db
    .from('sos_logo_assets')
    .upsert({ id, data_url: dataUrl }, { onConflict: 'id', ignoreDuplicates: true })
  if (error) throw new Error('Could not save the shared SOS logo: ' + error.message)

  const { logo: _legacy, logoBase64: _duplicate, ...rest } = settings.labelInfo
  return { ...settings, labelInfo: { ...rest, logoAssetId: id } }
}

/**
 * Restore the existing public configuration shape for the SOS editor/PDF export.
 * Old records containing inline logos remain readable until migrated.
 */
export async function hydrateSosLogo(
  db: DbClient,
  settings: SosAccountingSettings,
): Promise<SosAccountingSettings> {
  if (embeddedLogo(settings)) return settings
  const id = settings.labelInfo.logoAssetId
  if (!id) return settings

  const { data, error } = await db
    .from('sos_logo_assets')
    .select('data_url')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error('Could not load the shared SOS logo: ' + error.message)
  if (!data?.data_url) throw new Error('The shared SOS logo is missing: ' + id)
  return {
    ...settings,
    labelInfo: {
      ...settings.labelInfo,
      logo: data.data_url,
      logoBase64: data.data_url,
    },
  }
}
