import { createHmac, randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/types/database'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'

type DbClient = SupabaseClient<Database>

export type WebhookEventType =
  | 'artist.created'
  | 'release.submitted'
  | 'release.approved'
  | 'release.rejected'
  | '*'

export interface WebhookPayload {
  event: WebhookEventType
  organizationId: string
  timestamp: string
  data: Record<string, unknown>
}

function signPayload(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body, 'utf8').digest('hex')
}

export async function dispatchOrganizationWebhooks(
  db: DbClient,
  organizationId: string,
  event: WebhookEventType,
  data: Record<string, unknown>,
): Promise<void> {
  const { data: endpoints, error } = await db
    .from('organization_webhook_endpoints')
    .select('id, url, secret, events, enabled')
    .eq('organization_id', organizationId)
    .eq('enabled', true)

  if (error || !endpoints?.length) return

  const payload: WebhookPayload = {
    event,
    organizationId,
    timestamp: new Date().toISOString(),
    data,
  }
  const body = JSON.stringify(payload)

  await Promise.all(
    endpoints
      .filter((ep) => ep.events.includes(event) || ep.events.includes('*'))
      .map(async (ep) => {
        const deliveryId = randomUUID()
        let responseStatus: number | null = null
        let errorMessage: string | null = null
        let status = 'delivered'

        try {
          const res = await fetch(ep.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-DarkTunes-Event': event,
              'X-DarkTunes-Signature': signPayload(ep.secret, body),
            },
            body,
            signal: AbortSignal.timeout(10_000),
          })
          responseStatus = res.status
          if (!res.ok) {
            status = 'failed'
            errorMessage = `HTTP ${res.status}`
          }
        } catch (err) {
          status = 'failed'
          errorMessage = err instanceof Error ? err.message : 'Delivery failed'
        }

        await db.from('organization_webhook_deliveries').insert({
          id: deliveryId,
          endpoint_id: ep.id,
          event_type: event,
          payload: payload as unknown as Json,
          status,
          response_status: responseStatus,
          error_message: errorMessage,
        })
      }),
  )
}

/** Fire-and-forget webhook dispatch using service role (route handlers). */
export async function enqueueOrganizationWebhook(
  organizationId: string,
  event: WebhookEventType,
  data: Record<string, unknown>,
): Promise<void> {
  const db = await createServiceRoleSupabaseClient()
  void dispatchOrganizationWebhooks(db, organizationId, event, data)
}