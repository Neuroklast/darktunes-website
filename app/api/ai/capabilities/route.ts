/**
 * GET /api/ai/capabilities
 */

import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandler } from '@/lib/errors'
import { requireAiActor } from '@/lib/ai/auth/requireAiActor'
import { getAiSettings } from '@/lib/api/aiSettings'
import { AiProviderRouter } from '@/lib/ai/provider/router'
import { listToolDefinitionsForActor } from '@/lib/ai/tools/registry'
import { FAST_MODEL_ID, REASONING_MODEL_ID } from '@/lib/ai/models/profiles'
import { parseStoredCapabilities } from '@/lib/ai/models/capabilities'
import { searchArtistOptions } from '@/lib/api/artistProfiles'

export const dynamic = 'force-dynamic'

export const GET = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const artistId = req.nextUrl.searchParams.get('artist_id')
  const dashboard = parseDashboard(req.nextUrl.searchParams.get('dashboard'))
  const actor = await requireAiActor(req, { artistId, dashboard, includeArtists: true })
  const settings = await getAiSettings(actor.serviceDb)
  const stored = parseStoredCapabilities(settings.providerCapabilities)
  const router = await AiProviderRouter.create(actor.serviceDb, stored)
  const query = req.nextUrl.searchParams.get('artist_query')?.trim() ?? ''
  const canSearchArtists =
    actor.role === 'admin' || actor.capabilities.has('cms.artists.manage')
  const availableArtists = canSearchArtists && query
    ? await searchArtistOptions(actor.serviceDb, query).catch(() => actor.availableArtists)
    : actor.availableArtists
  const activeArtist =
    actor.availableArtists.find((artist) => artist.id === actor.artistId) ??
    availableArtists.find((artist) => artist.id === actor.artistId) ??
    null

  const mockEnabled = settings.testMode && process.env.NODE_ENV !== 'production'
  return NextResponse.json({
    enabled: (settings.enabled || process.env.AI_ENABLED === 'true') && (router.hasKeyForModel(settings.modelFast) && router.hasKeyForModel(settings.modelReasoning) || mockEnabled),
    provider: settings.provider,
    providers: router.availability,
    verified: [settings.modelFast, settings.modelReasoning].every((model) =>
      stored.health[model]?.ok === true && stored.health[model]?.supports_tools === true && stored.health[model]?.supports_streaming === true),
    streaming: settings.defaultStreaming,
    models: {
      fast: settings.modelFast || FAST_MODEL_ID,
      reasoning: settings.modelReasoning || REASONING_MODEL_ID,
      fallback: settings.fallbackModel || null,
    },
    modes: ['auto', 'fast', 'deep'],
    feature_enabled: settings.featureFlags[actor.accessContext] !== false,
    context: {
      access_context: actor.accessContext,
      dashboard: actor.dashboard,
      artist: activeArtist,
    },
    available_artists: availableArtists,
    tools: listToolDefinitionsForActor(actor).map((tool) => tool.name),
    capabilities: {
      fast: stored.models[settings.modelFast] ?? null,
      reasoning: stored.models[settings.modelReasoning] ?? null,
    },
  })
})

function parseDashboard(value: string | null): 'portal' | 'editor' | 'admin' | undefined {
  if (value === 'portal' || value === 'editor' || value === 'admin') return value
  return undefined
}
