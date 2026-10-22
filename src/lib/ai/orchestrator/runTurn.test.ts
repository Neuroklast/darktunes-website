import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runAiTurn } from '@/lib/ai/orchestrator/runTurn'
import { DEFAULT_TOKEN_LIMITS } from '@/lib/ai/budget/limits'
import { getModelProfile } from '@/lib/ai/models/profiles'
import { AiProviderError } from '@/lib/ai/provider/errors'
import type { AiProvider } from '@/lib/ai/provider/interface'
import type { AiActor } from '@/lib/ai/auth/requireAiActor'
import type { AiCompletion, AiCompletionRequest, AiStreamEvent } from '@/lib/ai/types/provider'

const state = vi.hoisted(() => ({
  inserted: [] as Array<Record<string, unknown>>,
  updated: [] as Array<{ id: string; patch: Record<string, unknown> }>,
  usageEvents: [] as Array<Record<string, unknown>>,
  history: [] as Array<Record<string, unknown>>,
  settings: {} as Record<string, unknown>,
  reserve: vi.fn(async () => undefined),
  settle: vi.fn(async () => undefined),
  execute: vi.fn(async () => ({ ok: true as const, result: { available: true } })),
  tools: [{ name: 'get_artist_profile', description: 'profile', parameters: { type: 'object' } }],
}))

vi.mock('@/lib/api/aiSettings', () => ({
  getAiSettings: vi.fn(async () => state.settings),
}))

vi.mock('@/lib/api/aiConversations', () => ({
  getAiConversationForUser: vi.fn(async () => ({
    id: 'conv-1',
    userId: 'admin-1',
    artistId: null,
    accessContext: 'admin',
    title: '',
    status: 'active',
    activeRequestId: null,
    activeRequestStartedAt: null,
    cancelRequestedAt: null,
    createdAt: '',
    updatedAt: '',
  })),
  assertConversationContext: vi.fn(),
  claimAiConversationTurn: vi.fn(async () => true),
  releaseAiConversationTurn: vi.fn(async () => undefined),
  isAiTurnCancelRequested: vi.fn(async () => false),
  listAiMessages: vi.fn(async () => state.history),
  insertAiMessage: vi.fn(async (_db: unknown, row: Record<string, unknown>) => {
    const message = { id: `msg-${state.inserted.length + 1}`, ...row }
    state.inserted.push(message)
    return message
  }),
  updateAiMessage: vi.fn(async (_db: unknown, id: string, patch: Record<string, unknown>) => {
    state.updated.push({ id, patch })
  }),
}))

vi.mock('@/lib/api/aiUsage', () => ({
  insertAiUsageEvent: vi.fn(async (_db: unknown, row: Record<string, unknown>) => {
    state.usageEvents.push(row)
  }),
}))

vi.mock('@/lib/ai/budget/manager', () => ({
  TokenBudgetManager: {
    fromLimits: () => ({ reserve: state.reserve, settle: state.settle }),
  },
}))

vi.mock('@/lib/ai/provider/resolveKey', () => ({
  resolveNvidiaApiKey: vi.fn(async () => 'nvapi-test'),
}))

vi.mock('@/lib/ai/tools', () => ({
  listToolDefinitionsForActor: () => state.tools,
  executeRegisteredTool: (...args: unknown[]) => state.execute(...(args as [])),
}))

const actor: AiActor = {
  userId: 'admin-1',
  role: 'admin',
  accessContext: 'admin',
  dashboard: 'admin',
  artistId: null,
  artistMembershipIds: [],
  capabilities: new Set(['admin.panel.full']),
  availableArtists: [],
  serviceDb: {} as AiActor['serviceDb'],
  userDb: {} as AiActor['userDb'],
}

function baseSettings(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    testMode: false,
    provider: 'nvidia',
    modelFast: 'fast-model',
    modelReasoning: 'reasoning-model',
    fallbackModel: '',
    defaultStreaming: true,
    tokenLimits: DEFAULT_TOKEN_LIMITS,
    reasoningSettings: { fastDefault: false, reasoningDefault: true, lowEffort: true },
    featureFlags: { artist: true, editor: true, admin: true },
    timeouts: { completeMs: 20_000, streamMs: 60_000, reasoningMs: 60_000 },
    maxToolRounds: 4,
    providerCapabilities: {},
    lastConnectionTest: null,
    lastSuccessfulConnectionTest: null,
    lastFailedConnectionTest: null,
    updatedAt: '',
    updatedBy: null,
    ...overrides,
  }
}

async function collect(iterator: AsyncGenerator<unknown>): Promise<Array<Record<string, unknown>>> {
  const events: Array<Record<string, unknown>> = []
  for await (const event of iterator) events.push(event as Record<string, unknown>)
  return events
}

function mockProvider(turns: Array<Record<string, unknown>>): AiProvider {
  let index = 0
  const next = () => {
    const turn = turns[Math.min(index, turns.length - 1)] ?? { content: '' }
    index += 1
    return turn
  }
  return {
    id: 'mock',
    getCapabilities: (modelId) => getModelProfile(modelId),
    getUsage: (completion) => completion.usage,
    validateConfiguration: async () => ({
      configured: true,
      provider: 'mock',
      base_url: 'mock://ai',
      models: { fast: 'fast-model', reasoning: 'reasoning-model' },
    }),
    abort: () => undefined,
    async complete(request): Promise<AiCompletion> {
      return completionFromTurn(request, next())
    },
    async *stream(request): AsyncIterable<AiStreamEvent> {
      const turn = next()
      yield { type: 'open', retry_count: 0 }
      const content = typeof turn.content === 'string' ? turn.content : ''
      if (content) yield { type: 'delta', text: content }
      const completion = completionFromTurn(request, turn)
      yield { type: 'usage', usage: completion.usage }
      yield { type: 'done', completion }
    },
  }
}

function completionFromTurn(
  request: AiCompletionRequest,
  turn: Record<string, unknown>,
): AiCompletion {
  const content = typeof turn.content === 'string' ? turn.content : ''
  const toolCalls = Array.isArray(turn.tool_calls)
    ? (turn.tool_calls as AiCompletion['tool_calls'])
    : []
  return {
    request_id: request.request_id,
    model: request.model,
    content,
    reasoning_content:
      typeof turn.reasoning_content === 'string' ? turn.reasoning_content : null,
    tool_calls: toolCalls,
    finish_reason: toolCalls.length > 0 ? 'tool_calls' : 'stop',
    usage: { input_tokens: 4, output_tokens: 2, reasoning_tokens: 0, total_tokens: 6 },
    latency_ms: 1,
    retry_count: 0,
  }
}

describe('runAiTurn', () => {
  beforeEach(() => {
    state.inserted = []
    state.updated = []
    state.usageEvents = []
    state.history = []
    state.settings = baseSettings()
    state.reserve.mockClear()
    state.settle.mockClear()
    state.execute.mockClear()
  })

  it('persists a tool round and pairs the tool reply with its call id', async () => {
    const provider = mockProvider([
      {
        content: '',
        tool_calls: [{ id: 'call_1', name: 'get_artist_profile', arguments: '{}' }],
      },
      { content: 'The profile is complete.' },
    ])
    const events = await collect(
      runAiTurn({
        actor,
        conversationId: 'conv-1',
        userText: 'Is my profile complete?',
        locale: 'en',
        requestId: 'req-1',
        providerOverride: provider,
      }),
    )
    expect(events.some((event) => event.type === 'tool_start')).toBe(true)
    expect(events.some((event) => event.type === 'tool_result')).toBe(true)
    expect(events.at(-1)).toMatchObject({ type: 'done', status: 'complete' })

    const toolRound = state.inserted.find(
      (row) => row.role === 'assistant' && Array.isArray(row.toolCalls) && row.toolCalls.length > 0,
    )
    expect(toolRound).toBeTruthy()
    const toolReply = state.inserted.find((row) => row.role === 'tool')
    expect(toolReply).toMatchObject({ toolCallId: 'call_1' })
    expect(state.updated.at(-1)?.patch).toMatchObject({
      content: 'The profile is complete.',
      status: 'complete',
    })
    expect(state.reserve).toHaveBeenCalledTimes(2)
    expect(state.settle).toHaveBeenCalledTimes(2)
    expect(state.usageEvents.at(-1)).toMatchObject({ success: true })
  })

  it('repairs an empty answer instead of persisting an empty completion', async () => {
    const provider = mockProvider([{ content: '' }, { content: 'Recovered answer.' }])
    const events = await collect(
      runAiTurn({
        actor,
        conversationId: 'conv-1',
        userText: 'Hello',
        locale: 'en',
        requestId: 'req-2',
        providerOverride: provider,
      }),
    )
    expect(events.at(-1)).toMatchObject({ type: 'done', status: 'complete' })
    expect(state.updated.at(-1)?.patch).toMatchObject({
      content: 'Recovered answer.',
      status: 'complete',
    })
  })

  it('reports reasoning-only output as an exhausted reasoning model', async () => {
    const provider = mockProvider([
      { content: '', reasoning_content: 'thinking' },
      { content: '', reasoning_content: 'still thinking' },
    ])
    const events = await collect(
      runAiTurn({
        actor,
        conversationId: 'conv-1',
        userText: 'Analyze this error and correlate the logs',
        locale: 'en',
        requestId: 'req-3',
        mode: 'deep',
        providerOverride: provider,
      }),
    )
    expect(events.find((event) => event.type === 'error')).toMatchObject({
      code: 'AI_REASONING_EXHAUSTED',
    })
    expect(state.updated.at(-1)?.patch).toMatchObject({ status: 'failed' })
  })

  it('marks an aborted turn as cancelled and never calls the provider', async () => {
    const provider = mockProvider([{ content: 'should not run' }])
    const controller = new AbortController()
    controller.abort()
    const events = await collect(
      runAiTurn({
        actor,
        conversationId: 'conv-1',
        userText: 'Hello',
        locale: 'en',
        requestId: 'req-4',
        signal: controller.signal,
        providerOverride: provider,
      }),
    )
    expect(events.find((event) => event.type === 'error')).toMatchObject({ code: 'AI_CANCELLED' })
    expect(state.updated.at(-1)?.patch).toMatchObject({ status: 'cancelled' })
    expect(state.usageEvents.at(-1)).toMatchObject({ success: false, errorCode: 'AI_CANCELLED' })
  })

  it('falls back to a verified fast model before any tool round', async () => {
    state.settings = baseSettings({
      modelFast: 'fast-model',
      modelReasoning: 'reasoning-model',
      fallbackModel: 'fallback-model',
      providerCapabilities: {
        version: 2,
        models: {
          'fallback-model': { supports_streaming: true, supports_tools: true },
        },
        health: {
          'fallback-model': {
            ok: true,
            tested_at: '2026-10-20T00:00:00.000Z',
            supports_streaming: true,
            supports_tools: true,
            supports_enable_thinking: true,
            supports_low_effort: true,
          },
        },
      },
    })
    const provider: AiProvider = {
      ...mockProvider([{ content: 'fallback answer' }]),
      getCapabilities: (modelId) => getModelProfile(modelId),
      async *stream(request): AsyncIterable<AiStreamEvent> {
        if (request.model === 'reasoning-model') {
          throw new AiProviderError('TIMEOUT', 'reasoning timed out')
        }
        yield { type: 'open', retry_count: 0 }
        yield { type: 'delta', text: 'fallback answer' }
        const completion = completionFromTurn(request, { content: 'fallback answer' })
        yield { type: 'done', completion }
      },
    }
    const events = await collect(
      runAiTurn({
        actor,
        conversationId: 'conv-1',
        userText: 'Analyze this error and correlate the logs',
        locale: 'en',
        requestId: 'req-5',
        mode: 'deep',
        providerOverride: provider,
      }),
    )
    expect(events.some((event) => event.type === 'status' && event.state === 'fallback')).toBe(true)
    expect(events.at(-1)).toMatchObject({
      type: 'done',
      model: 'fallback-model',
      fallback_used: true,
    })
  })
})
