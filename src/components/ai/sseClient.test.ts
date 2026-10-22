import { describe, expect, it } from 'vitest'
import { ClientSseParser } from '@/components/ai/sseClient'

const encoder = new TextEncoder()

describe('ClientSseParser', () => {
  it('reassembles split frames and flushes the final frame', () => {
    const parser = new ClientSseParser()
    const events = [
      ...parser.push(encoder.encode('data: {"type":"delta","text":"po')),
      ...parser.push(encoder.encode('ng"}\n\n')),
      ...parser.push(encoder.encode('data: {"type":"done","model":"m"}')),
      ...parser.flush(),
    ]
    expect(events).toEqual([
      { type: 'delta', text: 'pong' },
      { type: 'done', model: 'm' },
    ])
  })

  it('parses CRLF and multiple frames per chunk', () => {
    const parser = new ClientSseParser()
    const events = parser.push(
      encoder.encode('data: {"type":"status","state":"streaming"}\r\n\r\ndata: {"type":"delta","text":"x"}\r\n\r\n'),
    )
    expect(events).toEqual([
      { type: 'status', state: 'streaming' },
      { type: 'delta', text: 'x' },
    ])
  })

  it('ignores malformed frames without killing the stream', () => {
    const parser = new ClientSseParser()
    const events = parser.push(
      encoder.encode('data: not-json\n\ndata: {"type":"delta","text":"ok"}\n\n'),
    )
    expect(events).toEqual([{ type: 'delta', text: 'ok' }])
  })
})
