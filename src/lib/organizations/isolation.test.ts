import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_ORGANIZATION_ID } from '@/lib/organizations/constants'
import { resolveOrganizationSlugFromHost } from '@/lib/organizations/resolveFromHost'
import { getPublicArtists } from '@/lib/api/publicArtist'
import { resolvePortalArtist } from '@/lib/api/artistProfiles'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const ORG_A = DEFAULT_ORGANIZATION_ID
const ORG_B = '11111111-1111-1111-1111-111111111111'

type DbClient = SupabaseClient<Database>

function mockFromChain(result: { data: unknown; error: null | { message: string; code?: string } }) {
  const chain: Record<string, unknown> = {}
  const self = new Proxy(chain, {
    get(_t, prop: string) {
      if (prop === 'then') return undefined
      if (prop === 'maybeSingle' || prop === 'single') {
        return () => Promise.resolve(result)
      }
      return (..._args: unknown[]) => self
    },
  })
  return self
}

describe('tenant isolation (unit)', () => {
  it('maps apex hosts to Org #0 and subdomains to slug tenants', () => {
    expect(resolveOrganizationSlugFromHost('darktunes.com').organizationSlug).toBe('darktunes')
    expect(resolveOrganizationSlugFromHost('demo-label.darktunes.app').organizationSlug).toBe(
      'demo-label',
    )
    expect(resolveOrganizationSlugFromHost('demo-label.darktunes.app').surface).toBe('tenant')
  })

  it('getPublicArtists filters by organization_id', async () => {
    const eq = vi.fn().mockReturnThis()
    const select = vi.fn().mockReturnThis()
    const order = vi.fn().mockReturnThis()
    const limit = vi.fn().mockResolvedValue({ data: [], error: null })
    const from = vi.fn().mockReturnValue({ select, eq, order, limit })
    // chain: select → eq → eq → order → order → limit
    select.mockReturnValue({ eq })
    eq.mockImplementation(() => ({ eq, order, limit }))
    order.mockImplementation(() => ({ order, limit }))

    const db = { from } as unknown as DbClient
    await getPublicArtists(db, ORG_B)

    expect(from).toHaveBeenCalledWith('artists')
    expect(eq).toHaveBeenCalledWith('organization_id', ORG_B)
  })

  it('resolvePortalArtist rejects membership when artist is in another org', async () => {
    let call = 0
    const db = {
      from: vi.fn((table: string) => {
        if (table === 'artist_members') {
          return mockFromChain({
            data: { artist_id: 'artist-b' },
            error: null,
          })
        }
        // artists: maybeSingle returns null (not in org)
        call++
        return mockFromChain({ data: null, error: null })
      }),
    } as unknown as DbClient

    await expect(resolvePortalArtist(db, 'user-1', 'artist-b', ORG_A)).rejects.toThrow(
      /FORBIDDEN: artist not in this organization/,
    )
    expect(call).toBeGreaterThan(0)
  })

  it('resolvePortalArtist returns artist when membership and org match', async () => {
    const artistRow = {
      id: 'artist-a',
      organization_id: ORG_A,
      name: 'Band A',
      slug: 'band-a',
      bio: null,
      genres: [],
      image_url: null,
      spotify_url: null,
      apple_music_url: null,
      instagram_url: null,
      youtube_url: null,
      website_url: null,
      featured: false,
      country: null,
      founding_year: null,
      hometown: null,
      email: null,
      vat_number: null,
      is_eu_non_german: false,
      notes: null,
      spotify_id: null,
      discogs_id: null,
      songkick_id: null,
      bandsintown_id: null,
      last_synced_at: null,
      user_id: null,
      facebook_url: null,
      twitter_url: null,
      tiktok_url: null,
      bandcamp_url: null,
      shop_url: null,
      soundcloud_url: null,
      is_visible: true,
      logo_url: null,
      platform_links: null,
      storage_quota_bytes: null,
      smart_links: null,
      bandsintown_api_key: null,
      lastfm_name: null,
      soundcharts_id: null,
      image_position_x: null,
      image_position_y: null,
      image_scale: null,
      landing_publish_trusted: false,
      portal_terms_version: null,
      portal_terms_accepted_at: null,
      portal_terms_accepted_by: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }

    const db = {
      from: vi.fn((table: string) => {
        if (table === 'artist_members') {
          return mockFromChain({ data: { artist_id: 'artist-a' }, error: null })
        }
        return mockFromChain({ data: artistRow, error: null })
      }),
    } as unknown as DbClient

    const artist = await resolvePortalArtist(db, 'user-1', 'artist-a', ORG_A)
    expect(artist?.id).toBe('artist-a')
    expect(artist?.slug).toBe('band-a')
  })
})
