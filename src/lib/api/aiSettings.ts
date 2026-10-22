import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { DEFAULT_LABEL_ID } from '@/lib/api/apiCredentials'
import { DEFAULT_TOKEN_LIMITS, parseTokenLimits, type TokenLimits } from '@/lib/ai/budget/limits'
import { DEFAULT_AI_MODELS } from '@/lib/ai/types/provider'

type Db = SupabaseClient<Database>
type SettingsRow = Database['public']['Tables']['ai_settings']['Row']

export interface AiTimeouts {
  completeMs: number
  streamMs: number
  reasoningMs: number
}

export interface AiReasoningSettings {
  fastDefault: boolean
  reasoningDefault: boolean
  lowEffort: boolean
}

export interface AiSettings {
  enabled: boolean
  testMode: boolean
  provider: string
  modelFast: string
  modelReasoning: string
  fallbackModel: string
  defaultStreaming: boolean
  tokenLimits: TokenLimits
  reasoningSettings: AiReasoningSettings
  featureFlags: Record<string, boolean>
  timeouts: AiTimeouts
  maxToolRounds: number
  providerCapabilities: Record<string, unknown>
  lastConnectionTest: Record<string, unknown> | null
  lastSuccessfulConnectionTest: Record<string, unknown> | null
  lastFailedConnectionTest: Record<string, unknown> | null
  updatedAt: string
  updatedBy: string | null
}

export const DEFAULT_AI_TIMEOUTS: AiTimeouts = {
  completeMs: 45_000,
  streamMs: 120_000,
  reasoningMs: 75_000,
}

export const DEFAULT_AI_REASONING_SETTINGS: AiReasoningSettings = {
  fastDefault: false,
  reasoningDefault: true,
  lowEffort: true,
}

function rowToSettings(row: SettingsRow): AiSettings {
  return {
    enabled: row.enabled,
    testMode: row.test_mode,
    provider: row.provider,
    modelFast: row.model_fast,
    modelReasoning: row.model_reasoning,
    fallbackModel: row.fallback_model ?? '',
    defaultStreaming: row.default_streaming,
    tokenLimits: parseTokenLimits(row.token_limits),
    reasoningSettings: parseReasoningSettings(row.reasoning_settings),
    featureFlags: parseFeatureFlags(row.feature_flags),
    timeouts: parseTimeouts(row.timeouts),
    maxToolRounds: row.max_tool_rounds,
    providerCapabilities: row.provider_capabilities ?? {},
    lastConnectionTest: row.last_connection_test,
    lastSuccessfulConnectionTest: row.last_successful_connection_test ?? null,
    lastFailedConnectionTest: row.last_failed_connection_test ?? null,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  }
}

export async function getAiSettings(db: Db): Promise<AiSettings> {
  const { data, error } = await db
    .from('ai_settings')
    .select('*')
    .eq('label_id', DEFAULT_LABEL_ID)
    .maybeSingle()
  if (error) throw error
  if (!data) {
    return {
      enabled: false,
      testMode: true,
      provider: 'nvidia',
      modelFast: DEFAULT_AI_MODELS.fast,
      modelReasoning: DEFAULT_AI_MODELS.reasoning,
      fallbackModel: '',
      defaultStreaming: true,
      tokenLimits: parseTokenLimits(DEFAULT_TOKEN_LIMITS),
      reasoningSettings: { ...DEFAULT_AI_REASONING_SETTINGS },
      featureFlags: { artist: true, editor: true, admin: true },
      timeouts: { ...DEFAULT_AI_TIMEOUTS },
      maxToolRounds: 4,
      providerCapabilities: {},
      lastConnectionTest: null,
      lastSuccessfulConnectionTest: null,
      lastFailedConnectionTest: null,
      updatedAt: new Date(0).toISOString(),
      updatedBy: null,
    }
  }
  return rowToSettings(data)
}

export async function updateAiSettings(
  db: Db,
  patch: Database['public']['Tables']['ai_settings']['Update'],
): Promise<AiSettings> {
  const { data, error } = await db
    .from('ai_settings')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('label_id', DEFAULT_LABEL_ID)
    .select('*')
    .single()
  if (error) throw error
  return rowToSettings(data)
}

export function parseReasoningSettings(raw: unknown): AiReasoningSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_AI_REASONING_SETTINGS }
  const value = raw as Record<string, unknown>
  return {
    fastDefault: value.fast_default === true,
    reasoningDefault: value.reasoning_default !== false,
    lowEffort: value.low_effort !== false,
  }
}

export function parseFeatureFlags(raw: unknown): Record<string, boolean> {
  if (!raw || typeof raw !== 'object') return { artist: true, editor: true, admin: true }
  const value = raw as Record<string, unknown>
  return {
    artist: value.artist !== false,
    editor: value.editor !== false,
    admin: value.admin !== false,
  }
}

export function parseTimeouts(raw: unknown): AiTimeouts {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_AI_TIMEOUTS }
  const value = raw as Record<string, unknown>
  return {
    completeMs: positiveInt(value.complete_ms) ?? DEFAULT_AI_TIMEOUTS.completeMs,
    streamMs: positiveInt(value.stream_ms) ?? DEFAULT_AI_TIMEOUTS.streamMs,
    reasoningMs: positiveInt(value.reasoning_ms) ?? DEFAULT_AI_TIMEOUTS.reasoningMs,
  }
}

function positiveInt(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
  return Math.round(value)
}
