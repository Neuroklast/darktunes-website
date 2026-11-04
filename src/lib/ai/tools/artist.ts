import { z } from 'zod'
import { registerTool } from '@/lib/ai/tools/registry'
import { getArtistById } from '@/lib/api/artists'
import { getArtistProfileByArtistId } from '@/lib/api/artistProfiles'
import { getReleasesByArtistId } from '@/lib/api/releases'
import { getReleaseSubmissionsByArtistId } from '@/lib/api/releaseSubmissions'
import { searchHelpContent } from '@/lib/portal/useHelpSearch'
import { getFeatureFlagsForRole } from '@/lib/api/featureFlags'
import { ApiError } from '@/lib/errors'

function requireArtistId(artistId: string | null): string {
  if (!artistId) throw new ApiError(403, 'No artist linked to this account', 'FORBIDDEN_NO_ARTIST')
  return artistId
}

registerTool({
  name: 'get_artist_profile',
  description: 'Get the current artist name, slug, and EPK completeness.',
  input: z.object({}),
  output: z.object({
    available: z.boolean(),
    name: z.string().optional(),
    slug: z.string().optional(),
    has_bio: z.boolean().optional(),
    has_photo: z.boolean().optional(),
    reason: z.string().optional(),
  }),
  capabilities: [],
  dataScope: 'self_artist',
  classification: 'read',
  maxResultBytes: 4000,
  timeoutMs: 8000,
  execute: async (_input, context) => {
    const artistId = requireArtistId(context.actor.artistId)
    const artist = await getArtistById(context.actor.serviceDb, artistId)
    if (!artist) return { available: false, reason: 'Artist not found.' }
    const profile = await getArtistProfileByArtistId(context.actor.serviceDb, artistId)
    return {
      available: true,
      name: artist.name,
      slug: artist.slug,
      has_bio: Boolean(profile?.bioShort || profile?.bioMedium || profile?.bioLong),
      has_photo: Boolean(artist.imageUrl),
    }
  },
})

registerTool({
  name: 'get_artist_releases',
  description: 'List the current artist catalog releases (title, year, type).',
  input: z.object({ limit: z.number().int().min(1).max(25).optional() }),
  output: z.object({
    available: z.boolean(),
    releases: z.array(z.object({ title: z.string(), release_date: z.string(), type: z.string() })),
    reason: z.string().optional(),
  }),
  capabilities: [],
  dataScope: 'self_artist',
  classification: 'read',
  maxResultBytes: 8000,
  timeoutMs: 8000,
  execute: async (input, context) => {
    const artistId = requireArtistId(context.actor.artistId)
    const releases = await getReleasesByArtistId(context.actor.serviceDb, artistId)
    const limit = input.limit ?? 10
    return {
      available: true,
      releases: releases.slice(0, limit).map((release) => ({
        title: release.title,
        release_date: release.releaseDate,
        type: release.type,
      })),
    }
  },
})

registerTool({
  name: 'get_release_submission_status',
  description: 'List pending and recent release submissions for the current artist.',
  input: z.object({}),
  output: z.object({
    available: z.boolean(),
    submissions: z.array(z.object({ title: z.string(), status: z.string(), created_at: z.string() })),
  }),
  capabilities: [],
  dataScope: 'self_artist',
  classification: 'read',
  maxResultBytes: 8000,
  timeoutMs: 8000,
  execute: async (_input, context) => {
    const artistId = requireArtistId(context.actor.artistId)
    const submissions = await getReleaseSubmissionsByArtistId(context.actor.serviceDb, artistId)
    return {
      available: true,
      submissions: submissions.slice(0, 15).map((item) => ({
        title: item.title,
        status: item.status,
        created_at: item.createdAt,
      })),
    }
  },
})

registerTool({
  name: 'search_portal_help',
  description: 'Search artist portal help topics for how-to questions.',
  input: z.object({ query: z.string().min(2).max(120) }),
  output: z.object({
    available: z.boolean(),
    matches: z.array(z.object({ kind: z.string(), topic_id: z.string().optional(), score: z.number() })),
  }),
  capabilities: [],
  dataScope: 'none',
  classification: 'read',
  maxResultBytes: 4000,
  timeoutMs: 3000,
  execute: async (input) => {
    const result = searchHelpContent(input.query, (key) => key)
    return {
      available: result.matches.length > 0,
      matches: result.matches.slice(0, 8).map((match) => ({
        kind: match.kind,
        topic_id: match.topicId,
        score: match.score,
      })),
    }
  },
})

registerTool({
  name: 'get_artist_analytics',
  description: 'Summarise streaming stats for the current artist. Never invent numbers.',
  input: z.object({}),
  output: z.object({
    available: z.boolean(),
    total_streams: z.number().optional(),
    latest_period: z.string().nullable().optional(),
    platforms: z.array(z.object({ platform: z.string(), total_streams: z.number() })),
    reason: z.string().optional(),
    source: z.enum(['streaming_stats', 'territory_metrics']).optional(),
  }),
  capabilities: [],
  dataScope: 'self_artist',
  classification: 'read',
  maxResultBytes: 6000,
  timeoutMs: 12_000,
  execute: async (_input, context) => {
    const artistId = requireArtistId(context.actor.artistId)
    const { getStreamingStatsByArtistId, getAggregatedStreamsByPlatform } = await import(
      '@/lib/api/streamingStats'
    )
    const stats = await getStreamingStatsByArtistId(context.actor.serviceDb, artistId)
    if (stats.length > 0) {
      const platforms = getAggregatedStreamsByPlatform(stats)
      return {
        available: true,
        source: 'streaming_stats' as const,
        total_streams: platforms.reduce((sum, row) => sum + row.totalStreams, 0),
        latest_period: stats[0]?.period ?? null,
        platforms: platforms.map((row) => ({ platform: row.platform, total_streams: row.totalStreams })),
      }
    }

    // Some ingest batches have territory facts before monthly streaming_stats
    // materializes. Only read platform, period and streams, never revenue.
    // Page explicitly to avoid silently treating the PostgREST row cap as a total.
    const totals = new Map<string, number>()
    let latestPeriod: string | null = null
    const pageSize = 500
    const maxRows = 25_000
    for (let offset = 0; offset <= maxRows; offset += pageSize) {
      const { data, error } = await context.actor.serviceDb
        .from('artist_territory_metrics')
        .select('platform, period, streams')
        .eq('artist_id', artistId)
        .order('id', { ascending: true })
        .range(offset, offset + pageSize - 1)
      if (error) throw new Error('Streaming territory metrics could not be read.')
      for (const row of data ?? []) {
        totals.set(row.platform, (totals.get(row.platform) ?? 0) + row.streams)
        if (!latestPeriod || row.period > latestPeriod) latestPeriod = row.period
      }
      if ((data?.length ?? 0) < pageSize) break
      if (offset === maxRows) {
        return {
          available: false,
          platforms: [],
          reason: 'Too many streaming rows to calculate an exact total. Ask the label to refresh the monthly stream aggregates.',
        }
      }
    }
    if (totals.size === 0) {
      return { available: false, platforms: [], reason: 'No streaming stats are stored for this artist.' }
    }
    const platforms = [...totals].map(([platform, total_streams]) => ({ platform, total_streams }))
    return {
      available: true,
      source: 'territory_metrics' as const,
      total_streams: platforms.reduce((sum, row) => sum + row.total_streams, 0),
      latest_period: latestPeriod,
      platforms,
    }
  },
})

registerTool({
  name: 'get_artist_statements',
  description: 'List royalty statements visible to the current artist (no file keys).',
  input: z.object({}),
  output: z.object({
    available: z.boolean(),
    statements: z.array(
      z.object({
        period: z.string(),
        status: z.string(),
        amount_eur: z.number().nullable(),
        created_at: z.string(),
      }),
    ),
    reason: z.string().optional(),
  }),
  capabilities: ['admin.panel.full'],
  dataScope: 'admin_finance',
  classification: 'read',
  maxResultBytes: 6000,
  timeoutMs: 8000,
  execute: async (_input, context) => {
    const artistId = requireArtistId(context.actor.artistId)
    const { getSalesStatementsByArtistId } = await import('@/lib/api/salesStatements')
    const rows = await getSalesStatementsByArtistId(context.actor.serviceDb, artistId)
    if (rows.length === 0) {
      return { available: false, statements: [], reason: 'No statements are visible for this artist.' }
    }
    return {
      available: true,
      statements: rows.slice(0, 12).map((row) => ({
        period: row.period,
        status: row.status,
        amount_eur: row.amountEur ?? null,
        created_at: row.createdAt,
      })),
    }
  },
})

registerTool({
  name: 'get_artist_invoices',
  description: 'List invoices for the current artist (numbers and status only).',
  input: z.object({}),
  output: z.object({
    available: z.boolean(),
    invoices: z.array(
      z.object({
        invoice_number: z.string(),
        status: z.string(),
        issued_date: z.string(),
        due_date: z.string(),
      }),
    ),
    reason: z.string().optional(),
  }),
  capabilities: ['admin.panel.full'],
  dataScope: 'admin_finance',
  classification: 'read',
  maxResultBytes: 6000,
  timeoutMs: 8000,
  execute: async (_input, context) => {
    const artistId = requireArtistId(context.actor.artistId)
    const { listArtistInvoices } = await import('@/lib/api/artistInvoices')
    const { invoices } = await listArtistInvoices(context.actor.serviceDb, artistId, 1, 15)
    if (invoices.length === 0) {
      return { available: false, invoices: [], reason: 'No invoices are stored for this artist.' }
    }
    return {
      available: true,
      invoices: invoices.map((row) => ({
        invoice_number: row.artistInvoiceNumber || row.invoiceNumber,
        status: row.status,
        issued_date: row.issuedDate,
        due_date: row.dueDate,
      })),
    }
  },
})

registerTool({
  name: 'get_artist_events',
  description: 'List upcoming concerts for the current artist.',
  input: z.object({}),
  output: z.object({
    available: z.boolean(),
    events: z.array(
      z.object({
        date: z.string(),
        venue: z.string(),
        city: z.string(),
        status: z.string(),
      }),
    ),
    reason: z.string().optional(),
  }),
  capabilities: [],
  dataScope: 'self_artist',
  classification: 'read',
  maxResultBytes: 6000,
  timeoutMs: 8000,
  execute: async (_input, context) => {
    const artistId = requireArtistId(context.actor.artistId)
    const { getConcertsByArtistId } = await import('@/lib/api/concerts')
    const concerts = await getConcertsByArtistId(context.actor.serviceDb, artistId)
    if (concerts.length === 0) {
      return { available: false, events: [], reason: 'No concert dates are stored for this artist.' }
    }
    return {
      available: true,
      events: concerts.slice(0, 15).map((row) => ({
        date: row.concertDate,
        venue: row.venueName ?? '',
        city: row.venueCity ?? '',
        status: row.status,
      })),
    }
  },
})

registerTool({
  name: 'get_artist_tour_overview',
  description: 'List tours for the current artist (name and dates only).',
  input: z.object({}),
  output: z.object({
    available: z.boolean(),
    tours: z.array(
      z.object({
        name: z.string(),
        start_date: z.string().nullable(),
        end_date: z.string().nullable(),
        archived: z.boolean(),
      }),
    ),
    reason: z.string().optional(),
  }),
  capabilities: [],
  dataScope: 'self_artist',
  classification: 'read',
  maxResultBytes: 4000,
  timeoutMs: 8000,
  execute: async (_input, context) => {
    const artistId = requireArtistId(context.actor.artistId)
    const { getToursByArtistId } = await import('@/lib/api/tours')
    const tours = await getToursByArtistId(context.actor.serviceDb, artistId)
    if (tours.length === 0) {
      return { available: false, tours: [], reason: 'No tours are stored for this artist.' }
    }
    return {
      available: true,
      tours: tours.slice(0, 10).map((tour) => ({
        name: tour.name,
        start_date: tour.startDate,
        end_date: tour.endDate,
        archived: tour.archived,
      })),
    }
  },
})

registerTool({
  name: 'get_artist_documents_metadata',
  description: 'List document vault metadata for the current artist. No file paths.',
  input: z.object({}),
  output: z.object({
    available: z.boolean(),
    documents: z.array(
      z.object({
        label: z.string(),
        category: z.string(),
        size_bytes: z.number().nullable(),
        created_at: z.string(),
      }),
    ),
    reason: z.string().optional(),
  }),
  capabilities: ['admin.panel.full'],
  dataScope: 'admin_finance',
  classification: 'read',
  maxResultBytes: 4000,
  timeoutMs: 8000,
  execute: async (_input, context) => {
    const artistId = requireArtistId(context.actor.artistId)
    const { listArtistDocuments } = await import('@/lib/api/artistDocuments')
    const documents = await listArtistDocuments(context.actor.serviceDb, artistId)
    if (documents.length === 0) {
      return { available: false, documents: [], reason: 'The document vault is empty.' }
    }
    return {
      available: true,
      documents: documents.slice(0, 20).map((doc) => ({
        label: doc.label,
        category: doc.category,
        size_bytes: doc.fileSizeBytes ?? null,
        created_at: doc.createdAt,
      })),
    }
  },
})

registerTool({
  name: 'get_portal_feature_availability',
  description: 'Show which portal feature flags are enabled for artists.',
  input: z.object({}),
  output: z.object({ flags: z.record(z.string(), z.boolean()) }),
  capabilities: [],
  dataScope: 'self_artist',
  classification: 'read',
  maxResultBytes: 4000,
  timeoutMs: 5000,
  execute: async (_input, context) => {
    const flags = await getFeatureFlagsForRole(context.actor.serviceDb, 'artist')
    return { flags }
  },
})
