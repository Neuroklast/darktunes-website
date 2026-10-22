/**
 * GET /api/admin/ai/models
 * Returns NVIDIA-advertised models plus locally configured/tested capabilities.
 */

import { NextRequest, NextResponse } from 'next/server'
import { buildApiError, withErrorHandler } from '@/lib/errors'
import { requireAdminWithServiceClient } from '@/lib/adminAuth'
import { resolveNvidiaApiKey } from '@/lib/ai/provider/resolveKey'
import { NVIDIA_MODELS_URL, parseNvidiaModelsList } from '@/lib/ai/provider/nvidiaModels'
import { getAiSettings } from '@/lib/api/aiSettings'
import { parseStoredCapabilities } from '@/lib/ai/models/capabilities'

export const dynamic = 'force-dynamic'

export const GET = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const { serviceClient } = await requireAdminWithServiceClient(req)

  const apiKey = await resolveNvidiaApiKey(serviceClient)
  if (!apiKey) {
    throw buildApiError('AI_NOT_CONFIGURED', 503)
  }
  const settings = await getAiSettings(serviceClient)
  const stored = parseStoredCapabilities(settings.providerCapabilities)
  const refresh = req.nextUrl.searchParams.get('refresh') === '1'

  const response = await fetch(NVIDIA_MODELS_URL, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
    ...(refresh ? { cache: 'no-store' as const } : { next: { revalidate: 3600 } }),
  })
  if (!response.ok) {
    throw buildApiError('AI_PROVIDER_UNAVAILABLE', 503)
  }

  return NextResponse.json({
    models: parseNvidiaModelsList(await response.json()),
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
