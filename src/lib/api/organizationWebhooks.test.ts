import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import {
  createOrganizationWebhookEndpoint,
  generateWebhookSecret,
  listOrganizationWebhookEndpoints,
} from './organizationWebhooks'

type DbClient = SupabaseClient<Database>

function makeBuilder(data: unknown = null, error: unknown = null) {
  const result = { data, error }
  const p = Promise.resolve(result)
  return {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    then: p.then.bind(p),
    catch: p.catch.bind(p),
    finally: p.finally.bind(p),
  }
}

function makeMockDb(data: unknown = null, error: unknown = null): DbClient {
  return { from: vi.fn().mockReturnValue(makeBuilder(data, error)) } as unknown as DbClient
}

const row = {
  id: 'wh-1',
  organization_id: 'org-1',
  url: 'https://partner.example/hook',
  events: ['release.submitted'],
  enabled: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

describe('organizationWebhooks DAL', () => {
  it('generateWebhookSecret returns hex string', () => {
    expect(generateWebhookSecret()).toMatch(/^[a-f0-9]{64}$/)
  })

  it('listOrganizationWebhookEndpoints maps rows', async () => {
    const db = makeMockDb([row])
    const items = await listOrganizationWebhookEndpoints(db, 'org-1')
    expect(items[0].id).toBe('wh-1')
    expect(items[0].organizationId).toBe('org-1')
  })

  it('createOrganizationWebhookEndpoint returns mapped endpoint', async () => {
    const db = makeMockDb(row)
    const item = await createOrganizationWebhookEndpoint(db, {
      organization_id: 'org-1',
      url: 'https://partner.example/hook',
      events: ['artist.created'],
      secret: 'secret',
    })
    expect(item.url).toBe('https://partner.example/hook')
  })
})