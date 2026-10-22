import { ApiError, buildApiError } from '@/lib/errors'
import { getAiSettings } from '@/lib/api/aiSettings'
import { insertAiUsageEvent } from '@/lib/api/aiUsage'
import {
  assertConversationContext,
  claimAiConversationTurn,
  getAiConversationForUser,
  insertAiMessage,
  isAiTurnCancelRequested,
  listAiMessages,
  releaseAiConversationTurn,
  updateAiMessage,
  type AiMessageRecord,
} from '@/lib/api/aiConversations'
import { TokenBudgetManager } from '@/lib/ai/budget/manager'
import {
  estimateInputTokens,
  estimateTokens,
  preferProviderUsage,
  sumAiUsage,
  usageFromEstimate,
} from '@/lib/ai/budget/estimator'
import { resolveNvidiaApiKey } from '@/lib/ai/provider/resolveKey'
import { NvidiaOpenAiCompatibleProvider } from '@/lib/ai/provider/nvidia'
import { MockAiProvider } from '@/lib/ai/provider/mock'
import { AiProviderError, isAiProviderError, isRetryableProviderError } from '@/lib/ai/provider/errors'
import { apiErrorFromProvider } from '@/lib/ai/provider/mapToApiError'
import { buildSystemPrompt, type PromptPageContext } from '@/lib/ai/prompts/system'
import { slideConversationWindow } from '@/lib/ai/context/window'
import { buildProviderHistory } from '@/lib/ai/orchestrator/history'
import { executeRegisteredTool, listToolDefinitionsForActor } from '@/lib/ai/tools'
import { toolLabel } from '@/lib/ai/tools/labels'
import { abortAiTurn, beginAiTurn, conversationTurnKey, endAiTurn } from '@/lib/ai/orchestrator/abortRegistry'
import { parseStoredCapabilities, isModelVerified } from '@/lib/ai/models/capabilities'
import { classifyTurn } from '@/lib/ai/models/classify'
import { shouldEnableThinking } from '@/lib/ai/models/profiles'
import type { ClientSseEvent } from '@/lib/ai/orchestrator/sse'
import type { AiActor } from '@/lib/ai/auth/requireAiActor'
import type { AiProvider } from '@/lib/ai/provider/interface'
import type {
  AiChatMessage,
  AiCompletion,
  AiModelRole,
  AiTurnMode,
  AiUsage,
} from '@/lib/ai/types/provider'

export interface RunTurnInput {
  actor: AiActor
  conversationId: string
  userText: string
  page?: PromptPageContext | null
  locale: 'en' | 'de' | 'fr'
  requestId: string
  mode?: AiTurnMode
  reuseLastUser?: boolean
  signal?: AbortSignal
  providerOverride?: AiProvider
}

const TURN_DEADLINE_MS = 105_000
const MIN_ROUND_MS = 5_000
const RECENT_MESSAGE_LIMIT = 80

export async function* runAiTurn(input: RunTurnInput): AsyncGenerator<ClientSseEvent> {
  const startedAt = Date.now()
  const { actor } = input
  const settings = await getAiSettings(actor.serviceDb)
  const allowMock = Boolean(input.providerOverride) || (settings.testMode && process.env.NODE_ENV !== 'production')
  const enabled = settings.enabled || process.env.AI_ENABLED === 'true'
  if (!enabled && !allowMock) throw buildApiError('AI_DISABLED', 503)
  if (!settings.featureFlags[actor.accessContext] && !allowMock) {
    throw buildApiError('AI_DISABLED_FOR_ROLE', 403)
  }

  const conversation = await getAiConversationForUser(
    actor.serviceDb,
    input.conversationId,
    actor.userId,
  )
  assertConversationContext(conversation, actor)

  const apiKey = await resolveNvidiaApiKey(actor.serviceDb)
  const stored = parseStoredCapabilities(settings.providerCapabilities)
  const provider: AiProvider | null =
    input.providerOverride ??
    (apiKey
      ? new NvidiaOpenAiCompatibleProvider({
          apiKey,
          discoveredCapabilities: stored.models,
        })
      : allowMock
        ? new MockAiProvider()
        : null)
  if (!provider) throw buildApiError('AI_NOT_CONFIGURED', 503)

  const classification = classifyTurn({
    text: input.userText,
    accessContext: actor.accessContext,
    mode: input.mode,
  })
  // Auto mode never sends a turn to a reasoning model whose last test
  // explicitly failed. Explicit Deep still tries it and offers a fast retry.
  const initialRole: AiModelRole =
    classification.role === 'reasoning' &&
    classification.reason !== 'explicit' &&
    stored.health[settings.modelReasoning]?.ok === false
      ? 'fast'
      : classification.role
  const fallbackModel = settings.fallbackModel.trim()
  const canFallback = Boolean(
    initialRole === 'reasoning' &&
      fallbackModel &&
      fallbackModel !== settings.modelFast &&
      isModelVerified(stored.health, fallbackModel, ['supports_streaming', 'supports_tools']),
  )

  const history = await listAiMessages(actor.serviceDb, conversation.id, RECENT_MESSAGE_LIMIT)
  const reuseIndex = input.reuseLastUser ? findLastUserIndex(history) : -1
  const trailing = reuseIndex >= 0 ? history.slice(reuseIndex + 1) : []
  const reuseLastUser = Boolean(
    input.reuseLastUser &&
      reuseIndex >= 0 &&
      history[reuseIndex]?.content.trim() === input.userText.trim() &&
      trailing.every(isRetryableTailMessage),
  )
  const historyForProvider = reuseLastUser ? history.slice(0, reuseIndex + 1) : history
  const providerHistory = buildProviderHistory(historyForProvider)

  let currentModel = initialRole === 'reasoning' ? settings.modelReasoning : settings.modelFast
  let currentRole: AiModelRole = initialRole
  let caps = provider.getCapabilities(currentModel)
  let useTools = caps.supports_tools && (!settings.defaultStreaming || caps.supports_tools_with_streaming)
  const allToolDefinitions = listToolDefinitionsForActor(actor)
  let tools = useTools ? allToolDefinitions : []

  const systemPrompt = buildSystemPrompt({
    accessContext: actor.accessContext,
    dashboard: actor.dashboard,
    artistName: actor.artistId
      ? actor.availableArtists.find((artist) => artist.id === actor.artistId)?.name ?? null
      : null,
    page: input.page,
    locale: input.locale,
    toolsAvailable: useTools,
  })

  const messages: AiChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...slideConversationWindow(providerHistory, settings.tokenLimits.max_conversation_context_tokens),
  ]
  if (!reuseLastUser) messages.push({ role: 'user', content: input.userText })

  const maxToolRounds = Math.max(
    1,
    settings.maxToolRounds ||
      (initialRole === 'reasoning'
        ? settings.tokenLimits.max_tool_rounds.reasoning
        : settings.tokenLimits.max_tool_rounds.fast),
  )
  const budget = TokenBudgetManager.fromLimits(actor.serviceDb, settings.tokenLimits)
  const claimed = await claimAiConversationTurn(actor.serviceDb, conversation.id, input.requestId)
  if (!claimed) throw buildApiError('AI_TURN_IN_PROGRESS', 409)

  const controller = beginAiTurn(conversationTurnKey(conversation.id))
  const onAbort = () => controller.abort()
  input.signal?.addEventListener('abort', onAbort)
  if (input.signal?.aborted) controller.abort()
  let deadlineHit = false
  const deadlineTimer = setTimeout(() => {
    deadlineHit = true
    controller.abort()
  }, TURN_DEADLINE_MS)

  const metrics = createMetrics(startedAt)
  let activeReservation: string | null = null
  let assistantMessageId: string | null = null
  let usage: AiUsage = usageFromEstimate(0, 0)
  let estimatedUsage = false
  let rounds = 0
  let toolRounds = 0
  let fallbackUsed = false
  let forceFinal = false
  let repairAttempted = false
  let firstTokenAt: number | null = null
  let currentRoundUsage: AiUsage | null = null
  let currentRoundContent = ''
  let currentRoundReasoning = ''
  let currentRoundRetries = 0
  let lastFinishReason: AiCompletion['finish_reason'] = 'unknown'
  let fallbackFrom: string | null = null
  const toolDurationMs: number[] = []

  const metadata: Record<string, unknown> = {
    request_id: input.requestId,
    mode: classification.mode,
    model_role: initialRole,
    turn_status: 'queued',
  }

  try {
    const outputCap = outputCapFor(currentRole, settings.tokenLimits)
    const initialEstimate = estimateInputTokens(messages, tools)
    await reserveRound(`${input.requestId}:0`, initialEstimate.total_input, outputCap)
    metrics.mark('budget_reserved')

    if (!reuseLastUser) {
      await insertAiMessage(actor.serviceDb, {
        conversationId: conversation.id,
        role: 'user',
        content: input.userText,
      })
    }
    const placeholder = await insertAiMessage(actor.serviceDb, {
      conversationId: conversation.id,
      role: 'assistant',
      content: '',
      model: currentModel,
      status: 'streaming',
      metadata: { ...metadata, turn_status: 'connecting' },
    })
    assistantMessageId = placeholder.id
    yield { type: 'status', state: 'connecting', model: currentModel }
    metrics.mark('conversation_loaded')

    while (true) {
      if (controller.signal.aborted) throw cancelledError()
      if (await isAiTurnCancelRequested(actor.serviceDb, conversation.id).catch(() => false)) {
        controller.abort()
        throw cancelledError()
      }
      const remaining = TURN_DEADLINE_MS - (Date.now() - startedAt)
      if (remaining < MIN_ROUND_MS) {
        throw new AiProviderError(
          'TIMEOUT',
          'The assistant turn reached its time limit before a complete answer arrived.',
        )
      }

      caps = provider.getCapabilities(currentModel)
      useTools = caps.supports_tools && (!settings.defaultStreaming || caps.supports_tools_with_streaming) && !forceFinal
      tools = useTools ? allToolDefinitions : []
      const outputCap = outputCapFor(currentRole, settings.tokenLimits)
      const roundEstimate = estimateInputTokens(messages, tools)
      if (rounds > 0) {
        await reserveRound(`${input.requestId}:${rounds}`, roundEstimate.total_input, outputCap)
      }
      const roundReservation = activeReservation

      const thinking = shouldEnableThinking(
        currentRole,
        classification.reason === 'diagnostic' ? 'complex' : 'simple',
        caps,
      )
      const lowEffort =
        currentRole === 'reasoning' &&
        settings.reasoningSettings.lowEffort &&
        caps.supports_low_effort
      const reasoningBudget =
        currentRole === 'reasoning' &&
        caps.supports_reasoning_budget &&
        !lowEffort &&
        settings.tokenLimits.reasoning.max_reasoning_tokens > 0
          ? Math.min(
              settings.tokenLimits.reasoning.max_reasoning_tokens,
              Math.max(512, outputCap - 1024),
            )
          : undefined

      const request = {
        request_id: `${input.requestId}:${rounds}`,
        model: currentModel,
        messages,
        ...(tools.length > 0 ? { tools } : {}),
        max_tokens: outputCap,
        enable_thinking: thinking,
        low_effort: lowEffort,
        force_nonempty_content: !thinking && caps.supports_force_nonempty_content,
        ...(reasoningBudget ? { reasoning_budget: reasoningBudget } : {}),
        ...(caps.supports_reasoning_effort && !lowEffort && currentRole === 'reasoning'
          ? { reasoning_effort: settings.reasoningSettings.lowEffort ? ('low' as const) : ('high' as const) }
          : {}),
        timeout_ms: Math.max(
          MIN_ROUND_MS,
          Math.min(
            settings.defaultStreaming
              ? currentRole === 'reasoning'
                ? settings.timeouts.reasoningMs
                : settings.timeouts.streamMs
              : settings.timeouts.completeMs,
            remaining,
          ),
        ),
      }

      currentRoundUsage = null
      currentRoundContent = ''
      currentRoundReasoning = ''
      currentRoundRetries = 0
      let completion: AiCompletion | null = null
      metrics.mark('provider_request_started')
      yield {
        type: 'status',
        state: currentRole === 'reasoning' ? 'thinking' : 'waiting',
        model: currentModel,
      }

      try {
        if (settings.defaultStreaming) {
          for await (const event of provider.stream(request, controller.signal)) {
            if (event.type === 'open') {
              currentRoundRetries = event.retry_count
              metrics.mark('provider_headers_received')
            } else if (event.type === 'reasoning_delta') {
              if (!currentRoundReasoning) yield { type: 'status', state: 'thinking', model: currentModel }
              currentRoundReasoning += event.text
              if (firstTokenAt === null) firstTokenAt = Date.now()
            } else if (event.type === 'delta') {
              if (firstTokenAt === null) {
                firstTokenAt = Date.now()
                metrics.mark('first_token_received')
                yield { type: 'status', state: 'streaming', model: currentModel }
              }
              currentRoundContent += event.text
              yield { type: 'delta', text: event.text }
            } else if (event.type === 'usage') {
              currentRoundUsage = event.usage
            } else if (event.type === 'done') {
              completion = event.completion
            }
          }
        } else {
          completion = await provider.complete(request, controller.signal)
          currentRoundContent = completion.content
          currentRoundRetries = completion.retry_count
          if (completion.content) {
            firstTokenAt = Date.now()
            metrics.mark('first_token_received')
            yield { type: 'delta', text: completion.content }
          }
        }
      } catch (error) {
        const providerError = normalizeError(error)
        if (
          !controller.signal.aborted &&
          canFallback &&
          !fallbackUsed &&
          toolRounds === 0 &&
          !currentRoundContent.trim() &&
          shouldFallback(providerError)
        ) {
          const partial = partialUsage(roundEstimate.total_input, currentRoundContent, currentRoundReasoning, [])
          await settleRound(roundReservation, partial.total_tokens)
          usage = sumAiUsage(usage, partial)
          estimatedUsage = true
          activeReservation = null
          fallbackUsed = true
          fallbackFrom = currentModel
          currentModel = fallbackModel
          currentRole = 'fast'
          forceFinal = false
          repairAttempted = false
          yield { type: 'status', state: 'fallback', model: currentModel }
          rounds += 1
          continue
        }
        throw providerError
      }

      if (!completion) {
        throw new AiProviderError(
          'STREAM_INCOMPLETE',
          'The model connection ended before a complete answer arrived.',
        )
      }
      metrics.mark('provider_completed')
      lastFinishReason = completion.finish_reason
      const roundUsage = preferProviderUsage(
        usageFromEstimate(
          roundEstimate.total_input,
          estimateTokens(completion.content) +
            estimateTokens(completion.reasoning_content ?? '') +
            estimateTokens(JSON.stringify(completion.tool_calls)),
        ),
        currentRoundUsage ?? (completion.usage.total_tokens > 0 ? completion.usage : null),
      )
      estimatedUsage ||= !currentRoundUsage && completion.usage.total_tokens === 0
      await settleRound(roundReservation, roundUsage.total_tokens)
      activeReservation = null
      usage = sumAiUsage(usage, roundUsage)
      yield {
        type: 'usage',
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        reasoning_tokens: usage.reasoning_tokens,
        total_tokens: usage.total_tokens,
      }

      const hasText = completion.content.trim().length > 0
      const hasToolCalls = completion.tool_calls.length > 0

      if (hasToolCalls && !forceFinal) {
        await insertAiMessage(actor.serviceDb, {
          conversationId: conversation.id,
          role: 'assistant',
          content: completion.content,
          model: completion.model,
          status: 'complete',
          toolCalls: completion.tool_calls,
          metadata: {
            ...metadata,
            kind: 'tool_round',
            round: rounds,
            turn_status: 'tool_running',
          },
        })
        messages.push({
          role: 'assistant',
          content: completion.content,
          tool_calls: completion.tool_calls,
        })

        for (const call of completion.tool_calls) {
          if (controller.signal.aborted) throw cancelledError()
          if (await isAiTurnCancelRequested(actor.serviceDb, conversation.id).catch(() => false)) {
            controller.abort()
            throw cancelledError()
          }
          const label = toolLabel(call.name)
          yield { type: 'tool_start', tool_call_id: call.id, tool_name: call.name, label }
          const toolStarted = Date.now()
          let parsedArgs: unknown = {}
          let invalidArgs = false
          try {
            parsedArgs = call.arguments ? JSON.parse(call.arguments) : {}
          } catch {
            invalidArgs = true
          }
          const executed = invalidArgs
            ? {
                ok: false as const,
                error: 'The tool arguments were invalid JSON. Correct the arguments and call the tool again.',
                error_code: 'AI_TOOL_FAILED' as const,
              }
            : await executeRegisteredTool(call.name, parsedArgs, {
                actor,
                requestId: input.requestId,
                signal: controller.signal,
              })
          const durationMs = Date.now() - toolStarted
          toolDurationMs.push(durationMs)
          const available = executed.ok ? isAvailable(executed.result) : false
          yield {
            type: 'tool_result',
            tool_call_id: call.id,
            tool_name: call.name,
            label,
            ok: executed.ok,
            available,
            duration_ms: durationMs,
          }
          const resultContent = executed.ok
            ? omitConfirmationToken(executed.result)
            : { error: executed.error }
          if (executed.ok && isConfirmationResult(executed.result)) {
            yield {
              type: 'confirmation_required',
              action: executed.result.action,
              confirmation_token: executed.result.confirmation_token,
              summary: executed.result.summary,
            }
          }
          await insertAiMessage(actor.serviceDb, {
            conversationId: conversation.id,
            role: 'tool',
            content: JSON.stringify(resultContent),
            toolCallId: call.id,
            metadata: {
              tool_name: call.name,
              ok: executed.ok,
              duration_ms: durationMs,
              available,
            },
          })
          messages.push({
            role: 'tool',
            name: call.name,
            tool_call_id: call.id,
            content: JSON.stringify(resultContent),
          })
        }

        toolRounds += 1
        if (toolRounds >= maxToolRounds) {
          forceFinal = true
          messages.push({
            role: 'user',
            content:
              'Instruction: you have reached the tool limit. Answer now with the information already gathered. Do not request more tools.',
          })
        }
        rounds += 1
        continue
      }

      if (!hasText) {
        if (
          canFallback &&
          !fallbackUsed &&
          toolRounds === 0 &&
          shouldFallbackReasoningEmpty(completion)
        ) {
          fallbackUsed = true
          fallbackFrom = currentModel
          currentModel = fallbackModel
          currentRole = 'fast'
          forceFinal = false
          repairAttempted = false
          yield { type: 'status', state: 'fallback', model: currentModel }
          rounds += 1
          continue
        }
        if (!repairAttempted) {
          repairAttempted = true
          forceFinal = true
          messages.push({
            role: 'user',
            content:
              'Instruction: return a visible answer now. Do not call tools. If the data is unavailable, say so and explain what the user can do next.',
          })
          rounds += 1
          continue
        }
        if (completion.reasoning_content) {
          throw new AiProviderError(
            'REASONING_ONLY',
            'The model used its output on reasoning but produced no answer. Retry with the fast model or raise the reasoning output limit.',
          )
        }
        if (completion.finish_reason === 'length') {
          throw new AiProviderError(
            'OUTPUT_TRUNCATED',
            'The model hit the output limit before producing answer text. Retry with the fast model or raise the output limit.',
          )
        }
        throw new AiProviderError(
          'EMPTY_RESPONSE',
          'The model returned no visible answer.',
        )
      }

      const incomplete = completion.finish_reason === 'length'
      const finalMetadata = {
        ...metadata,
        turn_status: incomplete ? 'failed' : 'completed',
        finish_reason: completion.finish_reason,
        fallback_used: fallbackUsed,
        fallback_from: fallbackFrom,
        tool_rounds: toolRounds,
        rounds: rounds + 1,
        retry_count: currentRoundRetries,
        ...(incomplete ? { error_code: 'AI_OUTPUT_TRUNCATED' } : {}),
        ...metrics.snapshot({
          ttftMs: firstTokenAt ? firstTokenAt - startedAt : null,
          toolDurationMs,
          fallbackUsed,
        }),
      }
      await updateAiMessage(actor.serviceDb, placeholder.id, {
        content: completion.content,
        model: completion.model,
        status: incomplete ? 'incomplete' : 'complete',
        tokenUsage: { ...usage },
        metadata: finalMetadata,
      })
      metrics.mark('message_persisted')

      if (incomplete) {
        yield {
          type: 'warning',
          code: 'AI_OUTPUT_TRUNCATED',
          detail:
            'The answer was cut off at the output limit. Retry with the fast model or raise the limit in Admin -> AI Assistant -> Models.',
        }
      }
      await logUsage({
        usage,
        success: !incomplete,
        errorCode: incomplete ? 'AI_OUTPUT_TRUNCATED' : null,
        rounds: rounds + 1,
        metadata: finalMetadata,
      })
      metrics.mark('response_finished')
      yield {
        type: 'done',
        model: completion.model,
        status: incomplete ? 'incomplete' : 'complete',
        mode: classification.mode,
        fallback_used: fallbackUsed,
      }
      return
    }
  } catch (error) {
    const cancelled =
      !deadlineHit && (controller.signal.aborted || Boolean(input.signal?.aborted))
    const providerError = normalizeError(error)
    const apiError = cancelled
      ? buildApiError('AI_CANCELLED', 499)
      : isAiProviderError(providerError)
        ? apiErrorFromProvider(providerError)
        : error instanceof ApiError
          ? error
          : buildApiError('SERVER_ERROR', 500)

    const partial = activeReservation
      ? preferProviderUsage(
          partialUsage(
            estimateInputTokens(messages, tools).total_input,
            currentRoundContent,
            currentRoundReasoning,
            [],
          ),
          currentRoundUsage,
        )
      : usageFromEstimate(0, 0)
    if (activeReservation) {
      await settleRound(activeReservation, partial.total_tokens)
      activeReservation = null
    }
    if (assistantMessageId) {
      await updateAiMessage(actor.serviceDb, assistantMessageId, {
        content: currentRoundContent,
        model: currentModel,
        status: cancelled ? 'cancelled' : 'failed',
        tokenUsage: { ...usage },
        metadata: {
          ...metadata,
          turn_status: cancelled ? 'cancelled' : 'failed',
          error_code: apiError.code ?? 'SERVER_ERROR',
          finish_reason: lastFinishReason,
          fallback_used: fallbackUsed,
          fallback_from: fallbackFrom,
          tool_rounds: toolRounds,
          rounds,
          ...metrics.snapshot({ ttftMs: firstTokenAt ? firstTokenAt - startedAt : null, toolDurationMs, fallbackUsed }),
        },
      }).catch((messageError) => {
        console.warn('[ai] failed to persist turn failure:', messageError instanceof Error ? messageError.message : 'unknown')
      })
    }
    const failedUsage = sumAiUsage(usage, partial)
    await logUsage({
      usage: failedUsage,
      success: false,
      errorCode: cancelled ? 'AI_CANCELLED' : apiError.code ?? 'SERVER_ERROR',
      rounds: Math.max(1, rounds),
      metadata: {
        ...metadata,
        turn_status: cancelled ? 'cancelled' : 'failed',
        error_code: cancelled ? 'AI_CANCELLED' : apiError.code ?? 'SERVER_ERROR',
        finish_reason: lastFinishReason,
        fallback_used: fallbackUsed,
        ...metrics.snapshot({ ttftMs: firstTokenAt ? firstTokenAt - startedAt : null, toolDurationMs, fallbackUsed }),
      },
    })
    yield {
      type: 'error',
      code: apiError.code ?? 'SERVER_ERROR',
      detail: cancelled ? 'The answer was stopped.' : apiError.message,
      retryable: cancelled || isRetryableCode(apiError.code, providerError),
      suggested_model_role:
        !cancelled &&
        currentRole === 'reasoning' &&
        (apiError.code === 'AI_REASONING_EXHAUSTED' ||
          apiError.code === 'AI_PROVIDER_TIMEOUT' ||
          apiError.code === 'AI_OUTPUT_TRUNCATED' ||
          apiError.code === 'AI_EMPTY_RESPONSE' ||
          apiError.code === 'AI_PROVIDER_MODEL_UNAVAILABLE')
          ? 'fast'
          : null,
    }
    return
  } finally {
    clearTimeout(deadlineTimer)
    input.signal?.removeEventListener('abort', onAbort)
    endAiTurn(conversationTurnKey(conversation.id))
    await releaseAiConversationTurn(actor.serviceDb, conversation.id, input.requestId).catch(
      () => undefined,
    )
  }

  async function reserveRound(
    reservationId: string,
    estimatedInputTokens: number,
    estimatedOutputTokens: number,
  ): Promise<void> {
    await budget.reserve({
      requestId: reservationId,
      userId: actor.userId,
      role: actor.role,
      modelRole: currentRole,
      estimatedInputTokens,
      estimatedOutputTokens,
    })
    activeReservation = reservationId
  }

  async function settleRound(reservationId: string | null, consumed: number): Promise<void> {
    if (!reservationId) return
    await budget.settle(reservationId, Math.max(0, Math.round(consumed))).catch((error) => {
      console.warn('[ai] budget settle failed:', error instanceof Error ? error.message : 'unknown')
    })
  }

  async function logUsage(inputLog: {
    usage: AiUsage
    success: boolean
    errorCode: string | null
    rounds: number
    metadata: Record<string, unknown>
  }): Promise<void> {
    await insertAiUsageEvent(actor.serviceDb, {
      userId: actor.userId,
      artistId: actor.artistId,
      conversationId: conversation.id,
      requestId: input.requestId,
      model: currentModel,
      usage: inputLog.usage,
      usageSource: estimatedUsage ? 'estimate' : 'provider',
      operationType: 'chat',
      success: inputLog.success,
      errorCode: inputLog.errorCode,
      latencyMs: Date.now() - startedAt,
      ttftMs: firstTokenAt ? firstTokenAt - startedAt : null,
      rounds: inputLog.rounds,
      metadata: inputLog.metadata,
    }).catch((error) => {
      console.warn('[ai] usage event could not be stored:', error instanceof Error ? error.message : 'unknown')
    })
  }
}

function outputCapFor(
  role: AiModelRole,
  limits: { fast: { max_output_tokens: number }; reasoning: { max_output_tokens: number } },
): number {
  return role === 'reasoning'
    ? limits.reasoning.max_output_tokens
    : limits.fast.max_output_tokens
}

function findLastUserIndex(history: AiMessageRecord[]): number {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (history[index]?.role === 'user') return index
  }
  return -1
}

function isRetryableTailMessage(message: AiMessageRecord): boolean {
  if (message.role === 'tool') return true
  return message.role === 'assistant' && (message.status === 'failed' || message.status === 'cancelled')
}

function createMetrics(startedAt: number): {
  mark: (name: string) => void
  snapshot: (extra: {
    ttftMs: number | null
    toolDurationMs: number[]
    fallbackUsed: boolean
  }) => Record<string, unknown>
} {
  const marks: Record<string, number> = {}
  return {
    mark: (name) => {
      marks[name] = Date.now() - startedAt
    },
    snapshot: (extra) => ({
      metrics: {
        ...marks,
        total_ms: Date.now() - startedAt,
        ttft_ms: extra.ttftMs,
        tool_ms: extra.toolDurationMs.reduce((sum, value) => sum + value, 0),
        tool_calls: extra.toolDurationMs.length,
        fallback_used: extra.fallbackUsed,
      },
    }),
  }
}

function partialUsage(
  inputTokens: number,
  content: string,
  reasoning: string,
  toolCalls: unknown[],
): AiUsage {
  const output =
    estimateTokens(content) +
    estimateTokens(reasoning) +
    (toolCalls.length > 0 ? estimateTokens(JSON.stringify(toolCalls)) : 0)
  return usageFromEstimate(inputTokens, output)
}

function normalizeError(error: unknown): AiProviderError | Error {
  if (error instanceof AiProviderError) return error
  if (error instanceof Error) return error
  return new Error(String(error))
}

function cancelledError(): AiProviderError {
  return new AiProviderError('TIMEOUT', 'The answer was stopped.')
}

function shouldFallback(error: Error): boolean {
  if (!isAiProviderError(error)) return false
  return (
    error.code === 'TIMEOUT' ||
    error.code === 'PROVIDER_UNAVAILABLE' ||
    error.code === 'MODEL_UNAVAILABLE' ||
    error.code === 'RATE_LIMITED' ||
    error.code === 'EMPTY_RESPONSE' ||
    error.code === 'OUTPUT_TRUNCATED' ||
    error.code === 'REASONING_ONLY' ||
    error.code === 'STREAM_INCOMPLETE'
  )
}

function shouldFallbackReasoningEmpty(completion: AiCompletion): boolean {
  return (
    Boolean(completion.reasoning_content) ||
    completion.finish_reason === 'length' ||
    completion.finish_reason === 'stop'
  )
}

function isRetryableCode(code: string | undefined, error: Error): boolean {
  if (!code) return false
  if (code === 'AI_STREAM_INCOMPLETE' || code === 'AI_EMPTY_RESPONSE' || code === 'AI_OUTPUT_TRUNCATED' || code === 'AI_REASONING_EXHAUSTED') {
    return true
  }
  if (isAiProviderError(error)) {
    return isRetryableProviderError(error.code, error.httpStatus ?? null)
  }
  return false
}

function isAvailable(result: unknown): boolean {
  if (!result || typeof result !== 'object') return true
  const record = result as Record<string, unknown>
  if (record.available === false) return false
  if (Array.isArray(record.releases) && record.releases.length === 0) return false
  if (Array.isArray(record.submissions) && record.submissions.length === 0) return false
  if (Array.isArray(record.statements) && record.statements.length === 0) return false
  if (Array.isArray(record.invoices) && record.invoices.length === 0) return false
  if (Array.isArray(record.events) && record.events.length === 0) return false
  if (Array.isArray(record.tours) && record.tours.length === 0) return false
  if (Array.isArray(record.documents) && record.documents.length === 0) return false
  if (Array.isArray(record.errors) && record.errors.length === 0) return false
  if (Array.isArray(record.tickets) && record.tickets.length === 0) return false
  return true
}

function isConfirmationResult(
  value: unknown,
): value is { action: string; confirmation_token: string; summary: string } {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return (
    typeof record.confirmation_token === 'string' &&
    typeof record.action === 'string' &&
    typeof record.summary === 'string'
  )
}

function omitConfirmationToken(value: unknown): unknown {
  if (!isConfirmationResult(value)) return value
  const rest = { ...(value as Record<string, unknown>) }
  delete rest.confirmation_token
  return rest
}

export { abortAiTurn, conversationTurnKey }
