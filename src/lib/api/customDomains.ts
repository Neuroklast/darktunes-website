import { randomBytes } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

type DbClient = SupabaseClient<Database>
type DomainStatus = Database['public']['Enums']['custom_domain_status']

export interface CustomDomain {
  id: string
  organizationId: string
  domain: string
  status: DomainStatus
  verificationToken: string
  verifiedAt: string | null
  createdAt: string
}

function rowToDomain(row: Database['public']['Tables']['custom_domains']['Row']): CustomDomain {
  return {
    id: row.id,
    organizationId: row.organization_id,
    domain: row.domain,
    status: row.status,
    verificationToken: row.verification_token,
    verifiedAt: row.verified_at,
    createdAt: row.created_at,
  }
}

export function generateDomainVerificationToken(): string {
  return `darktunes-verify=${randomBytes(16).toString('hex')}`
}

export async function listCustomDomainsByOrganization(
  db: DbClient,
  organizationId: string,
): Promise<CustomDomain[]> {
  const { data, error } = await db
    .from('custom_domains')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map(rowToDomain)
}

export async function createCustomDomain(
  db: DbClient,
  organizationId: string,
  domain: string,
): Promise<CustomDomain> {
  const normalized = domain.trim().toLowerCase().replace(/^www\./, '')
  const { data, error } = await db
    .from('custom_domains')
    .insert({
      organization_id: organizationId,
      domain: normalized,
      verification_token: generateDomainVerificationToken(),
      status: 'pending',
    })
    .select()
    .single()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('No data returned from createCustomDomain')
  return rowToDomain(data)
}

export async function getOrganizationIdByCustomDomain(
  db: DbClient,
  domain: string,
): Promise<string | null> {
  const normalized = domain.trim().toLowerCase().replace(/^www\./, '')
  const { data, error } = await db
    .from('custom_domains')
    .select('organization_id')
    .eq('domain', normalized)
    .in('status', ['verified', 'active'])
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data?.organization_id ?? null
}

export async function markCustomDomainVerified(
  db: DbClient,
  domainId: string,
): Promise<CustomDomain> {
  const { data, error } = await db
    .from('custom_domains')
    .update({ status: 'verified', verified_at: new Date().toISOString() })
    .eq('id', domainId)
    .select()
    .single()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('Domain not found')
  return rowToDomain(data)
}
