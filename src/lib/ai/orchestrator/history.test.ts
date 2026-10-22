import { describe, expect, it } from 'vitest'
import {
  buildProviderHistory,
  groupMessagesForDisplay,
  type StoredAiMessage,
} from '@/lib/ai/orchestrator/history'

function message(
  role: StoredAiMessage['role'],
  content: string,
  extra: Partial<StoredAiMessage> = {},
): StoredAiMessage {
  return {
    id: `${role}-${content}`,
    role,
    content,
    toolCalls: [],
    toolCallId: null,
    metadata: {},
    ...extra,
  }
}

describe('buildProviderHistory', () => {
  it('rebuilds a complete tool exchange with matching identifiers', () => {
    const history = buildProviderHistory([
      message('user', 'Find my artist'),
      message('assistant', '', {
        toolCalls: [{ id: 'call_1', name: 'get_artist_profile', arguments: '{}' }],
      }),
      message('tool', '{"available":true}', {
        toolCallId: 'call_1',
        metadata: { tool_name: 'get_artist_profile' },
      }),
      message('assistant', 'Here is the answer.'),
    ])
    expect(history).toEqual([
      { role: 'user', content: 'Find my artist' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [{ id: 'call_1', name: 'get_artist_profile', arguments: '{}' }],
      },
      { role: 'tool', content: '{"available":true}', name: 'get_artist_profile', tool_call_id: 'call_1' },
      { role: 'assistant', content: 'Here is the answer.' },
    ])
  })

  it('drops an incomplete tool group instead of sending orphan messages', () => {
    const history = buildProviderHistory([
      message('user', 'Find my artist'),
      message('assistant', '', {
        toolCalls: [{ id: 'call_1', name: 'get_artist_profile', arguments: '{}' }],
      }),
      message('tool', '{"available":true}', { toolCallId: 'call_2' }),
      message('assistant', 'Here is the answer.'),
    ])
    expect(history.some((entry) => entry.role === 'tool')).toBe(false)
    expect(history.some((entry) => entry.role === 'assistant' && entry.tool_calls?.length)).toBe(false)
    expect(history.at(-1)).toEqual({ role: 'assistant', content: 'Here is the answer.' })
  })

  it('drops orphan tool rows and empty assistant rows', () => {
    const history = buildProviderHistory([
      message('user', 'Hello'),
      message('tool', '{"x":1}', { toolCallId: 'missing' }),
      message('assistant', ''),
      message('assistant', 'Hi'),
    ])
    expect(history).toEqual([
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi' },
    ])
  })
})

describe('groupMessagesForDisplay', () => {
  it('merges assistant rounds and attaches tool activities', () => {
    const display = groupMessagesForDisplay([
      message('user', 'Find my artist'),
      message('assistant', 'Checking.', {
        toolCalls: [{ id: 'call_1', name: 'get_artist_profile', arguments: '{}' }],
        metadata: { turn_status: 'tool_running' },
      }),
      message('tool', '{"available":true}', {
        toolCallId: 'call_1',
        metadata: { tool_name: 'get_artist_profile', ok: true, duration_ms: 12, available: true },
      }),
      message('assistant', 'Here is the answer.', {
        metadata: { turn_status: 'completed' },
      }),
    ])
    expect(display).toHaveLength(2)
    expect(display[1]).toMatchObject({
      role: 'assistant',
      content: 'Checking.\n\nHere is the answer.',
      status: 'completed',
      activities: [
        {
          toolCallId: 'call_1',
          toolName: 'get_artist_profile',
          ok: true,
          durationMs: 12,
          available: true,
        },
      ],
    })
  })
})
