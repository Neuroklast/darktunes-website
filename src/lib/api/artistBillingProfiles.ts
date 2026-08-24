import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import {
  isSmallBusinessStatus,
  parseTaxStatus,
  taxStatusFromLegacy,
  type TaxStatus,
} from '@/lib/legal/taxStatus'
import type { ViesCheckResult } from '@/lib/legal/viesVat'

type DbClient = SupabaseClient<Database>
type ArtistBillingProfileRow = Database['public']['Tables']['artist_billing_profiles']['Row']
type ArtistBillingProfileInsert = Database['public']['Tables']['artist_billing_profiles']['Insert']

export interface ArtistBillingProfile {
  id: string
  artistId: string
  legalName: string
  street: string
  postalCode: string
  city: string
  country: string
  taxNumber: string | undefined
  vatId: string | undefined
  /** @deprecated prefer taxStatus */
  isSmallBusiness: boolean
  taxStatus: TaxStatus
  iban: string | undefined
  bic: string | undefined
  paypalEmail: string | undefined
  vatViesValid: boolean | null
  vatViesCheckedAt: string | null
  vatViesTraderName: string | null
  vatViesRequestId: string | null
  createdAt: string
  updatedAt: string
}

export interface UpsertBillingProfileData {
  legalName: string
  street: string
  postalCode: string
  city: string
  country: string
  taxNumber?: string
  vatId?: string
  taxStatus: TaxStatus
  /** @deprecated mapped to taxStatus when taxStatus omitted by older clients */
  isSmallBusiness?: boolean
  iban?: string
  bic?: string
  paypalEmail?: string
  /**
   * Optional VIES snapshot from server-side check on save.
   * - `undefined`: leave existing vat_vies_* columns unchanged
   * - `null`: clear VIES snapshot (e.g. VAT ID removed)
   * - object: store definitive result (`valid` / `invalid` only)
   */
  vies?: Pick<
    ViesCheckResult,
    'valid' | 'status' | 'traderName' | 'requestIdentifier'
  > | null
}

function rowToArtistBillingProfile(row: ArtistBillingProfileRow): ArtistBillingProfile {
  const taxStatus = parseTaxStatus(
    row.tax_status,
    taxStatusFromLegacy(row.is_small_business),
  )
  return {
    id: row.id,
    artistId: row.artist_id,
    legalName: row.legal_name,
    street: row.street,
    postalCode: row.postal_code,
    city: row.city,
    country: row.country,
    taxNumber: row.tax_number ?? undefined,
    vatId: row.vat_id ?? undefined,
    isSmallBusiness: isSmallBusinessStatus(taxStatus),
    taxStatus,
    iban: row.iban ?? undefined,
    bic: row.bic ?? undefined,
    paypalEmail: row.paypal_email ?? undefined,
    vatViesValid: row.vat_vies_valid ?? null,
    vatViesCheckedAt: row.vat_vies_checked_at ?? null,
    vatViesTraderName: row.vat_vies_trader_name ?? null,
    vatViesRequestId: row.vat_vies_request_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function normaliseOptional(value?: string): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

export async function getBillingProfile(
  db: DbClient,
  artistId: string,
): Promise<ArtistBillingProfile | null> {
  const { data, error } = await db
    .from('artist_billing_profiles')
    .select('*')
    .eq('artist_id', artistId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(error.message)
  }

  return data ? rowToArtistBillingProfile(data as ArtistBillingProfileRow) : null
}

/** Loads all artist billing profiles (admin SOS roster / SEPA payouts). */
export async function listBillingProfiles(db: DbClient): Promise<ArtistBillingProfile[]> {
  const { data, error } = await db.from('artist_billing_profiles').select('*')
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => rowToArtistBillingProfile(row as ArtistBillingProfileRow))
}

export async function upsertBillingProfile(
  db: DbClient,
  artistId: string,
  data: UpsertBillingProfileData,
): Promise<ArtistBillingProfile> {
  const taxStatus =
    data.taxStatus ??
    (data.isSmallBusiness !== undefined
      ? taxStatusFromLegacy(data.isSmallBusiness)
      : 'standard')

  const payload: ArtistBillingProfileInsert = {
    artist_id: artistId,
    legal_name: data.legalName.trim(),
    street: data.street.trim(),
    postal_code: data.postalCode.trim(),
    city: data.city.trim(),
    country: data.country.trim() || 'DE',
    tax_number: normaliseOptional(data.taxNumber),
    vat_id: normaliseOptional(data.vatId),
    tax_status: taxStatus,
    is_small_business: isSmallBusinessStatus(taxStatus),
    iban: normaliseOptional(data.iban),
    bic: normaliseOptional(data.bic),
    paypal_email: normaliseOptional(data.paypalEmail),
  }

  if (data.vies !== undefined) {
    if (data.vies === null) {
      payload.vat_vies_valid = null
      payload.vat_vies_checked_at = null
      payload.vat_vies_trader_name = null
      payload.vat_vies_request_id = null
    } else {
      payload.vat_vies_valid = data.vies.valid
      payload.vat_vies_checked_at = new Date().toISOString()
      payload.vat_vies_trader_name = data.vies.traderName?.trim() || null
      payload.vat_vies_request_id = data.vies.requestIdentifier?.trim() || null
    }
  }

  const { data: row, error } = await db
    .from('artist_billing_profiles')
    .upsert(payload, { onConflict: 'artist_id' })
    .select()
    .single()

  if (error) throw new Error(error.message)
  if (!row) throw new Error('No data returned from upsertBillingProfile')

  return rowToArtistBillingProfile(row as ArtistBillingProfileRow)
}

export function isBillingProfileComplete(profile: ArtistBillingProfile | null): boolean {
  if (!profile) return false

  const hasRequiredAddress = [
    profile.legalName,
    profile.street,
    profile.postalCode,
    profile.city,
    profile.country,
  ].every((value) => value.trim().length > 0)

  if (!hasRequiredAddress) return false

  if (profile.taxStatus === 'reverse_charge') {
    // Issuer's own tax/VAT number is optional under reverse charge (§13b UStG):
    // a third-country issuer (e.g. CH) has none; the recipient's (label) VAT-ID applies.
    return true
  }

  return Boolean(profile.taxNumber?.trim() || profile.vatId?.trim())
}

/**
 * SEPA payout readiness (display / admin SOS). Does not change invoice completeness.
 * Callers should validate IBAN checksum separately when accepting user input.
 */
export function isBillingProfileSepaReady(
  profile: ArtistBillingProfile | null,
  options?: { ibanValid?: boolean },
): boolean {
  if (!profile?.legalName?.trim() || !profile.iban?.trim()) return false
  if (options?.ibanValid === false) return false
  return true
}

/** Audit payload with IBAN/BIC masked (last 4 chars only). */
export function toBillingProfileAuditSnapshot(
  profile: ArtistBillingProfile | null,
): Record<string, unknown> | null {
  if (!profile) return null
  return {
    id: profile.id,
    artistId: profile.artistId,
    legalName: profile.legalName,
    street: profile.street,
    postalCode: profile.postalCode,
    city: profile.city,
    country: profile.country,
    taxNumber: profile.taxNumber ?? null,
    vatId: profile.vatId ?? null,
    taxStatus: profile.taxStatus,
    isSmallBusiness: profile.isSmallBusiness,
    iban: maskIban(profile.iban),
    bic: profile.bic ? '***' : null,
    paypalEmail: profile.paypalEmail ?? null,
    vatViesValid: profile.vatViesValid,
    vatViesCheckedAt: profile.vatViesCheckedAt,
    updatedAt: profile.updatedAt,
  }
}

function maskIban(iban: string | undefined): string | null {
  if (!iban?.trim()) return null
  const compact = iban.replace(/\s+/g, '')
  if (compact.length <= 4) return '****'
  return `****${compact.slice(-4)}`
}
