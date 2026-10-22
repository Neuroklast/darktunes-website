export type ClientSseEvent =
  | {
      type: 'status'
      state:
        | 'connecting'
        | 'waiting'
        | 'thinking'
        | 'streaming'
        | 'tool_running'
        | 'fallback'
        | 'finishing'
      model?: string
    }
  | { type: 'delta'; text: string }
  | {
      type: 'tool_start'
      tool_call_id: string
      tool_name: string
      label: string
    }
  | {
      type: 'tool_result'
      tool_call_id: string
      tool_name: string
      label: string
      ok: boolean
      available: boolean
      duration_ms: number
    }
  | { type: 'usage'; input_tokens: number; output_tokens: number; reasoning_tokens: number; total_tokens: number }
  | { type: 'warning'; code: string; detail: string }
  | { type: 'confirmation_required'; action: string; confirmation_token: string; summary: string }
  | {
      type: 'error'
      code: string
      detail: string
      retryable?: boolean
      suggested_model_role?: 'fast' | 'reasoning' | null
    }
  | {
      type: 'done'
      model: string
      status: 'complete' | 'incomplete'
      mode: 'auto' | 'fast' | 'deep'
      fallback_used: boolean
    }

export function encodeSse(event: ClientSseEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`
}

export function sseHeaders(): HeadersInit {
  return {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  }
}
