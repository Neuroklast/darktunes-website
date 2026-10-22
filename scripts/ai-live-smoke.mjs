/**
 * NVIDIA live smoke tests. Requires NVIDIA_API_KEY and AI_LIVE_TESTS=1.
 * Never run from CI on ordinary PRs. No message content or key is printed.
 */
const enabled = process.env.AI_LIVE_TESTS === '1'
const key = process.env.NVIDIA_API_KEY?.trim()
if (!enabled || !key) {
  console.log('[test:ai:live] skipped — set NVIDIA_API_KEY and AI_LIVE_TESTS=1 to run.')
  process.exit(0)
}

const base = (process.env.NVIDIA_API_BASE_URL || 'https://integrate.api.nvidia.com/v1').replace(/\/$/, '')
const fastModel = process.env.AI_LIVE_FAST_MODEL || 'nvidia/nemotron-3.5-lightning-30b-a3b'
const reasoningModel = process.env.AI_LIVE_REASONING_MODEL || 'nvidia/nemotron-3-super-120b-a12b'
const results = []

async function request(label, body, { stream = false } = {}) {
  const started = Date.now()
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Accept: stream ? 'text/event-stream' : 'application/json',
      },
      body: JSON.stringify(body),
    })
    const text = await res.text()
    const latency = Date.now() - started
    let content = ''
    let reasoning = ''
    let toolCalls = 0
    let finish = null
    if (stream && text.includes('data:')) {
      for (const line of text.split(/\r?\n/)) {
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (!data || data === '[DONE]') continue
        try {
          const parsed = JSON.parse(data)
          const delta = parsed.choices?.[0]?.delta
          if (typeof delta?.content === 'string') content += delta.content
          if (typeof delta?.reasoning === 'string') reasoning += delta.reasoning
          if (typeof delta?.reasoning_content === 'string') reasoning += delta.reasoning_content
          if (Array.isArray(delta?.tool_calls)) toolCalls += delta.tool_calls.length
          if (parsed.choices?.[0]?.finish_reason) finish = parsed.choices[0].finish_reason
        } catch {
          // A malformed frame is reported below through empty content.
        }
      }
    } else {
      try {
        const parsed = JSON.parse(text)
        const message = parsed.choices?.[0]?.message ?? {}
        content = typeof message.content === 'string' ? message.content : ''
        reasoning =
          typeof message.reasoning_content === 'string'
            ? message.reasoning_content
            : typeof message.reasoning === 'string'
              ? message.reasoning
              : ''
        toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls.length : 0
        finish = parsed.choices?.[0]?.finish_reason ?? null
      } catch {
        // non-JSON
      }
    }
    results.push({
      label,
      status: res.status,
      ok: res.ok,
      latency_ms: latency,
      content_chars: content.trim().length,
      reasoning_chars: reasoning.length,
      tool_calls: toolCalls,
      finish_reason: finish,
      detail: res.ok ? null : text.slice(0, 220),
    })
  } catch (error) {
    results.push({
      label,
      status: null,
      ok: false,
      latency_ms: Date.now() - started,
      detail: error instanceof Error ? error.message : String(error),
    })
  }
}

const authStarted = Date.now()
try {
  const res = await fetch(`${base}/models`, {
    headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
  })
  results.push({
    label: 'auth_models',
    status: res.status,
    ok: res.ok,
    latency_ms: Date.now() - authStarted,
    detail: res.ok ? null : (await res.text()).slice(0, 220),
  })
} catch (error) {
  results.push({
    label: 'auth_models',
    status: null,
    ok: false,
    latency_ms: Date.now() - authStarted,
    detail: error instanceof Error ? error.message : String(error),
  })
}

await request('fast_complete', {
  model: fastModel,
  messages: [{ role: 'user', content: 'Reply with the single word pong.' }],
  max_tokens: 32,
  temperature: 1,
  top_p: 0.95,
  chat_template_kwargs: { enable_thinking: false, force_nonempty_content: true },
})

await request(
  'fast_stream',
  {
    model: fastModel,
    messages: [{ role: 'user', content: 'Reply with the single word pong.' }],
    max_tokens: 24,
    temperature: 1,
    top_p: 0.95,
    stream: true,
    stream_options: { include_usage: true },
    chat_template_kwargs: { enable_thinking: false, force_nonempty_content: true },
  },
  { stream: true },
)

await request('fast_tool', {
  model: fastModel,
  messages: [
    { role: 'user', content: 'Call echo_test with ping set to pong. Do not answer in prose.' },
  ],
  tools: [
    {
      type: 'function',
      function: {
        name: 'echo_test',
        description: 'Return the provided ping string unchanged.',
        parameters: {
          type: 'object',
          properties: { ping: { type: 'string' } },
          required: ['ping'],
        },
      },
    },
  ],
  tool_choice: 'required',
  max_tokens: 128,
  temperature: 1,
  top_p: 0.95,
  chat_template_kwargs: { enable_thinking: false, force_nonempty_content: true },
})

await request('reasoning_complete', {
  model: reasoningModel,
  messages: [{ role: 'user', content: 'Reply with the single word pong.' }],
  max_tokens: 1024,
  temperature: 1,
  top_p: 0.95,
  chat_template_kwargs: { enable_thinking: true, low_effort: true },
})

await request(
  'reasoning_stream',
  {
    model: reasoningModel,
    messages: [{ role: 'user', content: 'Reply with the single word pong.' }],
    max_tokens: 1024,
    temperature: 1,
    top_p: 0.95,
    stream: true,
    stream_options: { include_usage: true },
    chat_template_kwargs: { enable_thinking: true, low_effort: true },
  },
  { stream: true },
)

const failed = results.filter((row) => !row.ok || (row.label !== 'auth_models' && !row.content_chars && !row.tool_calls))
console.log(JSON.stringify({ models: { fast: fastModel, reasoning: reasoningModel }, results }, null, 2))
if (failed.length > 0) {
  console.error(`[test:ai:live] ${failed.length} check(s) failed: ${failed.map((row) => row.label).join(', ')}`)
  process.exit(1)
}
console.log('[test:ai:live] auth, fast, streaming, tools and low-effort reasoning responded')
