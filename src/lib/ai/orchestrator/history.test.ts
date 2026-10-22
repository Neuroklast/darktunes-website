import { describe, expect, it } from 'vitest'
import { buildProviderHistory, type StoredAiMessage } from '@/lib/ai/orchestrator/history'

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

  it('drops extra or duplicate tool rows from a complete group', () => {
    const history = buildProviderHistory([
      message('user', 'Find my artist'),
      message('assistant', '', {
        toolCalls: [{ id: 'call_1', name: 'get_artist_profile', arguments: '{}' }],
      }),
      message('tool', '{"one":1}', { toolCallId: 'call_1' }),
      message('tool', '{"two":2}', { toolCallId: 'call_2' }),
      message('tool', '{"three":3}', { toolCallId: 'call_1' }),
      message('assistant', 'Here is the answer.'),
    ])
    const toolRows = history.filter((entry) => entry.role === 'tool')
    expect(toolRows).toHaveLength(1)
    expect(toolRows[0]).toMatchObject({ tool_call_id: 'call_1', content: '{"one":1}' })
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
