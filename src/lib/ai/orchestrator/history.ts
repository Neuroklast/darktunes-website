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
        const included = new Set<string>()
        for (const row of toolRows) {
          if (!row.toolCallId || !expected.has(row.toolCallId) || included.has(row.toolCallId)) {
            continue
          }
          included.add(row.toolCallId)
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
