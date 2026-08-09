import { randomBytes } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { WebhookEventType } from '@/lib/partner-api/webhooks'

type DbClient = SupabaseClient<Database>
type Row = Database['public']['Tables']['organization_webhook_endpoints']['Row']
type Insert = Database['public']['Tables']['organization_webhook_endpoints']['Insert']
type PublicRow = Pick<
  Row,
  'id' | 'organization_id' | 'url' | 'events' | 'enabled' | 'created_at' | 'updated_at'
>

export interface OrganizationWebhookEndpoint {
  id: string
  organizationId: string
  url: string
  events: WebhookEventType[]
  enabled: boolean
  createdAt: string
  updatedAt: string
}

function rowToEndpoint(row: PublicRow): OrganizationWebhookEndpoint {
  return {
    id: row.id,
    organizationId: row.organization_id,
    url: row.url,
    events: row.events as WebhookEventType[],
    enabled: row.enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function generateWebhookSecret(): string {
  return randomBytes(32).toString('hex')
}

export async function listOrganizationWebhookEndpoints(
  db: DbClient,
  organizationId: string,
): Promise<OrganizationWebhookEndpoint[]> {
  const { data, error } = await db
    .from('organization_webhook_endpoints')
    .select('id, organization_id, url, events, enabled, created_at, updated_at')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []).map(rowToEndpoint)
}

export async function createOrganizationWebhookEndpoint(
  db: DbClient,
  payload: Pick<Insert, 'organization_id' | 'url' | 'events'> & { secret: string },
): Promise<OrganizationWebhookEndpoint> {
  const { data, error } = await db
    .from('organization_webhook_endpoints')
    .insert({
      organization_id: payload.organization_id,
      url: payload.url,
      secret: payload.secret,
      events: payload.events,
      enabled: true,
    })
    .select('id, organization_id, url, events, enabled, created_at, updated_at')
    .single()

  if (error) throw new Error(error.message)
  if (!data) throw new Error('No data returned from createOrganizationWebhookEndpoint')
  return rowToEndpoint(data)
}

export async function updateOrganizationWebhookEndpoint(
  db: DbClient,
  id: string,
  patch: { enabled?: boolean; events?: WebhookEventType[]; url?: string },
): Promise<OrganizationWebhookEndpoint> {
  const { data, error } = await db
    .from('organization_webhook_endpoints')
    .update(patch)
    .eq('id', id)
    .select('id, organization_id, url, events, enabled, created_at, updated_at')
    .single()

  if (error) throw new Error(error.message)
  if (!data) throw new Error('No data returned from updateOrganizationWebhookEndpoint')
  return rowToEndpoint(data)
}

export async function deleteOrganizationWebhookEndpoint(db: DbClient, id: string): Promise<void> {
  const { error } = await db.from('organization_webhook_endpoints').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
