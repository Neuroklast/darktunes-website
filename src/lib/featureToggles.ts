import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { FeatureToggles } from '@/types'
import { DEFAULT_ORGANIZATION_ID } from '@/lib/organizations/constants'

type DbClient = SupabaseClient<Database>

export const DEFAULT_FEATURE_TOGGLES: FeatureToggles = {
  promoPool: true,
  editorTools: true,
}

/** Parse the `feature_toggles` JSON value from site_settings. */
export function parseFeatureTogglesJson(raw: string | null | undefined): FeatureToggles {
  try {
    const parsed = JSON.parse(raw ?? '{}')
    return {
      promoPool: typeof parsed?.promoPool === 'boolean' ? parsed.promoPool : DEFAULT_FEATURE_TOGGLES.promoPool,
      editorTools: typeof parsed?.editorTools === 'boolean' ? parsed.editorTools : DEFAULT_FEATURE_TOGGLES.editorTools,
    }
  } catch {
    return { ...DEFAULT_FEATURE_TOGGLES }
  }
}

export async function getFeatureToggles(
  db: DbClient,
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<FeatureToggles> {
  const { data, error } = await db
    .from('site_settings')
    .select('value')
    .eq('organization_id', organizationId)
    .eq('key', 'feature_toggles')
    .maybeSingle()

  if (error) throw new Error(error.message)
  return parseFeatureTogglesJson(data?.value)
}
