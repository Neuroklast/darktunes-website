import { describe, expect, it } from 'vitest'
import { getModelProfile } from '@/lib/ai/models/profiles'
import { AiProviderError } from '@/lib/ai/provider/errors'
import { runNvidiaConnectionTest } from '@/lib/ai/provider/connectionTest'
import type { AiProvider } from '@/lib/ai/provider/interface'
import type {
  AiCompletion,
  AiCompletionRequest,
  AiStreamEvent,
  AiUsage,
} from '@/lib/ai/types/provider'

const USAGE: AiUsage = {
  input_tokens: 4,
  output_tokens: 1,
  reasoning_tokens: 0,
  total_tokens: 5,
}

interface FakeOptions {
  authError?: boolean
  failFastComplete?: 'INVALID_KEY' | 'EMPTY_RESPONSE'
  failReasoningComplete?: 'TIMEOUT' | 'REASONING_ONLY'
  failFastTool?: boolean
}

function completion(request: AiCompletionRequest, content: string, tool = false): AiCompletion {
  return {
    request_id: request.request_id,
    model: request.model,
    content,
    reasoning_content: null,
    tool_calls: tool
      ? [{ id: 'call_1', name: 'echo_test', arguments: '{"ping":"pong"}' }]
      : [],
    finish_reason: tool ? 'tool_calls' : 'stop',
    usage: USAGE,
    latency_ms: 1,
    retry_count: 0,
  }
}

function fakeProvider(options: FakeOptions = {}): AiProvider {
  return {
    id: 'mock',
    async checkAuth() {
      if (options.authError) throw new AiProviderError('INVALID_KEY', 'bad key')
    },
    getCapabilities: (modelId) => getModelProfile(modelId),
    getUsage: (result) => result.usage,
    validateConfiguration: async () => ({
      configured: true,
      provider: 'mock',
      base_url: 'mock://ai',
      models: { fast: 'fast', reasoning: 'reasoning' },
    }),
    abort: () => undefined,
    async complete(request) {
      if (request.request_id === 'connection-test-fast-complete' && options.failFastComplete) {
        throw new AiProviderError(options.failFastComplete, 'fast complete failed')
      }
      if (
        request.request_id === 'connection-test-reasoning-complete' &&
        options.failReasoningComplete
      ) {
        throw new AiProviderError(
          options.failReasoningComplete === 'TIMEOUT' ? 'TIMEOUT' : 'REASONING_ONLY',
          'reasoning complete failed',
        )
      }
      if (request.request_id === 'connection-test-fast-tool' && options.failFastTool) {
        return completion(request, 'I will not call tools.')
      }
      if (request.request_id.endsWith('-tool')) {
        return completion(request, '', true)
      }
      return completion(request, 'pong')
    },
    async *stream(request): AsyncIterable<AiStreamEvent> {
      yield { type: 'open', retry_count: 0 }
      yield { type: 'delta', text: 'po' }
      yield { type: 'delta', text: 'ng' }
      const result = completion(request, 'pong')
      yield { type: 'usage', usage: result.usage }
      yield { type: 'done', completion: result }
    },
  }
}

describe('runNvidiaConnectionTest', () => {
  it('tests auth, fast, reasoning, streaming and tools independently', async () => {
    const result = await runNvidiaConnectionTest({
      apiKey: 'mock',
      provider: fakeProvider(),
      scope: 'all',
    })
    expect(result.ok).toBe(true)
    expect(result.integration_ok).toBe(true)
    expect(result.steps.map((step) => step.id)).toEqual([
      'auth',
      'fast_complete',
      'fast_stream',
      'fast_tool',
      'reasoning_complete',
      'reasoning_stream',
      'reasoning_tool',
      'integration',
    ])
    expect(result.steps.every((step) => step.ok)).toBe(true)
    expect(result.usage.fast?.total_tokens).toBe(5)
    expect(result.usage.reasoning?.total_tokens).toBe(5)
    expect(result.discovered_capabilities).toMatchObject({
      'nvidia/nemotron-3.5-lightning-30b-a3b': { supports_tools: true, supports_streaming: true },
    })
  })

  it('keeps the reasoning tests running when fast completion fails', async () => {
    const result = await runNvidiaConnectionTest({
      apiKey: 'mock',
      provider: fakeProvider({ failFastComplete: 'INVALID_KEY' }),
      scope: 'all',
    })
    expect(result.ok).toBe(false)
    expect(result.integration_ok).toBe(false)
    const fast = result.steps.find((step) => step.id === 'fast_complete')
    expect(fast).toMatchObject({ status: 'failed', error_code: 'INVALID_KEY' })
    expect(result.steps.find((step) => step.id === 'fast_stream')?.status).toBe('skipped')
    expect(result.steps.find((step) => step.id === 'fast_tool')?.status).toBe('skipped')
    expect(result.steps.find((step) => step.id === 'reasoning_complete')?.status).toBe('passed')
  })

  it('marks a reasoning timeout as timed_out without hiding fast success', async () => {
    const result = await runNvidiaConnectionTest({
      apiKey: 'mock',
      provider: fakeProvider({ failReasoningComplete: 'TIMEOUT' }),
      scope: 'all',
    })
    expect(result.ok).toBe(false)
    expect(result.steps.find((step) => step.id === 'reasoning_complete')).toMatchObject({
      ok: false,
      status: 'timed_out',
      error_code: 'TIMEOUT',
    })
    expect(result.steps.find((step) => step.id === 'fast_complete')?.status).toBe('passed')
    expect(result.steps.find((step) => step.id === 'reasoning_stream')?.status).toBe('skipped')
    expect(result.integration_ok).toBe(false)
  })

  it('records TOOL_CALL_UNSUPPORTED for every model separately', async () => {
    const result = await runNvidiaConnectionTest({
      apiKey: 'mock',
      provider: fakeProvider({ failFastTool: true }),
      scope: 'all',
    })
    expect(result.ok).toBe(false)
    expect(result.steps.find((step) => step.id === 'fast_tool')).toMatchObject({
      ok: false,
      error_code: 'TOOL_CALL_UNSUPPORTED',
    })
    expect(result.steps.find((step) => step.id === 'fast_complete')?.status).toBe('passed')
    expect(result.steps.find((step) => step.id === 'reasoning_tool')?.status).toBe('passed')
  })

  it('skips model probes when the key is rejected', async () => {
    const result = await runNvidiaConnectionTest({
      apiKey: 'mock',
      provider: fakeProvider({ authError: true }),
      scope: 'all',
    })
    expect(result.ok).toBe(false)
    expect(result.steps.find((step) => step.id === 'auth')?.status).toBe('failed')
    expect(result.steps.filter((step) => step.status === 'skipped').length).toBe(6)
  })

  it('only runs the requested scope', async () => {
    const result = await runNvidiaConnectionTest({
      apiKey: 'mock',
      provider: fakeProvider(),
      scope: 'fast',
    })
    expect(result.steps.some((step) => step.id.startsWith('reasoning'))).toBe(false)
    expect(result.steps.find((step) => step.id === 'integration')?.ok).toBe(true)
  })
})
