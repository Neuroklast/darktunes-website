'use server'

/**
 * app/portal/statements/_actions/uploadStatement.ts — Server Action
 *
 * Handles the complete Statement-of-Sales PDF upload flow entirely within the
 * app, replacing the now-obsolete external webhook approach.
 *
 * Security:
 *   - Authenticated via the caller's Supabase session (admin or editor role required)
 *   - No shared secret or external service involved
 *   - Credentials never leave the server
 */

import { createServerSupabaseClient, createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import { getUserRoleWithClient } from '@/lib/getUserRole'
import { getArtistById } from '@/lib/api/artists'
import { createSalesStatement, DuplicateDraftStatementError } from '@/lib/api/salesStatements'
import {
  assertSettlementPeriodWritable,
  getOrCreateSettlementPeriod,
  SettlementPeriodNotWritableError,
} from '@/lib/api/settlementPeriods'
import { createSalesStatementLineItems } from '@/lib/api/salesStatementLineItems'
import {
  buildStatementR2Key,
  deleteStatementPdfFromR2,
  uploadStatementPdfToR2,
} from '@/lib/portal/statementPdfStorage'

export interface UploadStatementLineItemInput {
  platform?: string
  country?: string
  streams?: number
  revenueEur?: number
  quantity?: number
  releaseId?: string
}

export interface UploadStatementInput {
  artistId: string
  filename: string
  period: string
  amountEur?: number
  periodStart?: string
  periodEnd?: string
  totalStreams?: number
  batchId?: string
  lineItems?: UploadStatementLineItemInput[]
  /** PDF file contents encoded as a Base64 string. */
  pdfBase64: string
  /** When true, sends the artist notification email immediately. Defaults to false. */
  notifyArtist?: boolean
}

export interface UploadStatementResult {
  success: boolean
  statementId?: string
  error?: string
}

/**
 * Server Action: upload a Statement-of-Sales PDF directly to R2 and persist
 * the metadata record in the database.
 *
 * Requires the caller to be authenticated with admin or editor role.
 */
export async function uploadStatement(
  input: UploadStatementInput,
): Promise<UploadStatementResult> {
  try {
    // 1. Authenticate via session cookie (admin/editor only)
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const role = await getUserRoleWithClient(supabase, user.id)
    if (!role || !['admin', 'editor'].includes(role)) {
      return { success: false, error: 'Forbidden: admin or editor role required' }
    }

    // 2. Verify the artist exists
    const serviceSupabase = await createServiceRoleSupabaseClient()
    const artist = await getArtistById(serviceSupabase, input.artistId)
    if (!artist) {
      return { success: false, error: `Artist ${input.artistId} not found` }
    }

    const periodStart = input.periodStart ?? null
    const periodEnd = input.periodEnd ?? null
    if (periodStart && periodEnd) {
      await assertSettlementPeriodWritable(serviceSupabase, periodStart, periodEnd)
    }

    // 3. Build the R2 key and upload the PDF
    const r2Key = buildStatementR2Key(input.artistId, input.filename)
    await uploadStatementPdfToR2(input.pdfBase64, r2Key)

    let statementId: string | undefined
    try {
      // 4. Persist the DB record via service-role client (bypasses RLS)
      const settlementPeriod =
        periodStart && periodEnd
          ? await getOrCreateSettlementPeriod(serviceSupabase, periodStart, periodEnd)
          : null

      const statement = await createSalesStatement(serviceSupabase, {
        artistId: input.artistId,
        filename: input.filename,
        r2Key,
        period: input.period,
        amountEur: input.amountEur,
        periodStart,
        periodEnd,
        totalStreams: input.totalStreams ?? 0,
        batchId: input.batchId ?? null,
      })
      statementId = statement.id

      if (settlementPeriod) {
        await serviceSupabase
          .from('sales_statements')
          .update({ settlement_period_id: settlementPeriod.id })
          .eq('id', statement.id)
      }

      if (input.lineItems && input.lineItems.length > 0) {
        await createSalesStatementLineItems(
          serviceSupabase,
          input.lineItems.map((item) => ({
            statementId: statement.id,
            releaseId: item.releaseId ?? null,
            platform: item.platform ?? null,
            country: item.country ?? null,
            streams: item.streams ?? 0,
            revenueEur: item.revenueEur ?? 0,
            quantity: item.quantity ?? 0,
          })),
        )
      }
    } catch (dbErr) {
      await deleteStatementPdfFromR2(r2Key)
      throw dbErr
    }

    if (input.notifyArtist && statementId) {
      try {
        const { approveSalesStatement, getSalesStatementById, updateSalesStatementStatus } = await import(
          '@/lib/api/salesStatements'
        )
        const { notifyStatementArtist } = await import('@/lib/sos/notifyStatementArtist')
        const statement = await getSalesStatementById(serviceSupabase, statementId)
        if (statement) {
          const emailResult = await notifyStatementArtist(serviceSupabase, statement, fetch)
          if (emailResult.success) {
            if (statement.status === 'draft') {
              await approveSalesStatement(serviceSupabase, statement.id)
            }
            await updateSalesStatementStatus(serviceSupabase, statement.id, 'artist_notified')
          } else {
            console.warn('[uploadStatement] Email notification skipped:', emailResult.error)
          }
          // In-app bell even when email fails — artist should still see the statement
          try {
            const { emitNotification } = await import('@/lib/notifications/emit')
            await emitNotification(serviceSupabase, {
              type: 'statement_available',
              entityId: statement.id,
              entityName: statement.period || statement.filename || 'New statement',
              artistId: statement.artistId,
              dedupeKey: `statement_available:${statement.id}`,
            })
          } catch (notifErr) {
            console.error('[uploadStatement] In-app notification failed:', notifErr)
          }
        }
      } catch (emailErr) {
        console.error('[uploadStatement] Email notification failed:', emailErr)
      }
    }

    return { success: true, statementId }
  } catch (err) {
    if (err instanceof SettlementPeriodNotWritableError || err instanceof DuplicateDraftStatementError) {
      return { success: false, error: err.message }
    }
    const message = err instanceof Error ? err.message : 'Unexpected error'
    console.error('[uploadStatement] Error:', err)
    return { success: false, error: message }
  }
}
