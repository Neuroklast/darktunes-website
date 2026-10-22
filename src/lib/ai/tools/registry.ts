import { z } from 'zod'
import { ApiError } from '@/lib/errors'
import type { AiActor } from '@/lib/ai/auth/requireAiActor'
import type { AiToolDefinition } from '@/lib/ai/types/provider'
import type { RegisteredTool, ToolContext } from '@/lib/ai/tools/types'
import { resolveEffectiveAccess } from '@/lib/rbac/resolveAccess'
import type { Capability } from '@/lib/rbac/types'

const echoInput = z.object({ ping: z.string() })
const echoOutput = z.object({ pong: z.string() })

const echoTool: RegisteredTool<typeof echoInput, typeof echoOutput> = {
  name: 'echo_test',
  description: 'Return the provided ping string. Harmless diagnostic tool.',
  input: echoInput,
  output: echoOutput,
  capabilities: [],
  dataScope: 'none',
  classification: 'read',
  maxResultBytes: 1024,
  timeoutMs: 2_000,
  execute: async (input) => ({ pong: input.ping }),
}

const tools = new Map<string, RegisteredTool<z.ZodType, z.ZodType>>([
  [echoTool.name, echoTool as RegisteredTool<z.ZodType, z.ZodType>],
])

export function registerTool<TIn extends z.ZodType, TOut extends z.ZodType>(
  tool: RegisteredTool<TIn, TOut>,
): void {
  tools.set(tool.name, tool as RegisteredTool<z.ZodType, z.ZodType>)
}

export function listToolDefinitionsForActor(actor: AiActor): AiToolDefinition[] {
  return [...tools.values()]
    .filter((tool) => tool.name !== 'echo_test')
    .filter((tool) => isToolAllowed(tool, actor))
    .map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: z.toJSONSchema(tool.input),
    }))
}

export function getRegisteredTool(name: string): RegisteredTool<z.ZodType, z.ZodType> | undefined {
  return tools.get(name)
}

export async function executeRegisteredTool(
  name: string,
  rawArgs: unknown,
  context: ToolContext,
): Promise<
  | { ok: true; result: unknown }
  | { ok: false; error: string; error_code?: 'AI_TOOL_FORBIDDEN' | 'AI_TOOL_FAILED' | 'AI_TOOL_TIMEOUT' }
> {
  const tool = tools.get(name)
  if (!tool) return { ok: false, error: `Unknown tool: ${name}` }
  if (!isToolAllowed(tool, context.actor)) {
    await recordToolExecution(context, tool.name, 'denied', 0, 'AI_TOOL_FORBIDDEN')
    return {
      ok: false,
      error: 'That assistant action is not allowed for this account.',
      error_code: 'AI_TOOL_FORBIDDEN',
    }
  }
  if (tool.capabilities.length > 0) {
    const access = await resolveEffectiveAccess(context.actor.serviceDb, context.actor.userId).catch(
      () => null,
    )
    if (!access || !tool.capabilities.every((cap) => access.capabilities.has(cap))) {
      await recordToolExecution(context, tool.name, 'denied', 0, 'AI_TOOL_FORBIDDEN')
      return {
        ok: false,
        error: 'That assistant action is not allowed for this account.',
        error_code: 'AI_TOOL_FORBIDDEN',
      }
    }
  }

  const started = Date.now()
  const parsed = tool.input.safeParse(rawArgs)
  if (!parsed.success) {
    await recordToolExecution(context, tool.name, 'error', Date.now() - started, 'INVALID_ARGUMENTS')
    return {
      ok: false,
      error: 'The tool arguments were invalid. Correct the arguments and call the tool again.',
      error_code: 'AI_TOOL_FAILED',
    }
  }

  try {
    const result = await withTimeout(tool.execute(parsed.data, context), tool.timeoutMs, context.signal)
    const encoded = JSON.stringify(result)
    if (encoded.length > tool.maxResultBytes) {
      await recordToolExecution(context, tool.name, 'error', Date.now() - started, 'RESULT_TOO_LARGE')
      return {
        ok: false,
        error: 'The tool result was larger than the assistant can use. Narrow the request.',
        error_code: 'AI_TOOL_FAILED',
      }
    }
    const out = tool.output.safeParse(result)
    if (!out.success) {
      await recordToolExecution(context, tool.name, 'error', Date.now() - started, 'INVALID_RESULT')
      return {
        ok: false,
        error: 'The tool returned an unexpected result. Try a different question.',
        error_code: 'AI_TOOL_FAILED',
      }
    }
    await recordToolExecution(context, tool.name, 'ok', Date.now() - started, null)
    return { ok: true, result: out.data }
  } catch (error) {
    const timedOut = error instanceof Error && error.message === 'Tool timed out'
    const code = timedOut ? 'AI_TOOL_TIMEOUT' : 'AI_TOOL_FAILED'
    const safeMessage = safeToolError(error, timedOut)
    await recordToolExecution(
      context,
      tool.name,
      timedOut ? 'timeout' : 'error',
      Date.now() - started,
      code,
    )
    return { ok: false, error: safeMessage, error_code: code }
  }
}

export function isToolAllowed(
  tool: RegisteredTool<z.ZodType, z.ZodType>,
  actor: AiActor,
): boolean {
  if (tool.dataScope === 'label') {
    if (actor.accessContext === 'artist') return false
    return tool.capabilities.every((capability) => actor.capabilities.has(capability))
  }
  if (tool.dataScope === 'self_artist') {
    if (!actor.artistId) return false
    if (actor.accessContext === 'artist') return true
    if (actor.capabilities.has('cms.artists.manage' as Capability)) return true
    return actor.artistMembershipIds.includes(actor.artistId)
  }
  return true
}

async function recordToolExecution(
  context: ToolContext,
  toolName: string,
  status: 'ok' | 'error' | 'denied' | 'timeout',
  durationMs: number,
  errorCode: string | null,
): Promise<void> {
  const targetScope = getRegisteredTool(toolName)?.dataScope ?? null
  try {
    const { error } = await context.actor.serviceDb.from('ai_tool_executions').insert({
      request_id: context.requestId,
      tool_name: toolName,
      actor_id: context.actor.userId,
      target_scope: targetScope,
      status,
      duration_ms: durationMs,
      error_code: errorCode,
    })
    if (error) console.warn('[ai] tool execution log failed:', error.message)
  } catch {
    // Logging must never change the tool outcome.
  }
}

function safeToolError(error: unknown, timedOut: boolean): string {
  if (timedOut) return 'The data lookup took too long. Try again or ask for a narrower range.'
  if (error instanceof ApiError) {
    if (error.code === 'FORBIDDEN_NO_ARTIST') {
      return 'No artist is selected for this request. Select an artist and try again.'
    }
    return error.message
  }
  return 'The data lookup failed. Try again; if it repeats, tell the label team.'
}

function withTimeout<T>(promise: Promise<T>, ms: number, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Tool timed out')), ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new Error('Tool timed out'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (value) => {
        clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
        reject(error)
      },
    )
  })
}
