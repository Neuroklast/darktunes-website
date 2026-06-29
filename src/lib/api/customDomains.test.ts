import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import {
  createCustomDomain,
  generateDomainVerificationToken,
  getOrganizationIdByCustomDomain,
} from './customDomains'

type DbClient = SupabaseClient<Database>

function makeBuilder(data: unknown = null, error: unknown = null) {
  const result = { data, error }
  const p = Promise.resolve(result)
  return {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockReturnThis(),
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
  id: 'dom-1',
  organization_id: 'org-1',
  domain: 'label.com',
  status: 'pending' as const,
  verification_token: 'darktunes-verify=abc',
  verified_at: null,
  created_at: '2026-01-01T00:00:00Z',
}

describe('customDomains DAL', () => {
  it('generateDomainVerificationToken has expected prefix', () => {
    expect(generateDomainVerificationToken()).toMatch(/^darktunes-verify=/)
  })

  it('createCustomDomain normalizes domain', async () => {
    const db = makeMockDb(row)
    const domain = await createCustomDomain(db, 'org-1', 'WWW.Label.COM')
    expect(domain.domain).toBe('label.com')
  })

  it('getOrganizationIdByCustomDomain returns org id', async () => {
    const db = makeMockDb({ organization_id: 'org-1' })
    const orgId = await getOrganizationIdByCustomDomain(db, 'label.com')
    expect(orgId).toBe('org-1')
  })
})