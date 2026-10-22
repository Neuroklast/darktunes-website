/**
 * GET /api/admin/ai/diagnostics
 * Recent failed/aborted assistant turns with filters and tool failures.
 */

import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { withErrorHandler } from '@/lib/errors'
import { requireAdminWithServiceClient } from '@/lib/adminAuth'

export const dynamic = 'force-dynamic'

interface EventRow {
  id: string
  user_id: string
  artist_id: string | null
  conversation_id: string | null
  request_id: string
  model: string
  input_tokens: number
  output_tokens: number
  reasoning_tokens: number
  total_tokens: number
  success: boolean
  error_code: string | null
  latency_ms: number | null
  ttft_ms: number | null
  rounds: number
  metadata: Record<string, unknown>
  created_at: string
}

const MAX_PAGE = 100

export const GET = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const { serviceClient } = await requireAdminWithServiceClient(req)
  const params = req.nextUrl.searchParams
  const status = params.get('status') ?? 'failed'
  const since = parseSince(params.get('since'))
  const model = params.get('model')?.trim() ?? ''
  const errorCode = params.get('error_code')?.trim() ?? ''
  const limit = Math.min(Math.max(Number(params.get('page_size') ?? 40) || 40, 1), MAX_PAGE)
  const cursor = decodeCursor(params.get('cursor'))

  let query = serviceClient
    .from('ai_usage_events')
    .select(
      'id, user_id, artist_id, conversation_id, request_id, model, input_tokens, output_tokens, reasoning_tokens, total_tokens, success, error_code, latency_ms, ttft_ms, rounds, metadata, created_at',
    )
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1)
  if (status !== 'all') query = query.eq('success', false)
  if (model) query = query.eq('model', model)
  if (errorCode) query = query.eq('error_code', errorCode)
  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
    )
  }

  const [{ data: rawItems, error: itemsError }, { data: analyses }] = await Promise.all([
    query,
    serviceClient
      .from('ai_diagnostics')
      .select('id, error_reference, fingerprint, analysis_status, classification, created_at, updated_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(20),
  ])
  if (itemsError) throw itemsError

  const rows = (rawItems ?? []) as EventRow[]
  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows
  const requestIds = page.map((row) => row.request_id)
  const toolFailures = await loadToolFailures(serviceClient, requestIds)
  const repeated = await loadRepeatedFailures(serviceClient, since, model, errorCode)
  const last = page[page.length - 1]

  return NextResponse.json({
    items: page.map((row) => ({
      id: row.id,
      source: 'turn',
      request_id: row.request_id,
      user_id: row.user_id,
      artist_id: row.artist_id,
      conversation_id: row.conversation_id,
      model: row.model,
      success: row.success,
      error_code: row.error_code,
      created_at: row.created_at,
      tokens: {
        input: row.input_tokens,
        output: row.output_tokens,
        reasoning: row.reasoning_tokens,
        total: row.total_tokens,
      },
      latency_ms: row.latency_ms,
      ttft_ms: row.ttft_ms,
      rounds: row.rounds,
      tool_failures: toolFailures.get(row.request_id) ?? 0,
      technical: safeTechnical(row.metadata),
    })),
    next_cursor:
      hasMore && last
        ? encodeCursor({ createdAt: last.created_at, id: last.id })
        : null,
    repeated,
    saved_analyses: analyses ?? [],
    filters: { status, since, model: model || null, error_code: errorCode || null },
  })
})

async function loadToolFailures(
  db: SupabaseClient<Database>,
  requestIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (requestIds.length === 0) return out
  const { data } = await db
    .from('ai_tool_executions')
    .select('request_id, status')
    .in('request_id', requestIds)
    .in('status', ['error', 'denied', 'timeout'])
  for (const row of data ?? []) {
    out.set(row.request_id, (out.get(row.request_id) ?? 0) + 1)
  }
  return out
}

async function loadRepeatedFailures(
  db: SupabaseClient<Database>,
  since: string,
  model: string,
  errorCode: string,
): Promise<Array<{ error_code: string; model: string; count: number }>> {
  let query = db
    .from('ai_usage_events')
    .select('error_code, model')
    .gte('created_at', since)
    .eq('success', false)
    .limit(2000)
  if (model) query = query.eq('model', model)
  if (errorCode) query = query.eq('error_code', errorCode)
  const { data } = await query
  const counts = new Map<string, { error_code: string; model: string; count: number }>()
  for (const row of data ?? []) {
    const code = row.error_code ?? 'UNKNOWN'
    const key = `${code}\u0000${row.model}`
    const entry = counts.get(key) ?? { error_code: code, model: row.model, count: 0 }
    entry.count += 1
    counts.set(key, entry)
  }
  return [...counts.values()]
    .filter((entry) => entry.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
}

function safeTechnical(metadata: Record<string, unknown>): Record<string, unknown> {
  const allowed = [
    'finish_reason',
    'fallback_used',
    'fallback_from',
    'tool_rounds',
    'rounds',
    'retry_count',
    'mode',
    'model_role',
    'metrics',
  ]
  const out: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in metadata) out[key] = metadata[key]
  }
  return out
}

function parseSince(value: string | null): string {
  const fallback = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  if (!value) return fallback
  if (value === '24h') return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  if (value === '7d') return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  if (value === '30d') return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? fallback : new Date(parsed).toISOString()
}

function encodeCursor(cursor: { createdAt: string; id: string }): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url')
}

function decodeCursor(raw: string | null): { createdAt: string; id: string } | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as {
      createdAt?: unknown
      id?: unknown
    }
    if (typeof parsed.createdAt !== 'string' || typeof parsed.id !== 'string') return null
    if (!/^[0-9T:.Z+-]+$/.test(parsed.createdAt) || !/^[0-9a-f-]{36}$/i.test(parsed.id)) return null
    return { createdAt: parsed.createdAt, id: parsed.id }
  } catch {
    return null
  }
}
