/**
 * src/lib/logServerActionError.ts
 *
 * Persists server action failures via the central observability pipeline
 * (structured console line + aggregated `app_logs` row). Server-only.
 */

import { captureError } from '@/lib/observability/captureError'

export async function logServerActionError(
  action: string,
  err: unknown,
  userId?: string | null,
): Promise<void> {
  await captureError('server_action.error', err, {
    source: 'server_action',
    context: { action },
    userId: userId ?? null,
  })
}
