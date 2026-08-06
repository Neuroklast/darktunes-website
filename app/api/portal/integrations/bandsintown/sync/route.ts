/**
 * POST /api/portal/integrations/bandsintown/sync?artistId=
 *
 * One-off Bandsintown concert sync for the active portal artist.
 * Uses credentials from body and/or stored artist fields.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withErrorHandler, ApiError } from '@/lib/errors'
import { portalMemberWrite, withPortalMembershipWrite } from '@/lib/portal/withPortalMembership'
import { fetchBandsintownArtistEvents } from '@/lib/sync/bandsintownApi'

const bodySchema = z.object({
  bandsintownId: z.string().trim().min(1).max(200).optional(),
  bandsintownApiKey: z.string().trim().min(1).max(500).optional(),
})

export const POST = withErrorHandler(async (req: NextRequest) => {
  let raw: unknown = {}
  try {
    raw = await req.json()
  } catch {
    // empty body is ok — use stored credentials
  }

  const parsed = bodySchema.safeParse(raw ?? {})
  if (!parsed.success) {
    throw new ApiError(400, parsed.error.issues[0]?.message ?? 'Invalid payload')
  }

  const artistId = req.nextUrl.searchParams.get('artistId')
  const ctx = await withPortalMembershipWrite(req, artistId)

  const { value: stored } = await portalMemberWrite(
    ctx,
    {
      route: 'POST /api/portal/integrations/bandsintown/sync',
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

  const bandsintownId =
    parsed.data.bandsintownId?.trim() || stored?.bandsintown_id?.trim() || ''
  const bandsintownApiKey =
    parsed.data.bandsintownApiKey?.trim() || stored?.bandsintown_api_key?.trim() || ''

  if (!bandsintownId) {
    throw new ApiError(400, 'Missing Bandsintown artist ID')
  }
  if (!bandsintownApiKey) {
    throw new ApiError(400, 'Missing Bandsintown API key')
  }

  // Persist credentials used for this sync (if provided in body)
  if (parsed.data.bandsintownId || parsed.data.bandsintownApiKey) {
    await portalMemberWrite(
      ctx,
      {
        route: 'POST /api/portal/integrations/bandsintown/sync',
        table: 'artists',
        operation: 'update',
      },
      async (db) => {
        const { error } = await db
          .from('artists')
          .update({
            bandsintown_id: bandsintownId,
            ...(parsed.data.bandsintownApiKey
              ? { bandsintown_api_key: bandsintownApiKey }
              : {}),
            updated_at: new Date().toISOString(),
          })
          .eq('id', ctx.artist.id)
        if (error) throw new Error(error.message)
      },
    )
  }

  let concerts
  try {
    concerts = await fetchBandsintownArtistEvents(
      bandsintownId,
      bandsintownApiKey,
      globalThis.fetch,
    )
  } catch (e) {
    const msg = String(e)
    if (msg.includes('401') || msg.includes('403')) {
      throw new ApiError(400, 'Bandsintown API key is invalid or unauthorised')
    }
    throw new ApiError(502, `Bandsintown API error: ${msg}`)
  }

  if (concerts.length === 0) {
    return NextResponse.json({ concertsUpserted: 0 })
  }

  const concertsData = concerts.map((concert) => ({
    artist_id: ctx.artist.id,
    event_name: concert.eventName,
    venue_name: concert.venueName,
    venue_city: concert.venueCity,
    venue_country: concert.venueCountry,
    concert_date: concert.concertDate,
    ticket_url: concert.ticketUrl,
    bandsintown_id: concert.bandsintownId,
    status: concert.status,
  }))

  await portalMemberWrite(
    ctx,
    {
      route: 'POST /api/portal/integrations/bandsintown/sync',
      table: 'concerts',
      operation: 'upsert',
    },
    async (db) => {
      const { error } = await db
        .from('concerts')
        .upsert(concertsData, { onConflict: 'bandsintown_id' })
      if (error) throw new Error(error.message)
    },
  )

  return NextResponse.json({ concertsUpserted: concerts.length })
})
