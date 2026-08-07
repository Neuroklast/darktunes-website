import { describe, expect, it, vi } from 'vitest'
import {
  EXECUTOR_MIN_JOB_HEADROOM_MS,
  EXECUTOR_TIME_BUDGET_MS,
  canClaimAnotherJob,
  remainingExecutorBudgetMs,
  resolveExecutorSiteOrigin,
  selfChainSyncExecutor,
  shouldSelfChainContinuation,
} from './queueExecutor'

describe('remainingExecutorBudgetMs / canClaimAnotherJob', () => {
  it('allows claims early in the budget', () => {
    const start = 1_000_000
    expect(remainingExecutorBudgetMs(start, start + 1_000)).toBe(EXECUTOR_TIME_BUDGET_MS - 1_000)
    expect(canClaimAnotherJob(start, start + 1_000)).toBe(true)
  })

  it('stops claiming when headroom is exhausted', () => {
    const start = 1_000_000
    const nearEnd = start + EXECUTOR_TIME_BUDGET_MS - EXECUTOR_MIN_JOB_HEADROOM_MS + 1
    expect(canClaimAnotherJob(start, nearEnd)).toBe(false)
    expect(canClaimAnotherJob(start, start + EXECUTOR_TIME_BUDGET_MS - EXECUTOR_MIN_JOB_HEADROOM_MS)).toBe(
      true,
    )
  })
})

describe('shouldSelfChainContinuation', () => {
  it('chains only when work was done and due jobs remain', () => {
    expect(shouldSelfChainContinuation({ jobsProcessed: 3, duePending: 2 })).toBe(true)
    expect(shouldSelfChainContinuation({ jobsProcessed: 0, duePending: 5 })).toBe(false)
    expect(shouldSelfChainContinuation({ jobsProcessed: 4, duePending: 0 })).toBe(false)
  })
})

describe('resolveExecutorSiteOrigin', () => {
  it('prefers NEXT_PUBLIC_SITE_URL', () => {
    const prev = process.env.NEXT_PUBLIC_SITE_URL
    process.env.NEXT_PUBLIC_SITE_URL = 'https://label.example/'
    expect(resolveExecutorSiteOrigin()).toBe('https://label.example')
    process.env.NEXT_PUBLIC_SITE_URL = prev
  })

  it('falls back to request URL', () => {
    const prev = process.env.NEXT_PUBLIC_SITE_URL
    const prevVercel = process.env.VERCEL_URL
    delete process.env.NEXT_PUBLIC_SITE_URL
    delete process.env.VERCEL_URL
    expect(resolveExecutorSiteOrigin('https://app.example/api/sync')).toBe('https://app.example')
    process.env.NEXT_PUBLIC_SITE_URL = prev
    process.env.VERCEL_URL = prevVercel
  })
})

describe('selfChainSyncExecutor', () => {
  it('POSTs /api/sync with auth and self-chain header', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, text: async () => '{}' })
    await selfChainSyncExecutor({
      origin: 'https://label.example',
      authorizationHeader: 'Bearer secret',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://label.example/api/sync',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer secret',
          'x-sync-self-chain': '1',
        }),
      }),
    )
  })
})
