import type { ApiMessage, UiError, UiMessage } from '@/components/ai/types'

export function mapApiMessages(
  rows: ApiMessage[],
  activeRequestId: string | null = null,
): UiMessage[] {
  const out: UiMessage[] = []
  let currentAssistant: UiMessage | null = null
  for (const row of rows) {
    if (row.role === 'user') {
      currentAssistant = null
      out.push({
        id: row.id,
        role: 'user',
        content: row.content,
        status: 'complete',
        model: null,
        tools: [],
        error: null,
        createdAt: row.created_at,
      })
      continue
    }
    if (row.role === 'tool') {
      currentAssistant?.tools.push({
        toolCallId: row.tool_call_id ?? row.id,
        toolName: typeof row.metadata.tool_name === 'string' ? row.metadata.tool_name : 'tool',
        label: '',
        status:
          row.metadata.ok === false
            ? 'error'
            : row.metadata.available === false
              ? 'no_data'
              : 'ok',
        durationMs:
          typeof row.metadata.duration_ms === 'number' ? row.metadata.duration_ms : null,
      })
      continue
    }
    if (row.role !== 'assistant') continue
    const activeStreaming = row.status === 'streaming' && Boolean(activeRequestId)
    const status = activeStreaming ? 'streaming' : normalizeStatus(row.status, row.metadata)
    const errorCode =
      activeStreaming
        ? null
        : typeof row.metadata.error_code === 'string'
          ? row.metadata.error_code
          : row.status === 'streaming' || row.status === 'failed'
            ? 'AI_TURN_INCOMPLETE'
            : null
    const error = errorCode ? uiErrorForCode(errorCode) : null
    if (currentAssistant) {
      if (row.content.trim()) {
        currentAssistant.content = currentAssistant.content
          ? `${currentAssistant.content}\n\n${row.content}`
          : row.content
      }
      if (status !== 'complete') currentAssistant.status = status
      if (row.model) currentAssistant.model = row.model
      if (error) currentAssistant.error = error
      continue
    }
    currentAssistant = {
      id: row.id,
      role: 'assistant',
      content: row.content,
      status,
      model: row.model,
      tools: [],
      error,
      createdAt: row.created_at,
    }
    out.push(currentAssistant)
  }
  return out
}

export function normalizeStatus(
  status: string,
  metadata: Record<string, unknown>,
): UiMessage['status'] {
  const turnStatus = typeof metadata.turn_status === 'string' ? metadata.turn_status : status
  if (turnStatus === 'cancelled' || status === 'cancelled') return 'cancelled'
  if (status === 'incomplete') return 'incomplete'
  if (turnStatus === 'failed' || status === 'failed') return 'failed'
  if (status === 'streaming') return 'failed'
  return 'complete'
}

export function uiErrorForCode(code: string): UiError {
  return {
    code,
    detail: '',
    retryable: code !== 'AI_DISABLED' && code !== 'AI_BUDGET_EXCEEDED',
    suggestedModelRole:
      code === 'AI_REASONING_EXHAUSTED' ||
      code === 'AI_OUTPUT_TRUNCATED' ||
      code === 'AI_PROVIDER_TIMEOUT' ||
      code === 'AI_EMPTY_RESPONSE' ||
      code === 'AI_PROVIDER_MODEL_UNAVAILABLE'
        ? 'fast'
        : null,
  }
}
