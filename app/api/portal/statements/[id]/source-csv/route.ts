/**
 * GET /api/portal/statements/[id]/source-csv?artistId=
 *
 * Streams the linked bronze distributor CSV for chain-of-custody verification.
 * Membership required; only artist-visible statement statuses; never exposes R2 keys.
 */

import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandler, ApiError } from '@/lib/errors'
import { portalMemberWrite, withPortalMembershipWrite } from '@/lib/portal/withPortalMembership'
import {
  ARTIST_VISIBLE_STATEMENT_STATUSES,
  getSalesStatementById,
} from '@/lib/api/salesStatements'
import { getImportBatchById } from '@/lib/api/distributorImportBatches'
import { createR2Client, downloadObjectFromR2 } from '@/lib/r2Utils'

const ROUTE = 'GET /api/portal/statements/[id]/source-csv'

function extractStatementId(pathname: string): string | null {
  const match = pathname.match(/\/portal\/statements\/([^/]+)\/source-csv\/?$/)
  return match?.[1] ?? null
}

function filenameFromR2Key(r2Key: string, distributor: string): string {
  const base = r2Key.split('/').pop() ?? 'source.csv'
  const underscore = base.indexOf('_')
  const name = underscore >= 0 ? base.slice(underscore + 1) : base
  if (name.toLowerCase().endsWith('.csv')) return name
  return `${distributor || 'source'}-bronze.csv`
}

export const GET = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const artistId = req.nextUrl.searchParams.get('artistId')
  const ctx = await withPortalMembershipWrite(req, artistId)
  const statementId = extractStatementId(req.nextUrl.pathname)
  if (!statementId) throw new ApiError(400, 'Invalid statement source path')

  const { value: statement } = await portalMemberWrite(
    ctx,
    { route: ROUTE, table: 'sales_statements', operation: 'select' },
    (db) => getSalesStatementById(db, statementId, ctx.artist.id),
  )

  if (!statement) throw new ApiError(404, 'Statement not found')
  if (!ARTIST_VISIBLE_STATEMENT_STATUSES.includes(statement.status)) {
    throw new ApiError(403, 'Statement is not available')
  }
  if (!statement.batchId) {
    throw new ApiError(404, 'No source archive linked to this statement')
  }

  const { value: batch } = await portalMemberWrite(
    ctx,
    { route: ROUTE, table: 'distributor_import_batches', operation: 'select' },
    (db) => getImportBatchById(db, statement.batchId!),
  )

  if (!batch) throw new ApiError(404, 'Source batch not found')
  if (!batch.fileHash || batch.status === 'failed') {
    throw new ApiError(409, 'Source archive is not available for download')
  }

  const { serverEnv } = await import('@/lib/env.server')
  const s3 = createR2Client(
    serverEnv.CLOUDFLARE_R2_ACCOUNT_ID,
    serverEnv.CLOUDFLARE_R2_ACCESS_KEY_ID,
    serverEnv.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
  )

  const csvText = await downloadObjectFromR2(batch.r2Key, s3, serverEnv.CLOUDFLARE_R2_BUCKET_NAME)
  const filename = filenameFromR2Key(batch.r2Key, batch.distributor)

  return new NextResponse(csvText, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename.replace(/"/g, '')}"`,
      'X-Content-SHA256': batch.fileHash,
      'Cache-Control': 'no-store',
    },
  })
})
