import { beforeEach, describe, expect, it, vi } from 'vitest'
import { jsonRequest, expectUnauthorized, expectStatus } from '../../helpers/api/routeTestkit'

const requireAdminWithServiceClient = vi.fn()
const createRouter = vi.fn()
const runNvidiaConnectionTest = vi.fn()
const checkDistributedRateLimit = vi.fn()
const getAiSettings = vi.fn()
const updateAiSettings = vi.fn()

vi.mock('@/lib/adminAuth', () => ({
  requireAdminWithServiceClient: (...args: unknown[]) => requireAdminWithServiceClient(...args),
}))

vi.mock('@/lib/ai/provider/router', () => ({
  AiProviderRouter: { create: (...args: unknown[]) => createRouter(...args) },
}))

vi.mock('@/lib/ai/provider/connectionTest', () => ({
  runNvidiaConnectionTest: (...args: unknown[]) => runNvidiaConnectionTest(...args),
}))

vi.mock('@/lib/rateLimitDistributed', () => ({
  checkDistributedRateLimit: (...args: unknown[]) => checkDistributedRateLimit(...args),
}))

vi.mock('@/lib/api/aiSettings', () => ({
  getAiSettings: (...args: unknown[]) => getAiSettings(...args),
  updateAiSettings: (...args: unknown[]) => updateAiSettings(...args),
}))

async function importRoute() {
  return import('../../../app/api/admin/ai/connection-tests/route')
}

function result(ok: boolean, status: 'passed' | 'failed' | 'timed_out' = ok ? 'passed' : 'failed') {
  return {
    ok,
    integration_ok: ok,
    scope: 'all',
    started_at: '2026-10-20T00:00:00.000Z',
    finished_at: '2026-10-20T00:00:01.000Z',
    total_latency_ms: 1000,
    steps: [
      {
        id: 'auth',
        step: 'auth',
        model: null,
        ok,
        status,
        latency_ms: 1,
        http_status: null,
        error_code: ok ? null : 'INVALID_KEY',
        detail: ok ? 'key accepted' : 'bad key',
        technical: null,
      },
    ],
    models: {
      'nvidia/nemotron-3.5-lightning-30b-a3b': {
        model: 'nvidia/nemotron-3.5-lightning-30b-a3b',
        role: 'fast',
        ok,
        tested_at: '2026-10-20T00:00:01.000Z',
        steps: [],
      },
    },
    discovered_capabilities: {
      'nvidia/nemotron-3.5-lightning-30b-a3b': { supports_streaming: true, supports_tools: true },
    },
    usage: { fast: null, reasoning: null },
  }
}

describe('POST /api/admin/ai/connection-tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAdminWithServiceClient.mockResolvedValue({
      userId: 'admin-1',
      role: 'admin',
      serviceClient: {},
    })
    checkDistributedRateLimit.mockResolvedValue({ limited: false, backend: 'memory' })
    getAiSettings.mockResolvedValue({
      modelFast: 'nvidia/nemotron-3.5-lightning-30b-a3b',
      modelReasoning: 'nvidia/nemotron-3-super-120b-a12b',
      providerCapabilities: {},
      lastSuccessfulConnectionTest: null,
      lastFailedConnectionTest: null,
    })
    updateAiSettings.mockResolvedValue({})
    createRouter.mockResolvedValue({ hasConfiguredProvider: true, hasKeyForModel: () => true })
  })

  it('rejects unauthenticated callers', async () => {
    const { ApiError } = await import('@/lib/errors')
    requireAdminWithServiceClient.mockRejectedValue(new ApiError(401, 'Unauthorized'))
    const { POST } = await importRoute()
    const res = await POST(jsonRequest('/api/admin/ai/connection-tests', { method: 'POST', body: {} }))
    await expectUnauthorized(res)
    expect(runNvidiaConnectionTest).not.toHaveBeenCalled()
  })

  it('returns AI_NOT_CONFIGURED when no key is stored or in env', async () => {
    createRouter.mockResolvedValue({ hasConfiguredProvider: false, hasKeyForModel: () => false })
    const { POST } = await importRoute()
    const res = await POST(
      jsonRequest('/api/admin/ai/connection-tests', { method: 'POST', body: {}, bearer: 'token' }),
    )
    const body = await expectStatus<{ code: string }>(res, 503)
    expect(body.code).toBe('AI_NOT_CONFIGURED')
    expect(runNvidiaConnectionTest).not.toHaveBeenCalled()
  })

  it('returns the full probe result even when a step failed', async () => {
    createRouter.mockResolvedValue({ hasConfiguredProvider: true, hasKeyForModel: () => true })
    runNvidiaConnectionTest.mockResolvedValue(result(false, 'timed_out'))
    const { POST } = await importRoute()
    const res = await POST(
      jsonRequest('/api/admin/ai/connection-tests', { method: 'POST', body: {}, bearer: 'token' }),
    )
    const body = await expectStatus<{ ok: boolean; integration_ok: boolean; steps: unknown[] }>(res, 200)
    expect(body.ok).toBe(false)
    expect(body.integration_ok).toBe(false)
    expect(body.steps).toHaveLength(1)
    expect(runNvidiaConnectionTest).toHaveBeenCalledWith({
      apiKey: 'stored-per-provider',
      provider: expect.anything(),
      fastModel: 'nvidia/nemotron-3.5-lightning-30b-a3b',
      reasoningModel: 'nvidia/nemotron-3-super-120b-a12b',
      scope: 'all',
    })
    expect(updateAiSettings).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        last_failed_connection_test: expect.objectContaining({ ok: false }),
        provider_capabilities: expect.objectContaining({ version: 2 }),
      }),
    )
  })

  it('passes the requested scope through', async () => {
    resolveNvidiaApiKey.mockResolvedValue('nvapi-test')
    runNvidiaConnectionTest.mockResolvedValue(result(true))
    const { POST } = await importRoute()
    await POST(
      jsonRequest('/api/admin/ai/connection-tests', {
        method: 'POST',
        body: { scope: 'fast' },
        bearer: 'token',
      }),
    )
    expect(runNvidiaConnectionTest).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'fast' }),
    )
  })

  it('stores the successful test separately', async () => {
    resolveNvidiaApiKey.mockResolvedValue('nvapi-test')
    runNvidiaConnectionTest.mockResolvedValue(result(true))
    const { POST } = await importRoute()
    await POST(
      jsonRequest('/api/admin/ai/connection-tests', { method: 'POST', body: {}, bearer: 'token' }),
    )
    expect(updateAiSettings).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        last_successful_connection_test: expect.objectContaining({ ok: true }),
        provider_capabilities: expect.objectContaining({
          health: expect.objectContaining({
            'nvidia/nemotron-3.5-lightning-30b-a3b': expect.objectContaining({ ok: true }),
          }),
        }),
      }),
    )
  })

  it('rate-limits repeated probes', async () => {
    checkDistributedRateLimit.mockResolvedValue({ limited: true, backend: 'memory' })
    const { POST } = await importRoute()
    const res = await POST(
      jsonRequest('/api/admin/ai/connection-tests', { method: 'POST', body: {}, bearer: 'token' }),
    )
    const body = await expectStatus<{ code: string }>(res, 429)
    expect(body.code).toBe('RATE_LIMITED')
  })
})
