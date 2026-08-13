/**
 * src/lib/sync/bandsintownApi.ts
 *
 * Bandsintown API v3 integration.
 *
 * Fetches upcoming events for a given artist identifier.
 * The identifier is the **artist name as registered on Bandsintown**
 * (UI: Bandsintown Artist Name). `id:{numeric_id}` also works but is
 * not what the admin/portal fields ask for.
 *
 * Docs: https://app.swaggerhub.com/apis/Bandsintown/PublicAPI/3.0.0
 * Endpoint: GET https://rest.bandsintown.com/artists/{artistname}/events?app_id={app_id}
 */

import { HttpError } from '@/lib/rateLimiter'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BandsintownVenue {
  name: string
  city: string
  region: string
  country: string
  latitude: string
  longitude: string
}

export interface BandsintownOffer {
  type: string
  url: string
  status: string
}

export interface BandsintownEvent {
  id: string
  artist_id: string
  url: string
  datetime: string          // ISO 8601, e.g. "2026-07-15T20:00:00"
  description: string | null
  venue: BandsintownVenue
  offers: BandsintownOffer[]
  lineup: string[]
  festival_name: string | null
  title: string | null
  on_sale_datetime: string | null
}

export interface BandsintownConcert {
  bandsintownId: string
  eventName: string
  venueName: string | null
  venueCity: string | null
  venueCountry: string | null
  concertDate: string        // YYYY-MM-DD
  ticketUrl: string | null
  status: 'ok' | 'cancelled'
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetches upcoming events for the given Bandsintown artist identifier.
 *
 * @param artistId  - The artist name or "id:{numeric_id}" as stored in artists.bandsintown_id
 * @param apiKey    - Bandsintown API key (sent as app_id query param)
 * @param fetchFn   - Injectable fetch (real in prod, mockable in tests)
 */
export async function fetchBandsintownArtistEvents(
  artistId: string,
  apiKey: string,
  fetchFn: typeof fetch,
): Promise<BandsintownConcert[]> {
  const encoded = encodeURIComponent(artistId)
  const url = new URL(`https://rest.bandsintown.com/artists/${encoded}/events`)
  url.searchParams.set('app_id', apiKey)
  url.searchParams.set('date', 'upcoming')

  const response = await fetchFn(url.toString())

  if (!response.ok) {
    throw new HttpError(
      response.status,
      `Bandsintown events fetch failed: ${response.status}`,
    )
  }

  const data = (await response.json()) as BandsintownEvent[] | { error?: string }

  // Bandsintown returns an object with "error" if the artist is not found
  if (!Array.isArray(data)) {
    return []
  }

  const concerts: BandsintownConcert[] = []

  for (const event of data) {
    // Extract date from datetime (ISO string → YYYY-MM-DD)
    const datePart = event.datetime?.split('T')[0]
    if (!datePart) continue

    // Prefer ticket offer URL, fall back to event URL
    const ticketOffer = event.offers?.find((o) => o.type === 'Tickets')
    const ticketUrl = ticketOffer?.url ?? event.url ?? null

    // Build event name: use title if available, else festival_name, else lineup
    const eventName =
      event.title ??
      event.festival_name ??
      (event.lineup?.length ? event.lineup.join(', ') : 'Concert')

    concerts.push({
      bandsintownId: event.id,
      eventName,
      venueName: event.venue?.name ?? null,
      venueCity: event.venue?.city ?? null,
      venueCountry: event.venue?.country ?? null,
      concertDate: datePart,
      ticketUrl,
      status: 'ok',
    })
  }

  return concerts
}
