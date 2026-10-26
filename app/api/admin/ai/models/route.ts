/**
 * GET /api/admin/ai/models — curated chat models only.
 *
 * Never expose the provider's raw /models list here. It contains unrelated
 * image/audio/embedding models with no reliable agent capability metadata.
 */
import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandler } from '@/lib/errors'
import { requireAdminWithServiceClient } from '@/lib/adminAuth'
import { getAiSettings } from '@/lib/api/aiSettings'
import { parseStoredCapabilities } from '@/lib/ai/models/capabilities'
import { AI_CHAT_MODELS, AI_PROVIDERS } from '@/lib/ai/models/catalog'
import { AiProviderRouter } from '@/lib/ai/provider/router'

export const dynamic = 'force-dynamic'

export const GET = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const { serviceClient } = await requireAdminWithServiceClient(req)
  const settings = await getAiSettings(serviceClient)
  const stored = parseStoredCapabilities(settings.providerCapabilities)
  const router = await AiProviderRouter.create(serviceClient, stored)

  return NextResponse.json({
    models: AI_CHAT_MODELS.map((entry) => ({
      ...entry, provider_name: AI_PROVIDERS[entry.provider].name,
      name: `${entry.name} (${entry.model})`,
      configured: router.hasKeyForModel(entry.id),
      verified: stored.health[entry.id]?.ok === true
        && stored.health[entry.id]?.supports_tools === true
        && stored.health[entry.id]?.supports_streaming === true,
    })),
    providers: router.availability.map((item) => ({
      ...item, name: AI_PROVIDERS[item.provider].name,
      docs: AI_PROVIDERS[item.provider].docs,
      free_tier: AI_PROVIDERS[item.provider].freeTier,
    })),
    configured: {
      fast: settings.modelFast,
      reasoning: settings.modelReasoning,
      fallback: settings.fallbackModel || null,
    },
    capabilities: stored.models,
    health: stored.health,
    last_connection_test: settings.lastConnectionTest,
    last_successful_connection_test: settings.lastSuccessfulConnectionTest,
    last_failed_connection_test: settings.lastFailedConnectionTest,
  })
})
