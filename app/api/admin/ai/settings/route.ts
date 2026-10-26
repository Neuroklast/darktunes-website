/**
 * GET   /api/admin/ai/settings
 * PATCH /api/admin/ai/settings
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { ApiError, withErrorHandler } from '@/lib/errors'
import { requireAdminWithServiceClient } from '@/lib/adminAuth'
import { getAiSettings, updateAiSettings } from '@/lib/api/aiSettings'
import { AiProviderRouter } from '@/lib/ai/provider/router'
import { getCatalogModel, isCatalogModelForRole } from '@/lib/ai/models/catalog'
import { parseStoredCapabilities } from '@/lib/ai/models/capabilities'

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  test_mode: z.boolean().optional(),
  default_streaming: z.boolean().optional(),
  model_fast: z.string().min(1).optional(),
  model_reasoning: z.string().min(1).optional(),
  fallback_model: z.string().max(200).optional(),
  max_tool_rounds: z.number().int().min(1).max(12).optional(),
  token_limits: z.record(z.string(), z.unknown()).optional(),
  feature_flags: z
    .object({
      artist: z.boolean().optional(),
      editor: z.boolean().optional(),
      admin: z.boolean().optional(),
    })
    .optional(),
  reasoning_settings: z
    .object({
      fast_default: z.boolean().optional(),
      reasoning_default: z.boolean().optional(),
      low_effort: z.boolean().optional(),
    })
    .optional(),
  timeouts: z
    .object({
      complete_ms: z.number().int().min(5_000).max(120_000).optional(),
      stream_ms: z.number().int().min(5_000).max(120_000).optional(),
      reasoning_ms: z.number().int().min(5_000).max(120_000).optional(),
    })
    .optional(),
})

export const GET = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const { serviceClient } = await requireAdminWithServiceClient(req)
  const settings = await getAiSettings(serviceClient)
  const providerConfigured = (await AiProviderRouter.create(serviceClient, parseStoredCapabilities(settings.providerCapabilities))).hasConfiguredProvider
  return NextResponse.json({ ...settingsPayload(settings), provider_configured: providerConfigured })
})

export const PATCH = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const { userId, serviceClient } = await requireAdminWithServiceClient(req)
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    throw new ApiError(400, 'Invalid JSON body')
  }
  const parsed = patchSchema.safeParse(raw)
  if (!parsed.success) throw new ApiError(400, 'Invalid AI settings payload', 'VALIDATION_ERROR')
  const current = await getAiSettings(serviceClient)
  const fast = parsed.data.model_fast ?? current.modelFast
  const reasoning = parsed.data.model_reasoning ?? current.modelReasoning
  const fallback = parsed.data.fallback_model ?? current.fallbackModel
  if (!isCatalogModelForRole(fast, 'fast') || !isCatalogModelForRole(reasoning, 'reasoning') ||
      (fallback && !getCatalogModel(fallback)?.roles.includes('fast'))) {
    throw new ApiError(400, 'Choose approved models suitable for each chat profile.', 'VALIDATION_ERROR')
  }
  // A paid/zero-credit credit setting may not silently miss newly selected models.
  const { data: creditConfig, error: creditsError } = await serviceClient
    .from('ai_credit_settings').select('enabled, model_prices').eq('id', true).maybeSingle()
  if (creditsError) throw new ApiError(503, 'Install the AI credit schema before changing models.', 'AI_CREDITS_UNAVAILABLE')
  if (creditConfig?.enabled) {
    const prices = creditConfig.model_prices as Record<string, unknown>
    for (const id of [fast, reasoning, ...(fallback ? [fallback] : [])]) {
      if (!prices?.[id]) {
        throw new ApiError(400, `Configure credit tariffs for ${id} before enabling this model.`, 'VALIDATION_ERROR')
      }
    }
  }
  const settings = await updateAiSettings(serviceClient, {
    enabled: parsed.data.enabled,
    test_mode: parsed.data.test_mode,
    default_streaming: parsed.data.default_streaming,
    model_fast: parsed.data.model_fast,
    model_reasoning: parsed.data.model_reasoning,
    fallback_model: parsed.data.fallback_model,
    provider: 'multi',
    max_tool_rounds: parsed.data.max_tool_rounds,
    token_limits: parsed.data.token_limits,
    feature_flags: parsed.data.feature_flags
      ? { ...current.featureFlags, ...parsed.data.feature_flags }
      : undefined,
    reasoning_settings: parsed.data.reasoning_settings
      ? {
          fast_default: parsed.data.reasoning_settings.fast_default ?? current.reasoningSettings.fastDefault,
          reasoning_default:
            parsed.data.reasoning_settings.reasoning_default ?? current.reasoningSettings.reasoningDefault,
          low_effort: parsed.data.reasoning_settings.low_effort ?? current.reasoningSettings.lowEffort,
        }
      : undefined,
    timeouts: parsed.data.timeouts
      ? {
          complete_ms: parsed.data.timeouts.complete_ms ?? current.timeouts.completeMs,
          stream_ms: parsed.data.timeouts.stream_ms ?? current.timeouts.streamMs,
          reasoning_ms: parsed.data.timeouts.reasoning_ms ?? current.timeouts.reasoningMs,
        }
      : undefined,
    updated_by: userId,
  })
  const providerConfigured = Boolean(await resolveNvidiaApiKey(serviceClient))
  return NextResponse.json({ ...settingsPayload(settings), provider_configured: providerConfigured })
})

function settingsPayload(settings: Awaited<ReturnType<typeof getAiSettings>>) {
  return {
    enabled: settings.enabled,
    test_mode: settings.testMode,
    provider: settings.provider,
    model_fast: settings.modelFast,
    model_reasoning: settings.modelReasoning,
    fallback_model: settings.fallbackModel,
    default_streaming: settings.defaultStreaming,
    token_limits: settings.tokenLimits,
    max_tool_rounds: settings.maxToolRounds,
    feature_flags: settings.featureFlags,
    reasoning_settings: settings.reasoningSettings,
    timeouts: settings.timeouts,
    provider_capabilities: settings.providerCapabilities,
    last_connection_test: settings.lastConnectionTest,
    last_successful_connection_test: settings.lastSuccessfulConnectionTest,
    last_failed_connection_test: settings.lastFailedConnectionTest,
    updated_at: settings.updatedAt,
    updated_by: settings.updatedBy,
  }
}
