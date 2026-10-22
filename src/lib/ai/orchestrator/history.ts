import type { AiChatMessage, AiToolCall } from '@/lib/ai/types/provider'

export interface StoredAiMessage {
  id: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  toolCalls: AiToolCall[]
  toolCallId: string | null
  metadata: Record<string, unknown>
}

/**
 * Rebuild a valid OpenAI-compatible transcript. Tool replies only survive when
 * their assistant tool-call group is complete, so NVIDIA never receives an
 * orphan tool message or an unanswered tool call.
 */
export function buildProviderHistory(messages: StoredAiMessage[]): AiChatMessage[] {
  const out: AiChatMessage[] = []
  let index = 0
  while (index < messages.length) {
    const message = messages[index]
    if (!message) {
      index += 1
      continue
    }
    if (message.role === 'tool') {
      index += 1
      continue
    }
    if (message.role === 'assistant' && message.toolCalls.length > 0) {
      const toolRows: StoredAiMessage[] = []
      let cursor = index + 1
      while (cursor < messages.length && messages[cursor]?.role === 'tool') {
        const row = messages[cursor]
        if (row) toolRows.push(row)
        cursor += 1
      }
      const expected = new Set(message.toolCalls.map((call) => call.id).filter(Boolean))
      const received = new Set(toolRows.map((row) => row.toolCallId).filter(Boolean))
      const complete = expected.size > 0 && [...expected].every((id) => received.has(id))
      if (complete) {
        out.push({
          role: 'assistant',
          content: message.content,
          tool_calls: message.toolCalls,
        })
        for (const row of toolRows) {
          if (!row.toolCallId) continue
          const name = typeof row.metadata.tool_name === 'string' ? row.metadata.tool_name : undefined
          out.push({
            role: 'tool',
            content: row.content,
            ...(name ? { name } : {}),
            tool_call_id: row.toolCallId,
          })
        }
      }
      index = cursor
      continue
    }
    if (message.role === 'assistant' && !message.content.trim()) {
      index += 1
      continue
    }
    out.push({ role: message.role, content: message.content })
    index += 1
  }
  return out
}

export interface DisplayToolActivity {
  toolCallId: string
  toolName: string
  ok: boolean
  durationMs: number | null
  available: boolean
}

export interface DisplayMessage {
  role: 'user' | 'assistant'
  content: string
  toolCalls: AiToolCall[]
  activities: DisplayToolActivity[]
  status: string
  errorCode: string | null
}

/** Display representation used by the conversation detail endpoint. */
export function groupMessagesForDisplay(messages: StoredAiMessage[]): DisplayMessage[] {
  const activities = new Map<string, DisplayToolActivity>()
  for (const message of messages) {
    if (message.role !== 'tool' || !message.toolCallId) continue
    const meta = message.metadata
    activities.set(message.toolCallId, {
      toolCallId: message.toolCallId,
      toolName: typeof meta.tool_name === 'string' ? meta.tool_name : 'tool',
      ok: meta.ok !== false,
      durationMs: typeof meta.duration_ms === 'number' ? meta.duration_ms : null,
      available: meta.available !== false,
    })
  }

  const out: DisplayMessage[] = []
  for (const message of messages) {
    if (message.role === 'user') {
      out.push({
        role: 'user',
        content: message.content,
        toolCalls: [],
        activities: [],
        status: 'complete',
        errorCode: null,
      })
      continue
    }
    if (message.role !== 'assistant') continue
    const previous = out.at(-1)
    if (previous && previous.role === 'assistant') {
      if (message.content.trim()) {
        previous.content = previous.content
          ? `${previous.content}\n\n${message.content}`
          : message.content
      }
      previous.toolCalls.push(...message.toolCalls)
      previous.status = String(message.metadata.turn_status ?? previous.status)
      if (typeof message.metadata.error_code === 'string') {
        previous.errorCode = message.metadata.error_code
      }
      continue
    }
    out.push({
      role: 'assistant',
      content: message.content,
      toolCalls: [...message.toolCalls],
      activities: [],
      status: String(message.metadata.turn_status ?? 'complete'),
      errorCode: typeof message.metadata.error_code === 'string' ? message.metadata.error_code : null,
    })
  }
  for (const block of out) {
    if (block.role !== 'assistant') continue
    block.activities = block.toolCalls
      .map((call) => activities.get(call.id))
      .filter((activity): activity is NonNullable<typeof activity> => Boolean(activity))
  }
  return out
}
