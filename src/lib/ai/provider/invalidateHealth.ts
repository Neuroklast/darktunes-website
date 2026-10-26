import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { AI_CHAT_MODELS, AI_PROVIDERS, type SupportedAiProvider } from '@/lib/ai/models/catalog'
import { getAiSettings, updateAiSettings } from '@/lib/api/aiSettings'
import { parseStoredCapabilities } from '@/lib/ai/models/capabilities'

/**
 * A model probe proves that one provider credential works. A replaced or
 * deleted key invalidates that proof, including the Cloudflare account ID.
 */
export async function invalidateAiHealthForCredential(
  db: SupabaseClient<Database>,
  credentialKey: string,
): Promise<void> {
  const provider = (Object.keys(AI_PROVIDERS) as SupportedAiProvider[])
    .find(id => AI_PROVIDERS[id].key === credentialKey ||
      (id === 'cloudflare' && credentialKey === 'cloudflare_ai_account_id'))
  if (!provider) return

  const settings = await getAiSettings(db)
  const stored = parseStoredCapabilities(settings.providerCapabilities)
  const health = { ...stored.health }
  for (const model of AI_CHAT_MODELS.filter(item => item.provider === provider)) delete health[model.id]
  await updateAiSettings(db, {
    provider_capabilities: { version: 2, models: stored.models, health },
    last_successful_connection_test: null,
  })
}
