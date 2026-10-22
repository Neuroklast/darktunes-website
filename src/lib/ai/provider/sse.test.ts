import { describe, expect, it } from 'vitest'
import { SseDecoder, mergeToolCallDeltas, parseSseBlock, parseUsage } from '@/lib/ai/provider/sse'
import { AiProviderError } from '@/lib/ai/provider/errors'

describe('SSE parser', () => {
  it('should parse a content delta frame', () => {
    const chunk = parseSseBlock(
      'data: {"choices":[{"delta":{"content":"Hello"}}]}',
    )
    expect(chunk?.contentDelta).toBe('Hello')
    expect(chunk?.done).toBe(false)
  })

  it('should parse CRLF SSE frames', () => {
    const chunk = parseSseBlock(
      'event: message\r\ndata: {"choices":[{"delta":{"content":"Hi"}}]}\r',
    )
    expect(chunk?.contentDelta).toBe('Hi')
  })

  it('should treat [DONE] as the end of the stream', () => {
    const chunk = parseSseBlock('data: [DONE]')
    expect(chunk?.done).toBe(true)
  })

  it('should throw INVALID_RESPONSE on non-JSON data', () => {
    expect(() => parseSseBlock('data: not-json')).toThrow(AiProviderError)
  })

  it('should merge incremental tool-call argument deltas', () => {
    const merged = mergeToolCallDeltas([], [
      { index: 0, id: 'call_1', name: 'echo_test', arguments: '{"pin' },
      { index: 0, arguments: 'g":"x"}' },
    ])
    expect(merged[0]).toEqual({
      id: 'call_1',
      name: 'echo_test',
      arguments: '{"ping":"x"}',
    })
  })

  it('should read reasoning tokens from completion_tokens_details', () => {
    const usage = parseUsage({
      prompt_tokens: 10,
      completion_tokens: 20,
      total_tokens: 30,
      completion_tokens_details: { reasoning_tokens: 7 },
    })
    expect(usage).toEqual({
      input_tokens: 10,
      output_tokens: 20,
      reasoning_tokens: 7,
      total_tokens: 30,
    })
  })
})

describe('SseDecoder', () => {
  const encoder = new TextEncoder()

  it('reassembles a frame split across network chunks', () => {
    const decoder = new SseDecoder()
    expect(decoder.push(encoder.encode('data: {"choices":[{"delta":{"content":"po'))).toEqual([])
    const chunks = decoder.push(encoder.encode('ng"}}]}\n\n'))
    expect(chunks).toHaveLength(1)
    expect(chunks[0]?.contentDelta).toBe('pong')
  })

  it('handles UTF-8 characters split across chunks', () => {
    const decoder = new SseDecoder()
    const frame = 'data: {"choices":[{"delta":{"content":"Grüße"}}]}\n\n'
    const bytes = encoder.encode(frame)
    const split = encoder.encode(frame.slice(0, frame.indexOf('ü'))).length
    const result = [
      ...decoder.push(bytes.slice(0, split)),
      ...decoder.push(bytes.slice(split)),
      ...decoder.flush(),
    ]
    expect(result.map((chunk) => chunk.contentDelta).join('')).toBe('Grüße')
  })

  it('parses multiple frames in one chunk and CRLF endings', () => {
    const decoder = new SseDecoder()
    const chunks = decoder.push(
      encoder.encode(
        'data: {"choices":[{"delta":{"content":"a"}}]}\r\n\r\ndata: {"choices":[{"delta":{"content":"b"}}]}\r\n\r\n',
      ),
    )
    expect(chunks.map((chunk) => chunk.contentDelta)).toEqual(['a', 'b'])
  })

  it('flushes a final frame without a trailing blank line', () => {
    const decoder = new SseDecoder()
    expect(decoder.push(encoder.encode('data: {"choices":[{"delta":{"content":"last"}}]}'))).toEqual([])
    const chunks = decoder.flush()
    expect(chunks[0]?.contentDelta).toBe('last')
  })

  it('reports an error event as a provider failure', () => {
    const decoder = new SseDecoder()
    expect(() =>
      decoder.push(encoder.encode('event: error\ndata: {"error":{"message":"busy"}}\n\n')),
    ).toThrow(AiProviderError)
  })

  it('joins multi-line data fields before parsing JSON', () => {
    const decoder = new SseDecoder()
    const chunks = decoder.push(
      encoder.encode('data: {"choices":[{"delta":\ndata: {"content":"x"}}]}\n\n'),
    )
    expect(chunks[0]?.contentDelta).toBe('x')
  })
})
