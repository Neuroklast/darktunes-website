import { beforeEach, describe, expect, it, vi } from 'vitest'
import '@/lib/ai/tools'
import { executeRegisteredTool } from '@/lib/ai/tools/registry'
import { getStreamingStatsByArtistId } from '@/lib/api/streamingStats'
import type { AiActor } from '@/lib/ai/auth/requireAiActor'

vi.mock('@/lib/api/streamingStats', () => ({
  getStreamingStatsByArtistId: vi.fn(async () => []),
  getAggregatedStreamsByPlatform: (stats: Array<{ platform: string; streams: number }>) => {
    const totals = new Map<string, number>()
    for (const row of stats) totals.set(row.platform, (totals.get(row.platform) ?? 0) + row.streams)
    return [...totals].map(([platform, totalStreams]) => ({ platform, totalStreams }))
  },
}))

describe('artist analytics tool isolation', () => {
  beforeEach(() => {
    vi.mocked(getStreamingStatsByArtistId).mockReset()
    vi.mocked(getStreamingStatsByArtistId).mockResolvedValue([])
  })

  it('reads only stream columns for the authenticated artist when monthly data is empty', async () => {
    const selectedColumns: string[] = []
    const artistFilters: string[] = []
    const rows = [
      { platform: 'Spotify', period: '2026-07', streams: 10 },
      { platform: 'Spotify', period: '2026-08', streams: 5 },
      { platform: 'Apple Music', period: '2026-08', streams: 3 },
    ]
    const db = {
      from: (table: string) => {
        if (table === 'ai_tool_executions') return { insert: async () => ({ error: null }) }
        if (table !== 'artist_territory_metrics') throw new Error('Unexpected table: ' + table)
        return {
          select: (columns: string) => {
            selectedColumns.push(columns)
            return {
              eq: (field: string, value: string) => {
                expect(field).toBe('artist_id')
                artistFilters.push(value)
                return {
                  order: () => ({
                    range: async (start: number) => ({
                      data: value === 'artist-a' && start === 0 ? rows : [],
                      error: null,
                    }),
                  }),
                }
              },
            }
          },
        }
      },
    }
    const actor = {
      userId: 'user-a',
      role: 'artist',
      dashboard: 'portal',
      accessContext: 'artist',
      artistId: 'artist-a',
      artistMembershipIds: ['artist-a'],
      capabilities: new Set(),
      availableArtists: [{ id: 'artist-a', slug: 'artist-a', name: 'Artist A' }],
      serviceDb: db as unknown as AiActor['serviceDb'],
      userDb: {} as AiActor['userDb'],
    } satisfies AiActor

    const result = await executeRegisteredTool(
      'get_artist_analytics', {}, { actor, requestId: 'own-streams' },
    )
    expect(result).toMatchObject({
      ok: true,
      result: {
        available: true,
        source: 'territory_metrics',
        total_streams: 18,
        latest_period: '2026-08',
        platforms: [
          { platform: 'Spotify', total_streams: 15 },
          { platform: 'Apple Music', total_streams: 3 },
        ],
      },
    })
    expect(selectedColumns).toEqual(['platform, period, streams'])
    expect(artistFilters).toEqual(['artist-a'])
    expect(getStreamingStatsByArtistId).toHaveBeenCalledWith(db, 'artist-a')
  })

  it('prefers monthly streaming stats without querying financial or territory rows', async () => {
    vi.mocked(getStreamingStatsByArtistId).mockResolvedValue([
      { id: '1', artistId: 'artist-a', platform: 'Spotify', period: '2026-08', streams: 8, createdAt: '' },
    ])
    const db = {
      from: (table: string) => {
        if (table === 'ai_tool_executions') return { insert: async () => ({ error: null }) }
        throw new Error('Unexpected financial or territory table: ' + table)
      },
    }
    const actor = {
      userId: 'user-a',
      role: 'artist',
      dashboard: 'portal',
      accessContext: 'artist',
      artistId: 'artist-a',
      artistMembershipIds: ['artist-a'],
      capabilities: new Set(),
      availableArtists: [],
      serviceDb: db as unknown as AiActor['serviceDb'],
      userDb: {} as AiActor['userDb'],
    } satisfies AiActor
    const result = await executeRegisteredTool('get_artist_analytics', {}, { actor, requestId: 'monthly-streams' })
    expect(result).toMatchObject({
      ok: true,
      result: { available: true, source: 'streaming_stats', total_streams: 8 },
    })
  })
})
