import { describe, expect, it } from 'vitest'
import { mapApiMessages } from '@/components/ai/mapMessages'
import type { ApiMessage } from '@/components/ai/types'

function row(overrides: Partial<ApiMessage>): ApiMessage {
  return {
    id: 'id',
    role: 'assistant',
    content: '',
    model: null,
    status: 'complete',
    tool_calls: [],
    tool_call_id: null,
    metadata: {},
    created_at: '2026-10-20T00:00:00.000Z',
    ...overrides,
  }
}

describe('mapApiMessages', () => {
  it('merges tool rounds into one assistant block and attaches activities', () => {
    const messages = mapApiMessages([
      row({ id: 'u1', role: 'user', content: 'Find my artist' }),
      row({
        id: 'a1',
        content: 'Checking.',
        status: 'complete',
        tool_calls: [{ id: 'call_1', name: 'get_artist_profile' }],
        metadata: { turn_status: 'tool_running' },
      }),
      row({
        id: 't1',
        role: 'tool',
        content: '',
        tool_call_id: 'call_1',
        metadata: { tool_name: 'get_artist_profile', ok: true, duration_ms: 12, available: true },
      }),
      row({ id: 'a2', content: 'Here is the answer.', metadata: { turn_status: 'completed' } }),
    ])
    expect(messages).toHaveLength(2)
    expect(messages[1]).toMatchObject({
      role: 'assistant',
      content: 'Checking.\n\nHere is the answer.',
      status: 'complete',
      tools: [
        {
          toolCallId: 'call_1',
          toolName: 'get_artist_profile',
          status: 'ok',
          durationMs: 12,
        },
      ],
    })
  })

  it('turns an interrupted streaming row into an interrupted error', () => {
    const messages = mapApiMessages([
      row({ id: 'u1', role: 'user', content: 'Hello' }),
      row({ id: 'a1', content: '', status: 'streaming' }),
    ])
    expect(messages[1]).toMatchObject({
      status: 'failed',
      error: { code: 'AI_TURN_INCOMPLETE' },
    })
  })

  it('keeps a streaming row live when the conversation has an active request', () => {
    const messages = mapApiMessages(
      [
        row({ id: 'u1', role: 'user', content: 'Hello' }),
        row({ id: 'a1', content: 'Partial', status: 'streaming' }),
      ],
      'req-active',
    )
    expect(messages[1]).toMatchObject({ status: 'streaming', error: null })
  })

  it('keeps the incomplete status even when metadata says failed', () => {
    const messages = mapApiMessages([
      row({
        id: 'u1',
        role: 'user',
        content: 'Hello',
      }),
      row({
        id: 'a1',
        content: 'Partial answer',
        status: 'incomplete',
        metadata: { turn_status: 'failed', error_code: 'AI_OUTPUT_TRUNCATED' },
      }),
    ])
    expect(messages[1]).toMatchObject({
      status: 'incomplete',
      error: { code: 'AI_OUTPUT_TRUNCATED' },
    })
  })

  it('does not merge across a new user message', () => {
    const messages = mapApiMessages([
      row({ id: 'u1', role: 'user', content: 'First' }),
      row({ id: 'a1', content: 'Answer one' }),
      row({ id: 'u2', role: 'user', content: 'Second' }),
      row({ id: 'a2', content: 'Answer two' }),
    ])
    expect(messages.map((message) => message.content)).toEqual([
      'First',
      'Answer one',
      'Second',
      'Answer two',
    ])
  })
})
