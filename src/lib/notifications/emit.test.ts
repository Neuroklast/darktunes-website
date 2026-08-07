import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { emitNotification } from './emit'
import { ALL_NOTIFICATION_EVENT_TYPES, NOTIFICATION_CATALOG } from './catalog'
import { getNotificationHref } from './routing'

vi.mock('@/lib/push/send', () => ({
  sendPushForNotification: vi.fn().mockResolvedValue({ sent: 0, skipped: 0, failed: 0 }),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

function mockDb(opts?: {
  staffIds?: string[]
  memberIds?: string[]
  insertError?: { code?: string; message: string } | null
}) {
  const staffIds = opts?.staffIds ?? ['admin-1', 'editor-1']
  const memberIds = opts?.memberIds ?? ['artist-user-1']
  const insertError = opts?.insertError ?? null
  const inserted: unknown[] = []

  const db = {
    from(table: string) {
      if (table === 'users') {
        return {
          select: () => ({
            in: async () => ({ data: staffIds.map((id) => ({ id })), error: null }),
          }),
        }
      }
      if (table === 'artist_members') {
        return {
          select: () => ({
            eq: async () => ({ data: memberIds.map((user_id) => ({ user_id })), error: null }),
          }),
        }
      }
      if (table === 'notification_preferences') {
        return {
          select: () => ({
            in: () => ({
              eq: () => ({
                eq: async () => ({ data: [], error: null }),
              }),
            }),
          }),
        }
      }
      if (table === 'notifications') {
        return {
          insert(rows: unknown[]) {
            inserted.push(...(Array.isArray(rows) ? rows : [rows]))
            return {
              select: async () =>
                insertError
                  ? { data: null, error: insertError }
                  : {
                      data: (Array.isArray(rows) ? rows : [rows]).map((_, i) => ({
                        id: `n-${i}`,
                      })),
                      error: null,
                    },
            }
          },
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
    _inserted: inserted,
  }

  return db as unknown as Parameters<typeof emitNotification>[0] & { _inserted: unknown[] }
}

describe('NOTIFICATION_CATALOG', () => {
  it('covers every event type with audience and keys', () => {
    for (const type of ALL_NOTIFICATION_EVENT_TYPES) {
      const entry = NOTIFICATION_CATALOG[type]
      expect(
        entry.audience === 'staff' ||
          entry.audience === 'artist' ||
          entry.audience === 'user',
      ).toBe(true)
      expect(entry.summaryKey.length).toBeGreaterThan(0)
      expect(entry.actionKey.length).toBeGreaterThan(0)
      expect(entry.defaultEntityType.length).toBeGreaterThan(0)
      if (entry.audience === 'staff') {
        expect(entry.roles?.length).toBeGreaterThan(0)
      }
    }
  })

  it('resolves href for all staff catalog types', () => {
    for (const type of ALL_NOTIFICATION_EVENT_TYPES) {
      if (NOTIFICATION_CATALOG[type].audience !== 'staff') continue
      expect(getNotificationHref(type, 'admin')).toBeTruthy()
      expect(getNotificationHref(type, 'editor')).toBeTruthy()
    }
  })
})

describe('emitNotification', () => {
  it('inserts one row per staff recipient', async () => {
    const db = mockDb({ staffIds: ['a', 'b'] })
    const result = await emitNotification(db, {
      type: 'artist_release_submission',
      entityId: 'sub-1',
      entityName: 'My EP',
      senderId: 'artist-1',
      dedupeKey: 'artist_release_submission:sub-1',
    })
    expect(result.inserted).toBe(2)
    expect(result.userIds).toEqual(['a', 'b'])
    expect(db._inserted).toHaveLength(2)
    expect(db._inserted[0]).toMatchObject({
      user_id: 'a',
      type: 'artist_release_submission',
      entity_id: 'sub-1',
      dedupe_key: 'artist_release_submission:sub-1',
      read: false,
    })
  })

  it('resolves artist members for artist audience', async () => {
    const db = mockDb({ memberIds: ['u1', 'u2'] })
    const result = await emitNotification(db, {
      type: 'fan_page_review_decision',
      entityId: 'artist-uuid',
      artistId: 'artist-uuid',
      entityName: 'Approved',
      senderId: 'admin-1',
    })
    expect(result.inserted).toBe(2)
    expect(db._inserted[0]).toMatchObject({
      user_id: 'u1',
      artist_id: 'artist-uuid',
      type: 'fan_page_review_decision',
    })
  })

  it('requires artistId for artist audience', async () => {
    const db = mockDb()
    await expect(
      emitNotification(db, {
        type: 'fan_page_review_decision',
        entityId: 'x',
      }),
    ).rejects.toThrow(/artistId/)
  })

  it('treats unique violation as zero inserts', async () => {
    const db = mockDb({
      staffIds: ['a'],
      insertError: { code: '23505', message: 'duplicate' },
    })
    const result = await emitNotification(db, {
      type: 'artist_video_submission',
      entityId: 'v1',
    })
    expect(result.inserted).toBe(0)
  })
})
