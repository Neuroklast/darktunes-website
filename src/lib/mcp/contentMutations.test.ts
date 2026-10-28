import { describe, expect, it } from 'vitest'
import {
  artistChanges, releaseChanges, eventChanges,
  contentChangePayload, prepareArtistUpdate, prepareReleaseUpdate,
} from './contentMutations'

describe('typed MCP CMS patch security', () => {
  it('rejects empty updates, private artist fields, and publishing changes', () => {
    expect(artistChanges.safeParse({}).success).toBe(false)
    expect(artistChanges.safeParse({ email: 'user@example.com' }).success).toBe(false)
    expect(artistChanges.safeParse({ bandsintown_api_key: 'secret' }).success).toBe(false)
    expect(releaseChanges.safeParse({ is_visible: true }).success).toBe(false)
    expect(eventChanges.safeParse({ status: 'ok' }).success).toBe(false)
  })
  it('accepts bounded public metadata with explicit null clearing', () => {
    expect(artistChanges.safeParse({ website_url: null, genres: ['Techno'] }).success).toBe(true)
    expect(eventChanges.safeParse({ event_time: '20:45', ticket_url: null }).success).toBe(true)
    expect(releaseChanges.safeParse({ release_date: '2026-10-28' }).success).toBe(true)
  })
  it('rejects invalid or dangerous URLs and impossible calendar dates', () => {
    expect(artistChanges.safeParse({ website_url: 'javascript:alert(1)' }).success).toBe(false)
    expect(releaseChanges.safeParse({ release_date: '2026-02-30' }).success).toBe(false)
    expect(eventChanges.safeParse({ concert_date: '2026-13-01' }).success).toBe(false)
  })
  it('requires a real entity identifier and no unknown request fields', () => {
    expect(prepareArtistUpdate.safeParse({ id: 'bogus', changes: { bio: 'new' } }).success).toBe(false)
    expect(prepareReleaseUpdate.safeParse({
      id: '00000000-0000-4000-8000-000000000001',
      changes: { title: 'New' }, escalate: 'admin',
    }).success).toBe(false)
  })
  it('ties the saved payload to a single domain and prevents cross-domain field injection', () => {
    expect(contentChangePayload.safeParse({
      kind: 'release',
      entity_id: '00000000-0000-4000-8000-000000000001',
      expected_updated_at: '2026-10-28T00:00:00Z',
      display_name: 'Test',
      before: { title: 'Before' },
      changes: { title: 'After', status: 'published' },
    }).success).toBe(false)
  })
})
