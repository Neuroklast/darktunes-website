import { describe, expect, it, vi } from 'vitest'
import { AiProviderError } from '@/lib/ai/provider/errors'
import { NvidiaOpenAiCompatibleProvider, buildNvidiaPayload } from '@/lib/ai/provider/nvidia'
import { getModelProfile } from '@/lib/ai/models/profiles'
import type { AiCompletionRequest, AiStreamEvent } from '@/lib/ai/types/provider'

const baseRequest: AiCompletionRequest = {
  request_id: 'req-1',
  model: 'nvidia/nemotron-3.5-lightning-30b-a3b',
  messages: [{ role: 'user', content: 'ping' }],
  max_tokens: 32,
  enable_thinking: false,
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('NvidiaOpenAiCompatibleProvider', () => {
  it('should omit reasoning_budget until the capability is discovered', () => {
    const payload = buildNvidiaPayload(baseRequest, false, getModelProfile(baseRequest.model))
    expect(payload.reasoning_budget).toBeUndefined()
    expect(payload.chat_template_kwargs).toEqual({ enable_thinking: false })
  })

  it('serializes a multi-step tool exchange into NVIDIA/OpenAI wire format', () => {
    const payload = buildNvidiaPayload(
      {
        ...baseRequest,
        messages: [
          { role: 'user', content: 'Find my artist' },
          {
            role: 'assistant',
            content: '',
            tool_calls: [{ id: 'call_1', name: 'get_artist', arguments: '{"id":"a1"}' }],
          },
          { role: 'tool', name: 'get_artist', tool_call_id: 'call_1', content: '{"artist":"Test"}' },
        ],
      },
      false,
      getModelProfile(baseRequest.model),
    )
    expect(payload.messages).toEqual([
      { role: 'user', content: 'Find my artist' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'get_artist', arguments: '{"id":"a1"}' },
          },
        ],
      },
      { role: 'tool', content: '{"artist":"Test"}', tool_call_id: 'call_1' },
    ])
  })

  it('rejects tool messages without a matching call identifier', () => {
    expect(() =>
      buildNvidiaPayload(
        { ...baseRequest, messages: [{ role: 'tool', content: '{}' }] },
        false,
        getModelProfile(baseRequest.model),
      ),
    ).toThrow('tool_call_id')
  })

  it('only sends tool_choice when tools are supplied', () => {
    const request = {
      ...baseRequest,
      tool_choice: 'required' as const,
      tools: [{ name: 'echo_test', description: 'Echo', parameters: { type: 'object' } }],
    }
    expect(buildNvidiaPayload(request, false, getModelProfile(request.model)).tool_choice).toBe('required')
    expect(buildNvidiaPayload({ ...request, tools: [] }, false, getModelProfile(request.model)).tool_choice).toBeUndefined()
  })

  it('keeps stream timeouts active while waiting for SSE content', async () => {
    vi.useFakeTimers()
    try {
      const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) =>
        new Response(
          new ReadableStream({
            start(controller) {
              init?.signal?.addEventListener('abort', () => {
                const error = new Error('aborted')
                error.name = 'AbortError'
                controller.error(error)
              })
            },
          }),
          { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
        ),
      )
      const provider = new NvidiaOpenAiCompatibleProvider({ apiKey: 'nvapi-test', fetchImpl })
      const iterator = provider.stream({ ...baseRequest, timeout_ms: 25 })[Symbol.asyncIterator]()
      const opened = await iterator.next()
      expect(opened.value).toMatchObject({ type: 'open' })
      const pending = iterator.next()
      // Register a rejection handler before advancing fake timers.
      const check = expect(pending).rejects.toMatchObject({ code: 'TIMEOUT' })
      await vi.advanceTimersByTimeAsync(30)
      await check
    } finally {
      vi.useRealTimers()
    }
  })

  it('should send reasoning_budget only on the discovered path', () => {
    const capabilities = {
      ...getModelProfile(baseRequest.model),
      supports_reasoning_budget: true,
      reasoning_budget_path: 'top_level' as const,
    }
    const payload = buildNvidiaPayload(
      { ...baseRequest, reasoning_budget: 256, enable_thinking: true },
      false,
      capabilities,
    )
    expect(payload.reasoning_budget).toBe(256)
  })

  it('should complete a non-streaming NVIDIA response', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        choices: [{ message: { content: 'pong' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 4, completion_tokens: 1, total_tokens: 5 },
      }),
    )
    const provider = new NvidiaOpenAiCompatibleProvider({ apiKey: 'nvapi-test', fetchImpl })
    const completion = await provider.complete(baseRequest)
    expect(completion.content).toBe('pong')
    expect(completion.usage.total_tokens).toBe(5)
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('retries a saturated hosted worker, then succeeds on the third attempt', async () => {
    vi.useFakeTimers()
    try {
      const fetchImpl = vi.fn()
        .mockResolvedValueOnce(jsonResponse({ error: { message: 'ResourceExhausted: Worker local total request limit reached (16/16)' } }, 503))
        .mockResolvedValueOnce(jsonResponse({ error: { message: 'busy' } }, 503))
        .mockResolvedValueOnce(jsonResponse({
          choices: [{ message: { content: 'pong' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 4, completion_tokens: 1, total_tokens: 5 },
        }))
      const provider = new NvidiaOpenAiCompatibleProvider({ apiKey: 'nvapi-test', fetchImpl })
      const result = provider.complete(baseRequest)
      await vi.advanceTimersByTimeAsync(3_000)
      expect((await result).content).toBe('pong')
      expect(fetchImpl).toHaveBeenCalledTimes(3)
    } finally {
      vi.useRealTimers()
    }
  })

  it('stops after three 503 responses and preserves the saturation detail', async () => {
    vi.useFakeTimers()
    try {
      const fetchImpl = vi.fn(async () =>
        jsonResponse({ error: { message: 'ResourceExhausted: Worker local total request limit reached (16/16)' } }, 503),
      )
      const provider = new NvidiaOpenAiCompatibleProvider({ apiKey: 'nvapi-test', fetchImpl })
      const result = provider.complete(baseRequest)
      const rejected = expect(result).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' })
      await vi.advanceTimersByTimeAsync(3_000)
      await rejected
      expect(fetchImpl).toHaveBeenCalledTimes(3)
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not retry when NVIDIA requests a long Retry-After or rejects credentials', async () => {
    const backoffResponse = new Response('busy', { status: 503, headers: { 'Retry-After': '120' } })
    const fetchImpl = vi.fn().mockResolvedValueOnce(backoffResponse)
    const provider = new NvidiaOpenAiCompatibleProvider({ apiKey: 'nvapi-test', fetchImpl })
    await expect(provider.complete(baseRequest)).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE', retryAfterMs: 120_000,
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('cancels a pending retry without sending another request', async () => {
    vi.useFakeTimers()
    try {
      const fetchImpl = vi.fn(async () => jsonResponse({ error: { message: 'busy' } }, 503))
      const provider = new NvidiaOpenAiCompatibleProvider({ apiKey: 'nvapi-test', fetchImpl })
      const request = provider.complete(baseRequest)
      const rejected = expect(request).rejects.toMatchObject({ code: 'TIMEOUT' })
      await vi.advanceTimersByTimeAsync(0)
      provider.abort(baseRequest.request_id)
      await rejected
      expect(fetchImpl).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

  it('should map HTTP 401 to INVALID_KEY', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: { message: 'bad key' } }, 401))
    const provider = new NvidiaOpenAiCompatibleProvider({ apiKey: 'bad', fetchImpl })
    await expect(provider.complete(baseRequest)).rejects.toMatchObject({
      code: 'INVALID_KEY',
    } satisfies Partial<AiProviderError>)
  })

  it('should stream content deltas then emit done', async () => {
    const sse = [
      'data: {"choices":[{"delta":{"content":"po"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"ng"}}]}\n\n',
      'data: {"usage":{"prompt_tokens":2,"completion_tokens":2,"total_tokens":4}}\n\n',
      'data: [DONE]\n\n',
    ].join('')
    const fetchImpl = vi.fn(
      async () =>
        new Response(sse, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }),
    )
    const provider = new NvidiaOpenAiCompatibleProvider({ apiKey: 'nvapi-test', fetchImpl })
    const events = []
    for await (const event of provider.stream(baseRequest)) {
      events.push(event)
    }
    expect(events.filter((event) => event.type === 'delta').map((event) => event.type === 'delta' && event.text)).toEqual([
      'po',
      'ng',
    ])
    const done = events.at(-1)
    expect(done?.type).toBe('done')
    if (done?.type === 'done') {
      expect(done.completion.content).toBe('pong')
      expect(done.completion.usage.total_tokens).toBe(4)
    }
  })

  it('should use streamed reasoning as answer text when thinking is disabled', async () => {
    const sse = [
      'data: {"choices":[{"delta":{"reasoning_content":"po"}}]}\n\n',
      'data: {"choices":[{"delta":{"reasoning":"ng"}}]}\n\n',
      'data: [DONE]\n\n',
    ].join('')
    const fetchImpl = vi.fn(
      async () =>
        new Response(sse, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }),
    )
    const provider = new NvidiaOpenAiCompatibleProvider({ apiKey: 'nvapi-test', fetchImpl })
    const events: AiStreamEvent[] = []
    for await (const event of provider.stream({ ...baseRequest, enable_thinking: false })) {
      events.push(event)
    }
    expect(events.filter((event) => event.type === 'delta').map((event) => event.type === 'delta' && event.text)).toEqual([
      'po',
      'ng',
    ])
    expect(events.some((event) => event.type === 'reasoning_delta')).toBe(false)
    const done = events.at(-1)
    expect(done?.type).toBe('done')
    if (done?.type === 'done') {
      expect(done.completion.content).toBe('pong')
      expect(done.completion.reasoning_content).toBeNull()
    }
  })

  it('should keep reasoning deltas separate when thinking is enabled', async () => {
    const sse = [
      'data: {"choices":[{"delta":{"reasoning":"thinking"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"answer"}}]}\n\n',
      'data: [DONE]\n\n',
    ].join('')
    const fetchImpl = vi.fn(
      async () =>
        new Response(sse, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }),
    )
    const provider = new NvidiaOpenAiCompatibleProvider({ apiKey: 'nvapi-test', fetchImpl })
    const events: AiStreamEvent[] = []
    for await (const event of provider.stream({ ...baseRequest, enable_thinking: true })) {
      events.push(event)
    }
    expect(events.filter((event) => event.type === 'reasoning_delta').map((event) => event.type === 'reasoning_delta' && event.text)).toEqual([
      'thinking',
    ])
    expect(events.filter((event) => event.type === 'delta').map((event) => event.type === 'delta' && event.text)).toEqual([
      'answer',
    ])
  })

  it('should prefer content over reasoning when a frame carries both and thinking is disabled', async () => {
    const sse = [
      'data: {"choices":[{"delta":{"content":"po","reasoning_content":"ignore"}}]}\n\n',
      'data: [DONE]\n\n',
    ].join('')
    const fetchImpl = vi.fn(
      async () =>
        new Response(sse, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }),
    )
    const provider = new NvidiaOpenAiCompatibleProvider({ apiKey: 'nvapi-test', fetchImpl })
    const events: AiStreamEvent[] = []
    for await (const event of provider.stream({ ...baseRequest, enable_thinking: false })) {
      events.push(event)
    }
    expect(events.filter((event) => event.type === 'delta').map((event) => event.type === 'delta' && event.text)).toEqual([
      'po',
    ])
    expect(events.some((event) => event.type === 'reasoning_delta')).toBe(false)
  })

  it('should fall back to a JSON completion when NVIDIA ignores stream:true', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        choices: [{ message: { content: 'pong' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 4, completion_tokens: 1, total_tokens: 5 },
      }),
    )
    const provider = new NvidiaOpenAiCompatibleProvider({ apiKey: 'nvapi-test', fetchImpl })
    const events: AiStreamEvent[] = []
    for await (const event of provider.stream(baseRequest)) {
      events.push(event)
    }
    expect(events.filter((event) => event.type === 'delta').map((event) => event.type === 'delta' && event.text)).toEqual([
      'pong',
    ])
    const done = events.at(-1)
    expect(done?.type).toBe('done')
    if (done?.type === 'done') expect(done.completion.usage.total_tokens).toBe(5)
  })

  it('should fail instead of silently completing an empty stream', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response('data: [DONE]\n\n', {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }),
    )
    const provider = new NvidiaOpenAiCompatibleProvider({ apiKey: 'nvapi-test', fetchImpl })
    await expect(async () => {
      for await (const _event of provider.stream(baseRequest)) {
        // consume
      }
    }).rejects.toMatchObject({ code: 'EMPTY_RESPONSE' })
  })

  it('should backfill non-streaming content from reasoning when thinking is disabled', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        choices: [{ message: { content: '', reasoning_content: 'pong' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 4, completion_tokens: 1, total_tokens: 5 },
      }),
    )
    const provider = new NvidiaOpenAiCompatibleProvider({ apiKey: 'nvapi-test', fetchImpl })
    const completion = await provider.complete({ ...baseRequest, enable_thinking: false })
    expect(completion.content).toBe('pong')
    expect(completion.reasoning_content).toBeNull()
  })

  it('should abort an in-flight request', async () => {
    const fetchImpl = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const abort = () => {
          const error = new Error('aborted')
          error.name = 'AbortError'
          reject(error)
        }
        if (init?.signal?.aborted) {
          abort()
          return
        }
        init?.signal?.addEventListener('abort', abort)
      })
    })
    const provider = new NvidiaOpenAiCompatibleProvider({ apiKey: 'nvapi-test', fetchImpl: fetchImpl as typeof fetch })
    const pending = provider.complete(baseRequest)
    provider.abort('req-1')
    await expect(pending).rejects.toMatchObject({ code: 'TIMEOUT' })
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('should retry a 429 then complete', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: 'slow down' } }), {
          status: 429,
          headers: { 'Retry-After': '0' },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          choices: [{ message: { content: 'pong' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
      )
    const provider = new NvidiaOpenAiCompatibleProvider({ apiKey: 'nvapi-test', fetchImpl })
    const completion = await provider.complete(baseRequest)
    expect(completion.content).toBe('pong')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('should not retry when the outer signal is aborted', async () => {
    const fetchImpl = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const abort = () => {
          const error = new Error('aborted')
          error.name = 'AbortError'
          reject(error)
        }
        if (init?.signal?.aborted) {
          abort()
          return
        }
        init?.signal?.addEventListener('abort', abort)
      })
    })
    const provider = new NvidiaOpenAiCompatibleProvider({ apiKey: 'nvapi-test', fetchImpl: fetchImpl as typeof fetch })
    const controller = new AbortController()
    const pending = provider.complete(baseRequest, controller.signal)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ code: 'TIMEOUT' })
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('should not retry when retry is false', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ error: { message: 'slow down' } }), {
        status: 429,
        headers: { 'Retry-After': '0' },
      }),
    )
    const provider = new NvidiaOpenAiCompatibleProvider({ apiKey: 'nvapi-test', fetchImpl })
    await expect(provider.complete({ ...baseRequest, retry: false })).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    })
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('should not retry HTTP 401', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: { message: 'bad key' } }, 401))
    const provider = new NvidiaOpenAiCompatibleProvider({ apiKey: 'bad', fetchImpl })
    await expect(provider.complete(baseRequest)).rejects.toMatchObject({ code: 'INVALID_KEY' })
    expect(fetchImpl).toHaveBeenCalledOnce()
  })
})
