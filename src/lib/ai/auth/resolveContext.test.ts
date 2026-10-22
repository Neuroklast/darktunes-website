import { describe, expect, it } from 'vitest'
import { resolveAiContext } from '@/lib/ai/auth/resolveContext'
import type { ArtistOption } from '@/lib/api/artistProfiles'

const A: ArtistOption = { id: 'artist-a', name: 'Artist A', slug: 'artist-a' }
const B: ArtistOption = { id: 'artist-b', name: 'Artist B', slug: 'artist-b' }

describe('resolveAiContext', () => {
  it('keeps an artist inside their membership', () => {
    const result = resolveAiContext({
      userId: 'u1',
      role: 'artist',
      dashboard: 'portal',
      requestedArtistId: A.id,
      memberships: [A],
      capabilities: new Set(),
    })
    expect(result).toMatchObject({
      accessContext: 'artist',
      artistId: A.id,
      error: null,
    })
  })

  it('rejects another artist for an artist account', () => {
    const result = resolveAiContext({
      userId: 'u1',
      role: 'artist',
      dashboard: 'portal',
      requestedArtistId: B.id,
      memberships: [A],
      capabilities: new Set(),
    })
    expect(result.error).toMatchObject({ status: 403, code: 'AI_ARTIST_FORBIDDEN' })
    expect(result.artistId).toBeNull()
  })

  it('lets an admin select any existing artist without a membership', () => {
    const result = resolveAiContext({
      userId: 'admin',
      role: 'admin',
      dashboard: 'admin',
      requestedArtistId: B.id,
      memberships: [],
      allArtists: [A, B],
      capabilities: new Set(['admin.panel.full']),
      requestedArtist: B,
    })
    expect(result).toMatchObject({
      accessContext: 'admin',
      artistId: B.id,
      error: null,
    })
    expect(result.availableArtists.map((artist) => artist.id)).toEqual([A.id, B.id])
  })

  it('reports an invalid admin artist selection instead of switching context', () => {
    const result = resolveAiContext({
      userId: 'admin',
      role: 'admin',
      dashboard: 'admin',
      requestedArtistId: B.id,
      memberships: [],
      allArtists: [A],
      capabilities: new Set(['admin.panel.full']),
      requestedArtist: null,
    })
    expect(result.error).toMatchObject({ status: 404, code: 'AI_ARTIST_INVALID' })
  })

  it('restricts an editor without artist management to memberships', () => {
    const result = resolveAiContext({
      userId: 'editor',
      role: 'editor',
      dashboard: 'editor',
      requestedArtistId: B.id,
      memberships: [A],
      capabilities: new Set(['admin.panel.editor']),
    })
    expect(result.error).toMatchObject({ status: 403, code: 'AI_ARTIST_FORBIDDEN' })
  })

  it('allows an editor with cms.artists.manage to inspect an artist', () => {
    const result = resolveAiContext({
      userId: 'editor',
      role: 'editor',
      dashboard: 'editor',
      requestedArtistId: B.id,
      memberships: [],
      allArtists: [A, B],
      capabilities: new Set(['admin.panel.editor', 'cms.artists.manage']),
      requestedArtist: B,
    })
    expect(result).toMatchObject({ accessContext: 'editor', artistId: B.id, error: null })
  })

  it('uses the first portal membership as the default and lists all memberships', () => {
    const result = resolveAiContext({
      userId: 'u1',
      role: 'artist',
      dashboard: 'portal',
      requestedArtistId: null,
      memberships: [A, B],
      capabilities: new Set(),
    })
    expect(result.artistId).toBe(A.id)
    expect(result.availableArtists.map((artist) => artist.id)).toEqual([A.id, B.id])
  })

  it('falls back to the label context for an admin in the portal without a membership', () => {
    const result = resolveAiContext({
      userId: 'admin',
      role: 'admin',
      dashboard: 'portal',
      requestedArtistId: null,
      memberships: [],
      allArtists: [A],
      capabilities: new Set(['admin.panel.full']),
    })
    expect(result).toMatchObject({ accessContext: 'admin', artistId: null, error: null })
  })
})
