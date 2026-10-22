/**
 * POST /api/admin/ai/connection-tests
 * Independent fast/reasoning probes plus a full integration verdict.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { ApiError, buildApiError, withErrorHandler } from '@/lib/errors'
import { requireAdminWithServiceClient } from '@/lib/adminAuth'
import { checkDistributedRateLimit } from '@/lib/rateLimitDistributed'
import { resolveNvidiaApiKey } from '@/lib/ai/provider/resolveKey'
import { runNvidiaConnectionTest } from '@/lib/ai/provider/connectionTest'
import { getAiSettings, updateAiSettings } from '@/lib/api/aiSettings'
import { parseStoredCapabilities } from '@/lib/ai/models/capabilities'

export const maxDuration = 120

const bodySchema = z.object({
  scope: z.enum(['fast', 'reasoning', 'all']).optional(),
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

  const apiKey = await resolveNvidiaApiKey(serviceClient)
  if (!apiKey) {
    throw buildApiError('AI_NOT_CONFIGURED', 503)
  }

  const settings = await getAiSettings(serviceClient)
  const result = await runNvidiaConnectionTest({
    apiKey,
    fastModel: settings.modelFast,
    reasoningModel: settings.modelReasoning,
    scope: parsed.data.scope ?? 'all',
  })
  const previous = parseStoredCapabilities(settings.providerCapabilities)
  const health = { ...previous.health }
  for (const [model, modelResult] of Object.entries(result.models)) {
    health[model] = {
      ok: modelResult.ok,
      tested_at: modelResult.tested_at,
      supports_streaming: result.discovered_capabilities[model]?.supports_streaming === true,
      supports_tools: result.discovered_capabilities[model]?.supports_tools === true,
      supports_enable_thinking:
        result.discovered_capabilities[model]?.supports_enable_thinking === true,
      supports_low_effort: result.discovered_capabilities[model]?.supports_low_effort === true,
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
