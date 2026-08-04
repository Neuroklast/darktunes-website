import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  getBillingProfile,
  isBillingProfileComplete,
  toBillingProfileAuditSnapshot,
  upsertBillingProfile,
} from '@/lib/api/artistBillingProfiles'
import { logFinancialEvent } from '@/lib/api/financialAudit'
import { resolvePortalArtist } from '@/lib/api/artistProfiles'
import { ApiError, withErrorHandler } from '@/lib/errors'
import { TAX_STATUS_VALUES } from '@/lib/legal/taxStatus'
import {
  checkVatWithVies,
  isEuVatCountry,
  parseVatId,
  type ViesCheckResult,
} from '@/lib/legal/viesVat'
import { authenticatePortalBearer } from '@/lib/portal/bearerAuth'
import { portalMemberWrite, withPortalMembership } from '@/lib/portal/withPortalMembership'
import { isValidIBAN, sanitiseIBAN } from '@/lib/sos/iban-validator'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'

type UpsertVies = {
  valid: boolean
  status: ViesCheckResult['status']
  traderName?: string
  requestIdentifier?: string
} | null

const upsertBillingProfileSchema = z.object({
  artist_id: z.string().uuid(),
  legal_name: z.string().trim().min(1),
  street: z.string().trim().min(1),
  postal_code: z.string().trim().min(1),
  city: z.string().trim().min(1),
  country: z.string().trim().min(1).default('DE'),
  tax_number: z.string().optional(),
  vat_id: z.string().optional(),
  tax_status: z.enum(['standard', 'small_business', 'reverse_charge']).optional(),
  /** @deprecated prefer tax_status */
  is_small_business: z.boolean().optional().default(false),
  iban: z.string().optional(),
  bic: z.string().optional(),
  paypal_email: z.string().email().optional().or(z.literal('')),
})

export const GET = withErrorHandler(async (req: NextRequest) => {
  const { supabase, user } = await authenticatePortalBearer(req)
  const artistId = req.nextUrl.searchParams.get('artist_id') ?? undefined
  const artist = await resolvePortalArtist(supabase, user.id, artistId)
  if (!artist) throw new ApiError(403, 'Forbidden')

  // Membership verified — service-role avoids RLS drift blocking band members.
  const serviceDb = await createServiceRoleSupabaseClient()
  const profile = await getBillingProfile(serviceDb, artist.id)

  return NextResponse.json({
    profile,
    isComplete: isBillingProfileComplete(profile),
  })
})

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body: unknown = await req.json()
  const parsed = upsertBillingProfileSchema.safeParse(body)

  if (!parsed.success) {
    throw new ApiError(400, parsed.error.issues.map((issue) => issue.message).join('; '))
  }

  const taxStatus =
    parsed.data.tax_status ??
    (parsed.data.is_small_business ? 'small_business' : 'standard')

  if (!(TAX_STATUS_VALUES as string[]).includes(taxStatus)) {
    throw new ApiError(400, 'Invalid tax_status')
  }

  // Local-only IBAN check (ISO 7064) — never send bank data to third-party APIs.
  const rawIban = parsed.data.iban?.trim() ?? ''
  let normalisedIban: string | undefined
  if (rawIban) {
    const clean = sanitiseIBAN(rawIban)
    if (!isValidIBAN(clean)) {
      throw new ApiError(422, 'IBAN checksum or format is invalid')
    }
    normalisedIban = clean
  }

  const vatRaw = parsed.data.vat_id?.trim() ?? ''
  if (taxStatus === 'reverse_charge' && !vatRaw) {
    throw new ApiError(422, 'Reverse charge requires an EU VAT ID (USt-IdNr.)')
  }

  // EU VIES validation when a VAT ID is present (required for reverse charge).
  let viesResult: ViesCheckResult | null = null
  let viesPersist: UpsertVies | undefined
  let normalisedVatId: string | undefined

  if (vatRaw) {
    const parsedVat = parseVatId(vatRaw)
    if (!parsedVat) {
      throw new ApiError(422, 'VAT ID format is invalid (expected e.g. DE123456789)')
    }
    normalisedVatId = parsedVat.compact

    if (isEuVatCountry(parsedVat.countryCode) || taxStatus === 'reverse_charge') {
      viesResult = await checkVatWithVies(normalisedVatId)

      if (taxStatus === 'reverse_charge') {
        if (viesResult.status === 'invalid' || viesResult.status === 'malformed') {
          throw new ApiError(
            422,
            viesResult.message ??
              'VAT ID is not valid in EU VIES — reverse charge cannot be applied',
          )
        }
        if (viesResult.status === 'not_eu') {
          throw new ApiError(
            422,
            'Reverse charge requires an EU VAT ID registered in VIES',
          )
        }
        if (viesResult.status === 'service_unavailable') {
          throw new ApiError(
            503,
            'EU VIES service is temporarily unavailable — try again later before saving reverse-charge status',
          )
        }
      }

      // Persist only definitive VIES outcomes (never mark invalid when service is down).
      if (viesResult.status === 'valid' || viesResult.status === 'invalid') {
        viesPersist = {
          valid: viesResult.valid,
          status: viesResult.status,
          traderName: viesResult.traderName,
          requestIdentifier: viesResult.requestIdentifier,
        }
      }
      // service_unavailable / not_eu for non-RC: leave previous VIES snapshot unchanged
    } else {
      // Non-EU VAT ID stored as text only — clear VIES snapshot.
      viesPersist = null
    }
  } else {
    viesPersist = null
  }

  const ctx = await withPortalMembership(req, parsed.data.artist_id)

  const previous = await portalMemberWrite(
    ctx,
    {
      route: 'POST /api/portal/billing-profile',
      table: 'artist_billing_profiles',
      operation: 'select',
    },
    (db) => getBillingProfile(db, ctx.artist.id),
  ).then((r) => r.value)

  const { value: profile } = await portalMemberWrite(
    ctx,
    {
      route: 'POST /api/portal/billing-profile',
      table: 'artist_billing_profiles',
      operation: 'upsert',
    },
    (db) =>
      upsertBillingProfile(db, ctx.artist.id, {
        legalName: parsed.data.legal_name,
        street: parsed.data.street,
        postalCode: parsed.data.postal_code,
        city: parsed.data.city,
        country: parsed.data.country,
        taxNumber: parsed.data.tax_number,
        vatId: normalisedVatId,
        taxStatus,
        iban: normalisedIban,
        bic: parsed.data.bic,
        paypalEmail: parsed.data.paypal_email || undefined,
        vies: viesPersist,
      }),
  )

  // GoBD-oriented audit trail (IBAN masked in snapshots).
  try {
    await portalMemberWrite(
      ctx,
      {
        route: 'POST /api/portal/billing-profile',
        table: 'financial_audit_events',
        operation: 'insert',
      },
      (db) =>
        logFinancialEvent(db, {
          entityType: 'artist_billing_profile',
          entityId: profile.id,
          action: previous ? 'update' : 'create',
          actorId: ctx.user.id,
          beforeData: toBillingProfileAuditSnapshot(previous),
          afterData: toBillingProfileAuditSnapshot(profile),
        }),
    )
  } catch (err) {
    console.error('[billing-profile] financial audit log failed', err)
  }

  return NextResponse.json({
    profile,
    isComplete: isBillingProfileComplete(profile),
    vies: viesResult
      ? {
          status: viesResult.status,
          valid: viesResult.valid,
          traderName: viesResult.traderName,
          message: viesResult.message,
        }
      : null,
  })
})
