import { FAST_MODEL_ID, REASONING_MODEL_ID, getModelProfile, mergeDiscoveredCapabilities } from '@/lib/ai/models/profiles'
import { AiProviderError, isAiProviderError } from '@/lib/ai/provider/errors'
import { NvidiaOpenAiCompatibleProvider } from '@/lib/ai/provider/nvidia'
import type { AiProvider } from '@/lib/ai/provider/interface'
import type { AiModelRole, AiProviderErrorCode, AiUsage, ModelCapabilities } from '@/lib/ai/types/provider'

export const CONNECTION_TEST_ECHO_TOOL = {
  name: 'echo_test',
  description: 'Return the provided ping string unchanged. Harmless connection-test tool.',
  parameters: {
    type: 'object',
    properties: { ping: { type: 'string' } },
    required: ['ping'],
  },
} as const

export type ConnectionTestScope = 'fast' | 'reasoning' | 'all'

export interface ConnectionTestStepResult {
  id: string
  step: string
  model: string | null
  ok: boolean
  status: 'passed' | 'failed' | 'timed_out' | 'unavailable' | 'not_tested' | 'skipped'
  latency_ms: number
  http_status: number | null
  error_code: AiProviderErrorCode | null
  detail: string | null
  technical: Record<string, unknown> | null
}

export interface ConnectionTestModelResult {
  model: string
  role: AiModelRole
  ok: boolean
  tested_at: string
  steps: ConnectionTestStepResult[]
}

export interface ConnectionTestResult {
  ok: boolean
  integration_ok: boolean
  scope: ConnectionTestScope
  started_at: string
  finished_at: string
  total_latency_ms: number
  steps: ConnectionTestStepResult[]
  models: Record<string, ConnectionTestModelResult>
  discovered_capabilities: Record<string, Partial<ModelCapabilities>>
  usage: { fast: AiUsage | null; reasoning: AiUsage | null }
}

const HARMLESS_USER_PROMPT = 'Reply with the single word pong.'
const STEP_TIMEOUT_MS = { fast: 20_000, reasoning: 60_000 }
const TOTAL_BUDGET_MS = 100_000

export async function runNvidiaConnectionTest(options: {
  apiKey: string
  provider?: AiProvider
  fetchImpl?: typeof fetch
  fastModel?: string
  reasoningModel?: string
  scope?: ConnectionTestScope
}): Promise<ConnectionTestResult> {
  const started = Date.now()
  const startedAt = new Date(started).toISOString()
  const scope = options.scope ?? 'all'
  const fastModel = options.fastModel?.trim() || FAST_MODEL_ID
  const reasoningModel = options.reasoningModel?.trim() || REASONING_MODEL_ID
  const provider =
    options.provider ??
    new NvidiaOpenAiCompatibleProvider({ apiKey: options.apiKey, fetchImpl: options.fetchImpl })
  const steps: ConnectionTestStepResult[] = []
  const discovered: Record<string, Partial<ModelCapabilities>> = {}
  const models: Record<string, ConnectionTestModelResult> = {}
  const usage: ConnectionTestResult['usage'] = { fast: null, reasoning: null }

  const auth = await runStep('auth', null, async () => {
    if (provider.checkAuth) {
      await provider.checkAuth()
      return
    }
    const status = await provider.validateConfiguration()
    if (!status.configured) {
      throw new AiProviderError('INVALID_KEY', 'No NVIDIA API key is configured.')
    }
  })
  if (auth.ok) {
    auth.detail = options.provider ? 'Local provider credentials present; remote access is verified by each live model probe.' : 'NVIDIA accepted the API key on GET /v1/models.'
  }
  steps.push(auth)
  if (!auth.ok) {
    pushSkippedRemaining('auth failed')
    return finish(false)
  }

  const selected: Array<{ id: string; role: AiModelRole }> = []
  if (scope === 'fast' || scope === 'all') selected.push({ id: fastModel, role: 'fast' })
  if (scope === 'reasoning' || scope === 'all') selected.push({ id: reasoningModel, role: 'reasoning' })

  for (const entry of selected) {
    if (Date.now() - started > TOTAL_BUDGET_MS) {
      pushSkipped(entry.id, entry.role, 'Total test budget exhausted before this model.')
      continue
    }
    const modelSteps = await testModel(entry.id, entry.role)
    models[entry.id] = {
      model: entry.id,
      role: entry.role,
      ok: modelSteps.every((step) => step.ok || step.status === 'skipped'),
      tested_at: new Date().toISOString(),
      steps: modelSteps,
    }
    steps.push(...modelSteps)
  }

  const required = steps.filter((step) => step.id !== 'integration')
  const integration = runStepSync(
    'integration',
    null,
    required.every((step) => step.ok),
    required.every((step) => step.ok)
      ? 'Every requested capability passed.'
      : `One or more required checks failed: ${required
          .filter((step) => !step.ok)
          .map((step) => step.id)
          .join(', ')}.`,
  )
  steps.push(integration)

  const integrationOk = integration.ok
  return finish(integrationOk)

  async function testModel(model: string, role: AiModelRole): Promise<ConnectionTestStepResult[]> {
    const out: ConnectionTestStepResult[] = []
    const timeoutMs = STEP_TIMEOUT_MS[role]
    const completeId = `${role}_complete`
    const streamId = `${role}_stream`
    const toolId = `${role}_tool`
    const toolStreamId = `${role}_tool_stream`
    const thinking = role === 'reasoning'
    const lowEffort = role === 'reasoning'

    const complete = await runStep(completeId, model, async () => {
      const completion = await provider.complete({
        request_id: `connection-test-${role}-complete`,
        model,
        messages: [{ role: 'user', content: HARMLESS_USER_PROMPT }],
        max_tokens: role === 'reasoning' ? 1024 : 32,
        enable_thinking: thinking,
        low_effort: lowEffort,
        force_nonempty_content: !thinking,
        timeout_ms: timeoutMs,
        retry: false,
      })
      usage[role] = completion.usage
      const advertised = provider.getCapabilities(model)
      discovered[model] = {
        ...(discovered[model] ?? {}),
        ...(thinking && advertised.supports_enable_thinking ? { supports_enable_thinking: true } : {}),
        ...(thinking && lowEffort && advertised.supports_low_effort ? { supports_low_effort: true } : {}),
      }
    })
    out.push(complete)
    if (!complete.ok) {
      out.push(skippedStep(streamId, model, 'complete failed'))
      out.push(skippedStep(toolId, model, 'complete failed'))
      out.push(skippedStep(toolStreamId, model, 'complete failed'))
      return out
    }

    const stream = await runStep(streamId, model, async () => {
      let sawDelta = false
      for await (const event of provider.stream({
        request_id: `connection-test-${role}-stream`,
        model,
        messages: [{ role: 'user', content: HARMLESS_USER_PROMPT }],
        max_tokens: 24,
        enable_thinking: false,
        force_nonempty_content: true,
        timeout_ms: timeoutMs,
        retry: false,
      })) {
        if (event.type === 'delta' && event.text.length > 0) sawDelta = true
      }
      discovered[model] = {
        ...(discovered[model] ?? {}),
        supports_streaming: sawDelta,
      }
      if (!sawDelta) {
        throw new AiProviderError('EMPTY_RESPONSE', 'The streaming test produced no text deltas.')
      }
    })
    out.push(stream)

    const tool = await runStep(toolId, model, async () => {
      const completion = await provider.complete({
        request_id: `connection-test-${role}-tool`,
        model,
        messages: [
          {
            role: 'user',
            content: 'Call echo_test with ping set to pong. Do not answer in prose.',
          },
        ],
        tools: [CONNECTION_TEST_ECHO_TOOL],
        tool_choice: 'required',
        max_tokens: 128,
        enable_thinking: false,
        force_nonempty_content: true,
        timeout_ms: timeoutMs,
        retry: false,
      })
      const supported = completion.tool_calls.some((call) => call.name === 'echo_test')
      discovered[model] = {
        ...(discovered[model] ?? {}),
        supports_tools: supported,
      }
      if (!supported) {
        throw new AiProviderError(
          'TOOL_CALL_UNSUPPORTED',
          'The model did not emit the echo_test tool call.',
        )
      }
    })
    out.push(tool)
    if (!tool.ok || !stream.ok) {
      out.push(skippedStep(toolStreamId, model, 'tool or streaming test failed'))
      return out
    }
    // A model might support tools and streaming separately, yet fail when
    // both are combined. This is the actual production agent request mode.
    const toolStream = await runStep(toolStreamId, model, async () => {
      let validCall = false
      for await (const event of provider.stream({
        request_id: `connection-test-${role}-tool-stream`,
        model,
        messages: [{ role: 'user', content: 'Call echo_test with ping set to pong. No prose.' }],
        tools: [CONNECTION_TEST_ECHO_TOOL],
        tool_choice: 'required',
        max_tokens: 256,
        enable_thinking: false,
        timeout_ms: timeoutMs,
        retry: false,
      })) {
        if (event.type === 'done') {
          validCall = event.completion.tool_calls.some((call) => call.name === 'echo_test')
        }
      }
      discovered[model] = { ...(discovered[model] ?? {}), supports_tools_with_streaming: validCall }
      if (!validCall) throw new AiProviderError('TOOL_CALL_UNSUPPORTED', 'Streaming tool calls were not supported.')
    })
    out.push(toolStream)
    return out
  }

  function pushSkipped(model: string, role: AiModelRole, reason: string): void {
    const ids = [`${role}_complete`, `${role}_stream`, `${role}_tool`, `${role}_tool_stream`]
    for (const id of ids) steps.push(skippedStep(id, model, reason))
    models[model] = {
      model,
      role,
      ok: false,
      tested_at: new Date().toISOString(),
      steps: steps.filter((step) => step.model === model),
    }
  }

  function pushSkippedRemaining(reason: string): void {
    const entries: Array<{ id: string; role: AiModelRole }> = []
    if (scope === 'fast' || scope === 'all') entries.push({ id: fastModel, role: 'fast' })
    if (scope === 'reasoning' || scope === 'all') entries.push({ id: reasoningModel, role: 'reasoning' })
    for (const entry of entries) pushSkipped(entry.id, entry.role, reason)
  }

  function finish(integrationOk: boolean): ConnectionTestResult {
    const selectedSteps = steps.filter((step) => step.id !== 'integration')
    return {
      ok: integrationOk && selectedSteps.every((step) => step.ok || step.status === 'skipped'),
      integration_ok: integrationOk,
      scope,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      total_latency_ms: Date.now() - started,
      steps,
      models,
      discovered_capabilities: discovered,
      usage,
    }
  }
}

async function runStep(
  id: string,
  model: string | null,
  work: () => Promise<void>,
): Promise<ConnectionTestStepResult> {
  const started = Date.now()
  try {
    await work()
    return stepResult(id, model, true, 'passed', started, null)
  } catch (error) {
    const providerError = isAiProviderError(error)
      ? error
      : new AiProviderError('PROVIDER_UNAVAILABLE', 'The connection test failed unexpectedly.', {
          cause: error,
        })
    const status = statusForError(providerError)
    return stepResult(id, model, false, status, started, providerError)
  }
}

function runStepSync(
  id: string,
  model: string | null,
  ok: boolean,
  detail: string,
): ConnectionTestStepResult {
  return {
    id,
    step: id,
    model,
    ok,
    status: ok ? 'passed' : 'failed',
    latency_ms: 0,
    http_status: null,
    error_code: ok ? null : 'INVALID_RESPONSE',
    detail,
    technical: null,
  }
}

function skippedStep(id: string, model: string, reason: string): ConnectionTestStepResult {
  return {
    id,
    step: id,
    model,
    ok: false,
    status: 'skipped',
    latency_ms: 0,
    http_status: null,
    error_code: null,
    detail: reason,
    technical: null,
  }
}

function stepResult(
  id: string,
  model: string | null,
  ok: boolean,
  status: ConnectionTestStepResult['status'],
  started: number,
  error: AiProviderError | null,
): ConnectionTestStepResult {
  return {
    id,
    step: id,
    model,
    ok,
    status,
    latency_ms: Date.now() - started,
    http_status: error?.httpStatus ?? null,
    error_code: error?.code ?? null,
    detail: error?.message ?? null,
    technical: error
      ? {
          code: error.code,
          http_status: error.httpStatus,
          retryable: error.retryable,
        }
      : null,
  }
}

function statusForError(error: AiProviderError): ConnectionTestStepResult['status'] {
  if (error.code === 'TIMEOUT') return 'timed_out'
  if (
    error.code === 'PROVIDER_UNAVAILABLE' ||
    error.code === 'MODEL_UNAVAILABLE' ||
    error.code === 'NETWORK_ERROR' ||
    error.code === 'TLS_ERROR' ||
    error.code === 'RATE_LIMITED'
  ) {
    return 'unavailable'
  }
  return 'failed'
}

export function capabilitiesAfterConnectionTest(
  result: ConnectionTestResult,
): Record<string, ModelCapabilities> {
  const out: Record<string, ModelCapabilities> = {}
  for (const modelId of Object.keys(result.discovered_capabilities)) {
    out[modelId] = mergeDiscoveredCapabilities(
      getModelProfile(modelId),
      result.discovered_capabilities[modelId] ?? {},
    )
  }
  return out
}
