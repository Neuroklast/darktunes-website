import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createActionConfirmation, consumeActionConfirmation } from '@/lib/ai/actions/confirmations'
import { ApiError } from '@/lib/errors'
import type { AiActor } from '@/lib/ai/auth/requireAiActor'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const actor = {
  userId: 'user-1',
  role: 'artist',
  accessContext: 'artist',
  dashboard: 'portal',
  artistId: 'artist-1',
  artistMembershipIds: ['artist-1'],
  capabilities: new Set<string>(),
  availableArtists: [{ id: 'artist-1', name: 'Artist 1', slug: 'artist-1' }],
  serviceDb: {} as AiActor['serviceDb'],
  userDb: {} as AiActor['userDb'],
} satisfies AiActor

describe('action confirmations', () => {
  it('should store a hashed token and reject a used confirmation', async () => {
    const rows: Array<Record<string, unknown>> = []
    const db = {
      from: () => ({
        insert: async (row: Record<string, unknown>) => {
          rows.push({ ...row, id: 'conf-1', used_at: null })
          return { error: null }
        },
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
          }),
        }),
        update: () => ({
          eq: () => ({
            is: () => ({
              select: async () => {
                if (rows[0]) rows[0].used_at = new Date().toISOString()
                return { data: [{ id: 'conf-1' }], error: null }
              },
            }),
          }),
        }),
      }),
    } as unknown as SupabaseClient<Database>

    const preview = await createActionConfirmation(db, {
      actor,
      action: 'save_epk_text',
      payload: { text: 'A prepared bio that is long enough.' },
      summary: 'Save bio',
    })
    expect(preview.confirmation_token.startsWith('act_')).toBe(true)
    expect(JSON.stringify(rows[0])).not.toContain(preview.confirmation_token)

    const payload = await consumeActionConfirmation(db, {
      actor,
      token: preview.confirmation_token,
      action: 'save_epk_text',
    })
    expect(payload.text).toBe('A prepared bio that is long enough.')
  })

  it('should reject an expired confirmation', async () => {
    const db = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: 'x',
                user_id: 'user-1',
                artist_id: 'artist-1',
                action: 'save_epk_text',
                payload: { text: 'old' },
                payload_hash: 'nope',
                used_at: null,
                expires_at: '2000-01-01T00:00:00.000Z',
              },
              error: null,
            }),
          }),
        }),
      }),
    } as unknown as SupabaseClient<Database>

    await expect(
      consumeActionConfirmation(db, { actor, token: 'act_dead', action: 'save_epk_text' }),
    ).rejects.toMatchObject({ code: 'AI_CONFIRMATION_EXPIRED' } satisfies Partial<ApiError>)
  })

  it('should reject a confirmation another request already used', async () => {
    const payload = { text: 'A prepared bio that is long enough.' }
    const payloadHash = createHash('sha256')
      .update(JSON.stringify(payload, Object.keys(payload).sort()))
      .digest('hex')
    const db = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: 'x',
                user_id: 'user-1',
                artist_id: 'artist-1',
                action: 'save_epk_text',
                payload,
                payload_hash: payloadHash,
                used_at: null,
                expires_at: '2099-01-01T00:00:00.000Z',
              },
              error: null,
            }),
          }),
        }),
        update: () => ({
          eq: () => ({
            is: () => ({
              select: async () => ({ data: [], error: null }),
            }),
          }),
        }),
      }),
    } as unknown as SupabaseClient<Database>

    await expect(
      consumeActionConfirmation(db, { actor, token: 'act_race', action: 'save_epk_text' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' } satisfies Partial<ApiError>)
  })
})
