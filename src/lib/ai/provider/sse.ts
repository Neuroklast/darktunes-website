/**
 * Parse OpenAI-compatible SSE chat.completion.chunk frames.
 *
 * The decoder is stateful: network chunks may split frames, UTF-8 sequences,
 * or CRLF pairs. `flush()` must be called at end-of-stream so the final frame
 * and decoder remainder are not lost.
 */

import { AiProviderError } from '@/lib/ai/provider/errors'
import type { AiToolCall, AiUsage } from '@/lib/ai/types/provider'

export interface SseChunk {
  contentDelta: string
  reasoningDelta: string
  toolCallDeltas: Array<{ index: number; id?: string; name?: string; arguments?: string }>
  finishReason: string | null
  usage: AiUsage | null
  done: boolean
}

interface ParsedFrame {
  data: string
  event: string
}

export class SseDecoder {
  private readonly decoder = new TextDecoder()
  private buffer = ''

  push(chunk: Uint8Array): SseChunk[] {
    this.buffer += this.decoder.decode(chunk, { stream: true })
    return this.drain(false)
  }

  /** Flush decoder remainder and the final buffered frame. */
  flush(): SseChunk[] {
    this.buffer += this.decoder.decode()
    return this.drain(true)
  }

  private drain(final: boolean): SseChunk[] {
    const normalized = this.buffer.replace(/\r\n/g, '\n')
    const parts = normalized.split('\n\n')
    this.buffer = parts.pop() ?? ''
    const out: SseChunk[] = []
    for (const part of parts) {
      const chunk = parseFrame(part)
      if (chunk) out.push(chunk)
    }
    if (final && this.buffer.trim().length > 0) {
      const chunk = parseFrame(this.buffer)
      this.buffer = ''
      if (chunk) out.push(chunk)
    }
    return out
  }
}

export function parseSseBlock(block: string): SseChunk | null {
  return parseFrame(block)
}

function parseFrame(block: string): SseChunk | null {
  const frame: ParsedFrame = { data: '', event: '' }
  for (const rawLine of block.split(/\r?\n/)) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
    if (line.startsWith(':')) continue
    if (line.startsWith('event:')) {
      frame.event = line.slice(6).trim()
      continue
    }
    if (!line.startsWith('data:')) continue
    const value = line.slice(5)
    frame.data += (frame.data ? '\n' : '') + (value.startsWith(' ') ? value.slice(1) : value)
  }
  if (!frame.data) return null
  if (frame.data.trim() === '[DONE]') {
    return {
      contentDelta: '',
      reasoningDelta: '',
      toolCallDeltas: [],
      finishReason: null,
      usage: null,
      done: true,
    }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(frame.data)
  } catch {
    throw new AiProviderError('INVALID_RESPONSE', 'NVIDIA streamed a non-JSON SSE frame.')
  }
  if (frame.event === 'error' || isErrorPayload(parsed)) {
    throw new AiProviderError('PROVIDER_UNAVAILABLE', summarizeStreamError(parsed))
  }
  return parseCompletionChunk(parsed)
}

function isErrorPayload(parsed: unknown): boolean {
  if (!parsed || typeof parsed !== 'object') return false
  const record = parsed as { error?: unknown; choices?: unknown }
  return record.error !== undefined && !Array.isArray(record.choices)
}

function summarizeStreamError(parsed: unknown): string {
  if (!parsed || typeof parsed !== 'object') return 'NVIDIA streamed an error event.'
  const record = parsed as { error?: unknown; message?: unknown }
  const nested =
    record.error && typeof record.error === 'object'
      ? (record.error as { message?: unknown }).message
      : record.error
  const message = typeof nested === 'string' ? nested : typeof record.message === 'string' ? record.message : null
  return message ? `NVIDIA streamed an error: ${message.slice(0, 200)}` : 'NVIDIA streamed an error event.'
}

export function parseCompletionChunk(parsed: unknown): SseChunk {
  if (!parsed || typeof parsed !== 'object') {
    throw new AiProviderError('INVALID_RESPONSE', 'NVIDIA streamed an invalid completion chunk.')
  }
  const record = parsed as {
    choices?: Array<{
      delta?: {
        content?: unknown
        reasoning_content?: unknown
        reasoning?: unknown
        tool_calls?: Array<{
          index?: number
          id?: unknown
          function?: { name?: unknown; arguments?: unknown }
        }>
      }
      finish_reason?: unknown
    }>
    usage?: unknown
  }
  const choice = record.choices?.[0]
  const delta = choice?.delta
  const toolCallDeltas: SseChunk['toolCallDeltas'] = []
  for (const call of delta?.tool_calls ?? []) {
    toolCallDeltas.push({
      index: typeof call.index === 'number' ? call.index : 0,
      id: typeof call.id === 'string' ? call.id : undefined,
      name: typeof call.function?.name === 'string' ? call.function.name : undefined,
      arguments: typeof call.function?.arguments === 'string' ? call.function.arguments : undefined,
    })
  }
  return {
    contentDelta: typeof delta?.content === 'string' ? delta.content : '',
    reasoningDelta:
      typeof delta?.reasoning_content === 'string'
        ? delta.reasoning_content
        : typeof delta?.reasoning === 'string'
          ? delta.reasoning
          : '',
    toolCallDeltas,
    finishReason: typeof choice?.finish_reason === 'string' ? choice.finish_reason : null,
    usage: parseUsage(record.usage),
    done: false,
  }
}

export function parseUsage(raw: unknown): AiUsage | null {
  if (!raw || typeof raw !== 'object') return null
  const usage = raw as {
    prompt_tokens?: unknown
    completion_tokens?: unknown
    total_tokens?: unknown
    completion_tokens_details?: { reasoning_tokens?: unknown }
    reasoning_tokens?: unknown
  }
  const input = asNonNegativeInt(usage.prompt_tokens)
  const output = asNonNegativeInt(usage.completion_tokens)
  const reasoning =
    asNonNegativeInt(usage.completion_tokens_details?.reasoning_tokens) ??
    asNonNegativeInt(usage.reasoning_tokens) ??
    0
  if (input === null && output === null) return null
  const inputTokens = input ?? 0
  const outputTokens = output ?? 0
  const total = asNonNegativeInt(usage.total_tokens) ?? inputTokens + outputTokens
  return {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    reasoning_tokens: reasoning,
    total_tokens: total,
  }
}

export function mergeToolCallDeltas(
  existing: AiToolCall[],
  deltas: SseChunk['toolCallDeltas'],
): AiToolCall[] {
  const next = [...existing]
  for (const delta of deltas) {
    const current = next[delta.index] ?? { id: '', name: '', arguments: '' }
    next[delta.index] = {
      id: delta.id ?? current.id,
      name: delta.name ?? current.name,
      arguments: `${current.arguments}${delta.arguments ?? ''}`,
    }
  }
  return next
}

function asNonNegativeInt(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null
  return Math.round(value)
}
