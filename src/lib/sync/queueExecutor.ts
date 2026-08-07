/**
 * Queue executor budget + self-chain helpers.
 *
 * Vercel caps a single waitUntil drain at ~maxDuration. We process as many
 * artist jobs as fit in the budget (with inter-job pacing for rate limits),
 * then immediately self-chain another `/api/sync` so the backlog keeps draining
 * without waiting for the next external cron tick or manual Force Sync.
 */

/** Soft wall for one waitUntil drain — leave headroom under maxDuration 300s. */
export const EXECUTOR_TIME_BUDGET_MS = 280_000

/**
 * Do not claim a new job unless this much wall time remains.
 * Prevents starting an artist mid-budget that Vercel will hard-kill, leaving
 * the job stuck in `running` until lock recovery.
 */
export const EXECUTOR_MIN_JOB_HEADROOM_MS = 50_000

/** Pace between artists so external APIs are not hammered in a tight loop. */
export const EXECUTOR_INTER_JOB_DELAY_MS = 400

/** Lease slightly longer than budget so the owner can finish + release cleanly. */
export const EXECUTOR_LEASE_MS = EXECUTOR_TIME_BUDGET_MS + 25_000

export function remainingExecutorBudgetMs(
  startedAtMs: number,
  nowMs = Date.now(),
  budgetMs = EXECUTOR_TIME_BUDGET_MS,
): number {
  return budgetMs - (nowMs - startedAtMs)
}

/** True when another job can be claimed without risking a mid-job kill. */
export function canClaimAnotherJob(
  startedAtMs: number,
  nowMs = Date.now(),
  budgetMs = EXECUTOR_TIME_BUDGET_MS,
  headroomMs = EXECUTOR_MIN_JOB_HEADROOM_MS,
): boolean {
  return remainingExecutorBudgetMs(startedAtMs, nowMs, budgetMs) >= headroomMs
}

/**
 * After the lease is released, continue draining when work remains.
 * Requires at least one completed unit of work so a claim failure cannot spin.
 */
export function shouldSelfChainContinuation(input: {
  jobsProcessed: number
  duePending: number
}): boolean {
  return input.jobsProcessed > 0 && input.duePending > 0
}

/** Absolute origin for self-chain HTTP kick (no trailing slash). */
export function resolveExecutorSiteOrigin(requestUrl?: string | null): string | null {
  const fromEnv =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') ||
    process.env.SITE_URL?.trim() ||
    ''
  if (fromEnv) {
    try {
      return new URL(fromEnv).origin
    } catch {
      return fromEnv.replace(/\/$/, '')
    }
  }
  if (requestUrl) {
    try {
      return new URL(requestUrl).origin
    } catch {
      return null
    }
  }
  return null
}

/**
 * Fire-and-forget kick of `/api/sync` after this isolate released the lease.
 * Uses the same Authorization header as the parent request (cron or admin JWT).
 */
export async function selfChainSyncExecutor(options: {
  origin: string
  authorizationHeader: string
  fetchImpl?: typeof fetch
}): Promise<void> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  const url = `${options.origin.replace(/\/$/, '')}/api/sync`
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: {
      Authorization: options.authorizationHeader,
      'x-sync-self-chain': '1',
    },
  })
  // Drain body so the connection can close; non-OK is non-fatal (next cron will retry).
  await res.text().catch(() => undefined)
}

export function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}
