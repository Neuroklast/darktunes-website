/**
 * GET  /api/portal/integrations/bandsintown?artistId=
 * PUT  /api/portal/integrations/bandsintown?artistId=
 *
 * Portal members manage per-artist Bandsintown credentials (same fields as admin).
 * API key is never returned in full — only hasApiKey boolean.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withErrorHandler, ApiError } from '@/lib/errors'
import { portalMemberWrite, withPortalMembershipWrite } from '@/lib/portal/withPortalMembership'

const putBodySchema = z.object({
  bandsintownId: z.string().trim().max(200).nullable().optional(),
  /** Empty / omitted keeps the existing key; non-empty replaces it. */
  bandsintownApiKey: z.string().trim().max(500).optional(),
})

function artistIdFromReq(req: NextRequest): string | null {
  return req.nextUrl.searchParams.get('artistId')
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const artistId = artistIdFromReq(req)
  const ctx = await withPortalMembershipWrite(req, artistId)

  const { value } = await portalMemberWrite(
    ctx,
    {
      route: 'GET /api/portal/integrations/bandsintown',
      table: 'artists',
      operation: 'select',
    },
    async (db) => {
      const { data, error } = await db
        .from('artists')
        .select('bandsintown_id, bandsintown_api_key')
        .eq('id', ctx.artist.id)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return data
    },
  )

  return NextResponse.json({
    bandsintownId: value?.bandsintown_id ?? '',
    hasApiKey: Boolean(value?.bandsintown_api_key?.trim()),
  })
})

export const PUT = withErrorHandler(async (req: NextRequest) => {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    throw new ApiError(400, 'Invalid JSON body')
  }

  const parsed = putBodySchema.safeParse(raw)
  if (!parsed.success) {
    throw new ApiError(400, parsed.error.issues[0]?.message ?? 'Invalid payload')
  }

  const artistId = artistIdFromReq(req)
  const ctx = await withPortalMembershipWrite(req, artistId)

  const update: {
    bandsintown_id?: string | null
    bandsintown_api_key?: string | null
    updated_at: string
  } = {
    updated_at: new Date().toISOString(),
  }

  if (parsed.data.bandsintownId !== undefined) {
    const id = parsed.data.bandsintownId
    update.bandsintown_id = id && id.length > 0 ? id : null
  }

  if (parsed.data.bandsintownApiKey !== undefined) {
    const key = parsed.data.bandsintownApiKey.trim()
    if (key.length > 0) {
      update.bandsintown_api_key = key
    }
    // Empty string = keep existing key (no overwrite)
  }

  await portalMemberWrite(
    ctx,
    {
      route: 'PUT /api/portal/integrations/bandsintown',
      table: 'artists',
      operation: 'update',
    },
    async (db) => {
      const { error } = await db.from('artists').update(update).eq('id', ctx.artist.id)
      if (error) throw new Error(error.message)
    },
  )

  // Re-read for response shape
  const { value } = await portalMemberWrite(
    ctx,
    {
      route: 'PUT /api/portal/integrations/bandsintown',
      table: 'artists',
      operation: 'select',
    },
    async (db) => {
      const { data, error } = await db
        .from('artists')
        .select('bandsintown_id, bandsintown_api_key')
        .eq('id', ctx.artist.id)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return data
    },
  )

  return NextResponse.json({
    bandsintownId: value?.bandsintown_id ?? '',
    hasApiKey: Boolean(value?.bandsintown_api_key?.trim()),
  })
})
