/**
 * POST /api/admin/ai/connection-tests
 * Independent fast/reasoning probes plus a full integration verdict.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { ApiError, buildApiError, withErrorHandler } from '@/lib/errors'
import { requireAdminWithServiceClient } from '@/lib/adminAuth'
import { checkDistributedRateLimit } from '@/lib/rateLimitDistributed'
import { AiProviderRouter } from '@/lib/ai/provider/router'
import { getCatalogModel } from '@/lib/ai/models/catalog'
import { runNvidiaConnectionTest } from '@/lib/ai/provider/connectionTest'
import { getAiSettings, updateAiSettings } from '@/lib/api/aiSettings'
import { parseStoredCapabilities } from '@/lib/ai/models/capabilities'

export const maxDuration = 120

const bodySchema = z.object({
  scope: z.enum(['fast', 'reasoning', 'all']).optional(),
  model_id: z.string().min(1).max(180).optional(),
})

export const POST = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const { userId, serviceClient } = await requireAdminWithServiceClient(req)

  const limited = await checkDistributedRateLimit(`ai-connection-test:${userId}`, 6, 10 * 60 * 1000)
  if (limited.limited) {
    throw buildApiError('RATE_LIMITED', 429)
  }

  let raw: unknown = {}
  try {
    raw = await req.json()
  } catch {
    // Empty body means the full test.
  }
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) throw new ApiError(400, 'Invalid connection test payload', 'VALIDATION_ERROR')

  const settings = await getAiSettings(serviceClient)
  const previous = parseStoredCapabilities(settings.providerCapabilities)
  const router = await AiProviderRouter.create(serviceClient, previous)
  const selected = parsed.data.model_id ? getCatalogModel(parsed.data.model_id) : null
  if (parsed.data.model_id && !selected) {
    throw new ApiError(400, 'Choose an approved text-chat model.', 'VALIDATION_ERROR')
  }
  if (!router.hasConfiguredProvider) throw buildApiError('AI_NOT_CONFIGURED', 503)
  const role = selected?.roles.includes('fast') ? 'fast' : 'reasoning'
  const scope = selected ? role : (parsed.data.scope ?? 'all')
  const modelsToTest = selected ? [selected.id] :
    scope === 'fast' ? [settings.modelFast] :
    scope === 'reasoning' ? [settings.modelReasoning] :
    [settings.modelFast, settings.modelReasoning]
  for (const model of modelsToTest) {
    if (!getCatalogModel(model)) throw new ApiError(400, 'Selected chat model is not in the approved catalog.', 'VALIDATION_ERROR')
    if (!router.hasKeyForModel(model)) throw buildApiError('AI_NOT_CONFIGURED', 503)
  }
  const result = await runNvidiaConnectionTest({
    apiKey: 'stored-per-provider',
    provider: router,
    fastModel: selected && role === 'fast' ? selected.id : settings.modelFast,
    reasoningModel: selected && role === 'reasoning' ? selected.id : settings.modelReasoning,
    scope,
  })
  const health = { ...previous.health }
  for (const [model, modelResult] of Object.entries(result.models)) {
    health[model] = {
      ok: modelResult.ok,
      tested_at: modelResult.tested_at,
      supports_streaming: result.discovered_capabilities[model]?.supports_streaming === true,
      supports_tools: result.discovered_capabilities[model]?.supports_tools === true,
      supports_enable_thinking:
        result.discovered_capabilities[model]?.supports_enable_thinking ?? null,
      supports_low_effort:
        result.discovered_capabilities[model]?.supports_low_effort ?? null,
    }
  }

  await updateAiSettings(serviceClient, {
    last_connection_test: result as unknown as Record<string, unknown>,
    last_successful_connection_test: result.ok
      ? (result as unknown as Record<string, unknown>)
      : settings.lastSuccessfulConnectionTest,
    last_failed_connection_test: result.ok
      ? settings.lastFailedConnectionTest
      : (result as unknown as Record<string, unknown>),
    provider_capabilities: {
      version: 2,
      models: { ...previous.models, ...result.discovered_capabilities },
      health,
    },
  }).catch((error) => {
    console.warn('[ai] connection test result could not be stored:', error instanceof Error ? error.message : 'unknown')
  })

  return NextResponse.json(result)
})
