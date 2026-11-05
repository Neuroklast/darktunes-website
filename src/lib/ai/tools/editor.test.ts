import { describe, expect, it, vi } from 'vitest'
import '@/lib/ai/tools'
import { getRegisteredTool, listToolDefinitionsForActor } from '@/lib/ai/tools/registry'
import type { AiActor } from '@/lib/ai/auth/requireAiActor'
import type { Capability } from '@/lib/rbac/types'

function actor(db: unknown, role: 'editor' | 'artist' = 'editor'): AiActor {
  return {
    userId: 'test-user',
    role,
    accessContext: role,
    dashboard: role === 'editor' ? 'editor' : 'portal',
    artistId: null,
    artistMembershipIds: [],
    availableArtists: [],
    capabilities: new Set<Capability>(role === 'editor' ? ['admin.panel.editor'] : []),
    serviceDb: db as AiActor['serviceDb'],
    userDb: db as AiActor['userDb'],
  }
}

function chain(data: unknown[], selected: string[]) {
  const builder = {
    select: vi.fn((columns: string) => { selected.push(columns); return builder }),
    eq: vi.fn(() => builder),
    ilike: vi.fn(() => builder),
    in: vi.fn(() => builder),
    lte: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(async () => ({ data, error: null })),
  }
  return builder
}

describe('editor assistant catalog', () => {
  it('offers catalog tools only to editorial roles', () => {
    const db = {}
    const editorNames = listToolDefinitionsForActor(actor(db)).map((tool) => tool.name)
    const artistNames = listToolDefinitionsForActor(actor(db, 'artist')).map((tool) => tool.name)
    for (const name of ['search_editorial_artists', 'get_editorial_artist_releases', 'search_editorial_news']) {
      expect(editorNames).toContain(name)
      expect(artistNames).not.toContain(name)
    }
    expect(editorNames).not.toContain('get_label_analytics')
    expect(editorNames).not.toContain('get_artist_statements')
  })

  it('searches only visible artists using an explicit public projection', async () => {
    const selected: string[] = []
    const builder = chain([{
      id: 'artist-1', name: 'Frozen Plasma', slug: 'frozen-plasma', bio: 'Biography',
      genres: ['Electronic'], website_url: 'https://example.com',
      spotify_url: null, apple_music_url: null, instagram_url: null,
    }], selected)
    const direct = chain([], selected)
    const credits = chain([], selected)
    const db = { from: vi.fn((table: string) => {
      if (table === 'artists') return builder
      if (table === 'releases') return direct
      if (table === 'release_artists') return credits
      throw new Error('Unexpected table')
    }) }
    const tool = getRegisteredTool('search_editorial_artists')
    expect(tool).toBeDefined()
    const result = await tool!.execute({ query: 'Frozen Plasma' }, { actor: actor(db), requestId: 'test' })
    expect(builder.eq).toHaveBeenCalledWith('is_visible', true)
    expect(builder.ilike).toHaveBeenCalledWith('name', '%Frozen Plasma%')
    expect(result).toMatchObject({ matches: [{ name: 'Frozen Plasma', slug: 'frozen-plasma' }] })
    expect(selected[0]).not.toContain('*')
    expect(selected[0]).not.toMatch(/email|notes|revenue|api_key/)
  })

  it('gets complete cleaned artist background and fresh releases in one profile lookup', async () => {
    const selected: string[] = []
    const html = `<p style="${'x'.repeat(1100)}">NEUROKLAST makes Hard Techno &amp; industrial bass.</p><p>2026 is the current era.</p>`
    const artistRow = {
      id: 'artist-1', name: 'NEUROKLAST', slug: 'neuroklast', bio: html,
      genres: ['Techno'], website_url: null, spotify_url: null,
      apple_music_url: null, instagram_url: null,
    }
    const release = (id: string, title: string, date: string) => ({
      id, title, release_date: date, type: 'single', spotify_url: null,
      apple_music_url: null, youtube_url: null, bandcamp_url: null, smartlink_url: null,
    })
    const artists = chain([artistRow], selected)
    const direct = chain([release('release-1', 'Recent 2026', '2026-10-01')], selected)
    const credits = chain([{ release_id: 'release-2' }], selected)
    const linked = chain([release('release-2', 'Older 2025', '2025-09-19')], selected)
    let releaseCalls = 0
    const db = { from: vi.fn((table: string) => {
      if (table === 'artists') return artists
      if (table === 'release_artists') return credits
      if (table === 'releases') return ++releaseCalls === 1 ? direct : linked
      throw new Error('Unexpected table')
    }) }
    const tool = getRegisteredTool('search_editorial_artists')
    const result = await tool!.execute({ query: 'NEUROKLAST' }, { actor: actor(db), requestId: 'test' })
    expect(result).toMatchObject({
      matches: [{
        name: 'NEUROKLAST',
        bio: 'NEUROKLAST makes Hard Techno & industrial bass.\\n2026 is the current era.',
        latest_releases: [
          { title: 'Recent 2026', release_date: '2026-10-01' },
          { title: 'Older 2025', release_date: '2025-09-19' },
        ],
      }],
    })
    expect(JSON.stringify(result)).not.toContain('<p')
    expect(direct.eq).toHaveBeenCalledWith('is_visible', true)
    expect(linked.eq).toHaveBeenCalledWith('is_promo', false)
    expect(direct.lte).toHaveBeenCalledWith('release_date', expect.any(String))
    expect(linked.lte).toHaveBeenCalledWith('release_date', expect.any(String))
    expect(selected.every((columns) => !columns.includes('*'))).toBe(true)
    expect(JSON.stringify(result)).not.toMatch(/revenue|notes|invoice|artist_id/)
  })

  it('does not load releases for ambiguous multi-artist matches', async () => {
    const selected: string[] = []
    const artists = chain([
      { id: 'a', name: 'Neo One', slug: 'neo-one', bio: null, genres: [] },
      { id: 'b', name: 'Neo Two', slug: 'neo-two', bio: null, genres: [] },
    ], selected)
    const db = { from: vi.fn(() => artists) }
    const tool = getRegisteredTool('search_editorial_artists')
    const result = await tool!.execute({ query: 'Neo' }, { actor: actor(db), requestId: 'test' })
    expect(result).toMatchObject({
      matches: [{ latest_releases: [] }, { latest_releases: [] }],
    })
    expect(db.from).toHaveBeenCalledTimes(1)
  })

  it('excludes future and press-only news using server-side filters', async () => {
    const selected: string[] = []
    const builder = chain([{ title: 'Release update', slug: 'release-update', excerpt: 'Public', published_at: '2026-11-01T00:00:00Z' }], selected)
    const db = { from: vi.fn(() => builder) }
    const tool = getRegisteredTool('search_editorial_news')
    const result = await tool!.execute({ query: 'Release' }, { actor: actor(db), requestId: 'test' })
    expect(builder.in).toHaveBeenCalledWith('status', ['published', 'scheduled'])
    expect(builder.eq).toHaveBeenCalledWith('is_press_only', false)
    expect(builder.lte).toHaveBeenCalledWith('published_at', expect.any(String))
    expect(result).toMatchObject({ items: [{ title: 'Release update' }] })
    expect(selected[0]).not.toContain('*')
  })

  it('merges legacy and credited releases and returns no private fields', async () => {
    const selected: string[] = []
    const publicRelease = (id: string, title: string, date: string) => ({
      id, title, release_date: date, type: 'single', artist_id: 'artist-1',
      spotify_url: null, apple_music_url: null, youtube_url: null,
      bandcamp_url: null, smartlink_url: null,
    })
    const builders = {
      artists: chain([{ id: 'artist-1', name: 'Extize' }], selected),
      releasesDirect: chain([publicRelease('release-1', 'Old', '2025-01-01')], selected),
      release_artists: chain([{ release_id: 'release-2' }], selected),
      releasesLinked: chain([publicRelease('release-2', 'Newest', '2026-11-01')], selected),
    }
    let releaseCalls = 0
    const db = { from: vi.fn((table: string) => {
      if (table === 'artists') return builders.artists
      if (table === 'release_artists') return builders.release_artists
      if (table === 'releases') return ++releaseCalls === 1 ? builders.releasesDirect : builders.releasesLinked
      throw new Error('Unexpected table')
    }) }
    const tool = getRegisteredTool('get_editorial_artist_releases')
    const result = await tool!.execute({ artist: 'Extize' }, { actor: actor(db), requestId: 'test' })
    expect(result).toMatchObject({ artist: 'Extize', releases: [{ title: 'Newest' }, { title: 'Old' }] })
    expect(builders.releasesDirect.eq).toHaveBeenCalledWith('is_visible', true)
    expect(builders.releasesLinked.eq).toHaveBeenCalledWith('is_visible', true)
    expect(builders.releasesDirect.eq).toHaveBeenCalledWith('is_promo', false)
    expect(builders.releasesLinked.eq).toHaveBeenCalledWith('is_promo', false)
    expect(builders.releasesDirect.lte).toHaveBeenCalledWith('release_date', expect.any(String))
    expect(builders.releasesLinked.lte).toHaveBeenCalledWith('release_date', expect.any(String))
    expect(selected.every((columns) => !columns.includes('*'))).toBe(true)
    expect(JSON.stringify(result)).not.toMatch(/revenue|notes|invoice|artist_id/)
  })
})
