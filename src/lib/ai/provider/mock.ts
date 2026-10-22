import { getModelProfile } from '@/lib/ai/models/profiles'
import { AiProviderError, type AiProviderError as ProviderError } from '@/lib/ai/provider/errors'
import type { AiProvider } from '@/lib/ai/provider/interface'
import {
  EMPTY_AI_USAGE,
  type AiCompletion,
  type AiCompletionRequest,
  type AiProviderErrorCode,
  type AiStreamEvent,
  type AiToolCall,
  type ProviderConfigStatus,
} from '@/lib/ai/types/provider'

export interface MockAiTurn {
  content?: string
  reasoning_content?: string | null
  tool_calls?: AiToolCall[]
  usage?: AiCompletion['usage']
  error?: AiProviderErrorCode
  chunks?: string[]
}

export interface MockAiProviderOptions {
  turns?: MockAiTurn[]
}

export class MockAiProvider implements AiProvider {
  readonly id = 'mock' as const
  private readonly turns: MockAiTurn[]
  private index = 0
  private readonly aborted = new Set<string>()

  constructor(options: MockAiProviderOptions = {}) {
    this.turns = options.turns ?? [{ content: 'Mock assistant reply.' }]
  }

  getCapabilities(modelId: string) {
    return getModelProfile(modelId)
  }

  getUsage(completion: AiCompletion) {
    return completion.usage
  }

  async validateConfiguration(): Promise<ProviderConfigStatus> {
    return {
      configured: true,
      provider: 'mock',
      base_url: 'mock://ai',
      models: {
        fast: getModelProfile('nvidia/nemotron-3.5-lightning-30b-a3b').model_id,
        reasoning: getModelProfile('nvidia/nemotron-3-super-120b-a12b').model_id,
      },
    }
  }

  async checkAuth(): Promise<void> {
    return
  }

  abort(requestId: string): void {
    this.aborted.add(requestId)
  }

  async complete(request: AiCompletionRequest, signal?: AbortSignal): Promise<AiCompletion> {
    this.throwIfAborted(request.request_id, signal)
    const turn = this.nextTurn()
    if (turn.error) throw new AiProviderError(turn.error, `Mock provider error: ${turn.error}`)
    return this.toCompletion(request, turn)
  }

  async *stream(request: AiCompletionRequest, signal?: AbortSignal): AsyncIterable<AiStreamEvent> {
    this.throwIfAborted(request.request_id, signal)
    const turn = this.nextTurn()
    if (turn.error) throw new AiProviderError(turn.error, `Mock provider error: ${turn.error}`)
    yield { type: 'open', retry_count: 0 }
    const chunks = turn.chunks ?? splitContent(turn.content ?? '')
    for (const chunk of chunks) {
      this.throwIfAborted(request.request_id, signal)
      yield { type: 'delta', text: chunk }
    }
    const completion = this.toCompletion(request, turn)
    if (completion.usage.total_tokens > 0) {
      yield { type: 'usage', usage: completion.usage }
    }
    yield { type: 'done', completion }
  }

  private nextTurn(): MockAiTurn {
    const turn = this.turns[Math.min(this.index, this.turns.length - 1)] ?? { content: '' }
    this.index += 1
    return turn
  }

  private toCompletion(request: AiCompletionRequest, turn: MockAiTurn): AiCompletion {
    const toolCalls = turn.tool_calls ?? []
    const content = turn.content ?? ''
    return {
      request_id: request.request_id,
      model: request.model,
      content,
      reasoning_content: turn.reasoning_content ?? null,
      tool_calls: toolCalls,
      finish_reason: toolCalls.length > 0 ? 'tool_calls' : 'stop',
      usage: turn.usage ?? {
        ...EMPTY_AI_USAGE,
        output_tokens: Math.max(1, Math.ceil(content.length / 4)),
        total_tokens: Math.max(1, Math.ceil(content.length / 4)),
      },
      latency_ms: 1,
      retry_count: 0,
    }
  }

  private throwIfAborted(requestId: string, signal?: AbortSignal): void {
    if (this.aborted.has(requestId) || signal?.aborted) {
      throw new AiProviderError('TIMEOUT', 'The mock request was aborted.')
    }
  }
}

function splitContent(content: string): string[] {
  if (!content) return []
  const parts = content.match(/.{1,12}/g)
  return parts ?? [content]
}

export type { ProviderError }
