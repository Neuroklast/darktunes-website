import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { AiUsage } from '@/lib/ai/types/provider'

type Db = SupabaseClient<Database>

export interface AiUsageEventInput {
  userId: string
  artistId?: string | null
  conversationId?: string | null
  requestId: string
  model: string
  usage: AiUsage
  usageSource: 'provider' | 'estimate' | 'settlement'
  operationType: string
  success?: boolean
  errorCode?: string | null
  latencyMs?: number | null
  ttftMs?: number | null
  rounds?: number
  metadata?: Record<string, unknown>
}

export async function insertAiUsageEvent(db: Db, row: AiUsageEventInput): Promise<void> {
  const { error } = await db.from('ai_usage_events').insert({
    user_id: row.userId,
    artist_id: row.artistId ?? null,
    conversation_id: row.conversationId ?? null,
    request_id: row.requestId,
    model: row.model,
    input_tokens: row.usage.input_tokens,
    output_tokens: row.usage.output_tokens,
    reasoning_tokens: row.usage.reasoning_tokens,
    total_tokens: row.usage.total_tokens,
    usage_source: row.usageSource,
    operation_type: row.operationType,
    success: row.success ?? true,
    error_code: row.errorCode ?? null,
    latency_ms: row.latencyMs ?? null,
    ttft_ms: row.ttftMs ?? null,
    rounds: row.rounds ?? 1,
    metadata: row.metadata ?? {},
  })
  if (error) throw error
}
