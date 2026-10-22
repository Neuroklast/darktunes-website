export interface ClientStreamEvent {
  type: string
  [key: string]: unknown
}

/**
 * Incremental SSE parser for the assistant stream. Frames can be split across
 * network chunks; the decoder remainder is flushed at end-of-stream.
 */
export class ClientSseParser {
  private readonly decoder = new TextDecoder()
  private buffer = ''

  push(chunk: Uint8Array): ClientStreamEvent[] {
    this.buffer += this.decoder.decode(chunk, { stream: true })
    return this.drain(false)
  }

  flush(): ClientStreamEvent[] {
    this.buffer += this.decoder.decode()
    return this.drain(true)
  }

  private drain(final: boolean): ClientStreamEvent[] {
    const normalized = this.buffer.replace(/\r\n/g, '\n')
    const parts = normalized.split('\n\n')
    this.buffer = parts.pop() ?? ''
    const events: ClientStreamEvent[] = []
    for (const part of parts) {
      const event = parseFrame(part)
      if (event) events.push(event)
    }
    if (final && this.buffer.trim()) {
      const event = parseFrame(this.buffer)
      this.buffer = ''
      if (event) events.push(event)
    }
    return events
  }
}

function parseFrame(frame: string): ClientStreamEvent | null {
  let data = ''
  for (const line of frame.split('\n')) {
    if (!line.startsWith('data:')) continue
    data += (data ? '\n' : '') + line.slice(5).replace(/^ /, '')
  }
  if (!data) return null
  try {
    const parsed = JSON.parse(data) as ClientStreamEvent
    return parsed && typeof parsed.type === 'string' ? parsed : null
  } catch {
    return null
  }
}
