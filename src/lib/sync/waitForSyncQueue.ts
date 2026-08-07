/**
 * Client helper: poll sync queue stats and re-kick the executor until idle
 * or timeout. Used by admin hooks after enqueue so the UI reloads with
 * actual DB results instead of the pre-sync snapshot.
 */

export interface SyncQueueStats {
  pending: number
  running: number
  done: number
  failed: number
}

export interface WaitForSyncQueueOptions {
  accessToken: string
  /** Max time to wait for pending+running to reach 0. Default 5 minutes. */
  timeoutMs?: number
  /** Delay between poll/execute kicks. Default 3s. */
  pollIntervalMs?: number
  /**
   * Baseline active count when this wait started (pending+running at enqueue).
   * When set, onProgress receives a 0–100 percent based on backlog drain.
   */
  initialActive?: number
  /** Called after each stats poll with active job count and optional percent. */
  onProgress?: (active: number, stats: SyncQueueStats, percent?: number) => void
  fetchImpl?: typeof fetch
}

export interface WaitForSyncQueueResult {
  drained: boolean
  stats: SyncQueueStats
  waitedMs: number
}

const DEFAULT_TIMEOUT_MS = 300_000
const DEFAULT_POLL_MS = 3_000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

/** Progress percent from remaining backlog vs initial active count (capped at 99 until drained). */
export function syncBacklogProgressPercent(
  active: number,
  initialActive: number,
): number {
  if (active <= 0) return 100
  if (initialActive <= 0) return 0
  const done = Math.max(0, initialActive - active)
  return Math.min(99, Math.round((done / initialActive) * 100))
}

async function fetchQueueStats(
  accessToken: string,
  fetchImpl: typeof fetch,
): Promise<SyncQueueStats> {
  const res = await fetchImpl('/api/sync/queue', {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Queue stats failed: ${text.slice(0, 200) || res.status}`)
  }
  const data = (await res.json()) as Partial<SyncQueueStats>
  return {
    pending: data.pending ?? 0,
    running: data.running ?? 0,
    done: data.done ?? 0,
    failed: data.failed ?? 0,
  }
}

async function kickExecutor(
  accessToken: string,
  fetchImpl: typeof fetch,
): Promise<void> {
  const res = await fetchImpl('/api/sync', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  // Executor returns 200 { accepted: true }; non-OK is non-fatal during poll.
  if (!res.ok) {
    // Drain the body so the connection can close cleanly.
    await res.text().catch(() => undefined)
  }
}

/**
 * Polls until the sync queue has no pending/running jobs.
 * Re-kicks the executor only when nothing is running so overlapping waitUntil
 * workers do not pile up (single-flight lease is the server-side guard).
 *
 * The server also self-chains across Vercel duration slices when due jobs
 * remain — client kicks are a safety net if self-chain/auth is unavailable.
 * GET /api/sync/queue recovers stuck `running` rows so a dead worker cannot
 * block re-kicks forever.
 *
 * Returns when drained or when timeoutMs elapses.
 */
export async function waitForSyncQueueIdle(
  options: WaitForSyncQueueOptions,
): Promise<WaitForSyncQueueResult> {
  const {
    accessToken,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    pollIntervalMs = DEFAULT_POLL_MS,
    initialActive: initialActiveOption,
    onProgress,
    fetchImpl = globalThis.fetch,
  } = options

  const started = Date.now()
  let stats = await fetchQueueStats(accessToken, fetchImpl)
  let active = stats.pending + stats.running
  const initialActive = initialActiveOption ?? active
  onProgress?.(active, stats, syncBacklogProgressPercent(active, initialActive))

  if (active === 0) {
    return { drained: true, stats, waitedMs: 0 }
  }

  while (Date.now() - started < timeoutMs) {
    // Only kick when idle of running jobs — avoids parallel executors under load.
    // If running > 0, a worker is already draining; if pending > 0 and running === 0,
    // the previous worker finished its budget and we need another kick.
    if (stats.running === 0 && stats.pending > 0) {
      await kickExecutor(accessToken, fetchImpl)
    }
    await sleep(pollIntervalMs)
    stats = await fetchQueueStats(accessToken, fetchImpl)
    active = stats.pending + stats.running
    onProgress?.(active, stats, syncBacklogProgressPercent(active, initialActive))
    if (active === 0) {
      return { drained: true, stats, waitedMs: Date.now() - started }
    }
  }

  return { drained: false, stats, waitedMs: Date.now() - started }
}
