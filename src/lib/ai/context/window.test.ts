import { describe, expect, it } from 'vitest'
import { slideConversationWindow } from '@/lib/ai/context/window'

describe('slideConversationWindow', () => {
  it('should keep the system prompt and the newest user turns', () => {
    const messages = [
      { role: 'system' as const, content: 'sys' },
      { role: 'user' as const, content: 'old '.repeat(2000) },
      { role: 'assistant' as const, content: 'old answer '.repeat(2000) },
      { role: 'user' as const, content: 'newest' },
    ]
    const windowed = slideConversationWindow(messages, 80)
    expect(windowed[0]?.role).toBe('system')
    expect(windowed.at(-1)?.content).toBe('newest')
    expect(windowed.some((message) => message.content.startsWith('old '))).toBe(false)
  })

  it('keeps an assistant tool call and its tool replies together', () => {
    const messages = [
      { role: 'system' as const, content: 'sys' },
      {
        role: 'assistant' as const,
        content: '',
        tool_calls: [{ id: 'call_1', name: 'get_artist_profile', arguments: '{}' }],
      },
      { role: 'tool' as const, content: '{"available":true}', tool_call_id: 'call_1' },
      { role: 'assistant' as const, content: 'The answer is ready.' },
    ]
    const windowed = slideConversationWindow(messages, 80)
    const toolIndex = windowed.findIndex((message) => message.role === 'tool')
    expect(toolIndex).toBeGreaterThan(0)
    expect(windowed[toolIndex - 1]?.tool_calls?.[0]?.id).toBe('call_1')
  })
})
