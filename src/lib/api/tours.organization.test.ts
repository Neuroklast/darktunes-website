import { describe, expect, it, vi } from 'vitest'
import { getTourByIdForOrganization, listToursForOrganization } from '@/lib/api/tours'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const ORG_A = '00000000-0000-0000-0000-000000000000'
const ORG_B = '11111111-1111-1111-1111-111111111111'

function makeTourRow(artistId: string) {
  return {
    id: 'tour-1',
    artist_id: artistId,
    name: 'Tour',
    description: null,
    start_date: null,
    end_date: null,
    archived: false,
    sort_order: 0,
    settings: {},
    route_cache: null,
    budget: null,
    tech_documents: [],
    currency: 'EUR',
    total_budget: null,
    created_by: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

describe('tours organization isolation', () => {
  it('getTourByIdForOrganization returns null when artist is in another org', async () => {
    const tourRow = makeTourRow('artist-b')
    const db = {
      from: vi.fn((table: string) => {
        if (table === 'tours') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: tourRow, error: null }),
              }),
            }),
          }
        }
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: 'artist-b', organization_id: ORG_B },
                error: null,
              }),
            }),
          }),
        }
      }),
    } as unknown as SupabaseClient<Database>

    const result = await getTourByIdForOrganization(db, 'tour-1', ORG_A)
    expect(result).toBeNull()
  })

  it('listToursForOrganization queries artists then tours', async () => {
    const from = vi.fn((table: string) => {
      if (table === 'artists') {
        return {
          select: () => ({
            eq: async () => ({ data: [{ id: 'a1' }], error: null }),
          }),
        }
      }
      const chain = {
        select: () => chain,
        in: () => chain,
        eq: () => chain,
        order: async () => ({ data: [makeTourRow('a1')], error: null }),
      }
      return chain
    })
    const db = { from } as unknown as SupabaseClient<Database>
    const tours = await listToursForOrganization(db, ORG_A)
    expect(tours).toHaveLength(1)
    expect(tours[0].artistId).toBe('a1')
    expect(from).toHaveBeenCalledWith('artists')
    expect(from).toHaveBeenCalledWith('tours')
  })
})
