import { estimateTokens } from '@/lib/ai/budget/estimator'
import type { AiChatMessage } from '@/lib/ai/types/provider'

const DEFAULT_CONTEXT_BUDGET = 6000

/**
 * Keep the newest conversation turns inside the context budget. An assistant
 * message with tool calls and its following tool replies are one atomic group:
 * splitting them makes the NVIDIA request invalid.
 */
export function slideConversationWindow(
  messages: AiChatMessage[],
  maxTokens = DEFAULT_CONTEXT_BUDGET,
): AiChatMessage[] {
  const system = messages.filter((message) => message.role === 'system')
  const rest = messages.filter((message) => message.role !== 'system')
  const groups = groupMessages(rest)
  const kept: AiChatMessage[][] = []
  let used = system.reduce((sum, message) => sum + estimateMessage(message), 0)

  for (let index = groups.length - 1; index >= 0; index -= 1) {
    const group = groups[index]
    if (!group) continue
    const cost = group.reduce((sum, message) => sum + estimateMessage(message), 0)
    if (used + cost > maxTokens && kept.length > 0) break
    kept.unshift(group)
    used += cost
  }

  return [...system, ...kept.flat()]
}

export function groupMessages(messages: AiChatMessage[]): AiChatMessage[][] {
  const groups: AiChatMessage[][] = []
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index]
    if (!message) continue
    if (message.role === 'assistant' && message.tool_calls?.length) {
      const group = [message]
      let cursor = index + 1
      while (cursor < messages.length && messages[cursor]?.role === 'tool') {
        const toolMessage = messages[cursor]
        if (toolMessage) group.push(toolMessage)
        cursor += 1
      }
      groups.push(group)
      index = cursor - 1
      continue
    }
    groups.push([message])
  }
  return groups
}

function estimateMessage(message: AiChatMessage): number {
  let total = estimateTokens(message.content) + 6
  if (message.tool_calls?.length) {
    total += estimateTokens(JSON.stringify(message.tool_calls))
  }
  if (message.tool_call_id) total += 4
  return total
}
