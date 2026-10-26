import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AiProviderRouter } from './router'
import { AI_CHAT_MODELS, getCatalogModel, isCatalogModelForRole } from '@/lib/ai/models/catalog'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

vi.mock('@/lib/secrets/getExternalCredentials', () => ({
  getApiCredential: vi.fn(async (_db: unknown, key: string) => {
    if (key === 'groq_api_key') return 'test-groq-key'
    if (key === 'cloudflare_ai_api_key') return 'test-cloudflare-key'
    if (key === 'cloudflare_ai_account_id') return 'invalid-account/../../url'
    return null
  }),
}))
vi.mock('@/lib/ai/provider/resolveKey', () => ({
  resolveNvidiaApiKey: vi.fn(async () => null),
}))
const emptyDb = {} as SupabaseClient<Database>
const EMPTY_CAPABILITIES = { models: {}, health: {} }

describe('curated AI provider router', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: 'pong' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 4, completion_tokens: 1, total_tokens: 5 },
    }), { status: 200, headers: { 'content-type': 'application/json' } })))
  })
  afterEach(() => vi.unstubAllGlobals())

  it('rejects unrelated image, audio and embedding models', () => {
    expect(getCatalogModel('gemini::gemini-3.1-flash-image')).toBeNull()
    expect(getCatalogModel('cloudflare::@cf/baai/bge-large-en-v1.5')).toBeNull()
    expect(getCatalogModel('groq::whisper-large-v3')).toBeNull()
    expect(AI_CHAT_MODELS.every(m => m.roles.length > 0 && m.toolsAdvertised)).toBe(true)
  })

  it('requires model suitability for each UI profile', () => {
    expect(isCatalogModelForRole('groq::openai/gpt-oss-20b', 'fast')).toBe(true)
    expect(isCatalogModelForRole('groq::openai/gpt-oss-20b', 'reasoning')).toBe(false)
    expect(isCatalogModelForRole('groq::openai/gpt-oss-120b', 'reasoning')).toBe(true)
  })

  it('keeps identical upstream model names separated by provider', () => {
    expect(getCatalogModel('groq::openai/gpt-oss-20b')?.provider).toBe('groq')
    expect(getCatalogModel('openrouter::openai/gpt-oss-20b:free')?.provider).toBe('openrouter')
  })

  it('routes by allowlisted endpoint and strips NVIDIA-only parameters', async () => {
    const router = await AiProviderRouter.create(emptyDb, EMPTY_CAPABILITIES)
    expect(router.hasKeyForModel('groq::openai/gpt-oss-20b')).toBe(true)
    expect(router.hasKeyForModel('gemini::gemini-3.8-flash')).toBe(false)
    const answer = await router.complete({
      request_id: 'test-groq',
      model: 'groq::openai/gpt-oss-20b',
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 100,
      enable_thinking: false,
      tools: [{ name: 'echo_test', description: 'Echo', parameters: { type: 'object' } }],
    })
    expect(answer.model).toBe('groq::openai/gpt-oss-20b')
    expect(answer.content).toBe('pong')
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions')
    const body = JSON.parse(String(init?.body))
    expect(body.model).toBe('openai/gpt-oss-20b')
    expect(body.tools).toHaveLength(1)
    expect(body).not.toHaveProperty('chat_template_kwargs')
    expect(body).not.toHaveProperty('reasoning_budget')
  })

  it('rejects arbitrary unapproved models without calling the network', async () => {
    const router = await AiProviderRouter.create(emptyDb, EMPTY_CAPABILITIES)
    await expect(router.complete({
      request_id: 'bad', model: 'groq::image-generator',
      messages: [{ role: 'user', content: 'test' }], max_tokens: 10,
    })).rejects.toMatchObject({ code: 'MODEL_UNAVAILABLE' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('refuses untrusted Cloudflare account IDs as URL path components', async () => {
    const router = await AiProviderRouter.create(emptyDb, EMPTY_CAPABILITIES)
    expect(router.availability.find(p => p.provider === 'cloudflare')).toMatchObject({
      configured: true, accountReady: false,
    })
    expect(router.hasKeyForModel('cloudflare::@cf/openai/gpt-oss-20b')).toBe(false)
  })
})
