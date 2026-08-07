/**
 * Central notification emit — all product workflows should call this
 * instead of inserting into notifications directly.
 *
 * Uses the service-role client (bypasses RLS). Writers must not use the user JWT.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/types/database'
import { getCatalogEntry } from './catalog'
import { getUsersWithInAppDisabled } from './preferences'
import { resolveArtistMemberUserIds, resolveStaffUserIds } from './recipients'
import type { EmitNotificationInput, EmitNotificationResult } from './types'

type DbClient = SupabaseClient<Database>

export async function emitNotification(
  db: DbClient,
  input: EmitNotificationInput,
): Promise<EmitNotificationResult> {
  const entry = getCatalogEntry(input.type)
  const entityType = input.entityType ?? entry.defaultEntityType

  let userIds = input.userIds
  if (!userIds) {
    if (entry.audience === 'staff') {
      userIds = await resolveStaffUserIds(db, entry.roles ?? ['admin', 'editor'])
    } else if (entry.audience === 'artist') {
      if (!input.artistId) {
        throw new Error(`emitNotification(${input.type}): artistId is required for artist audience`)
      }
      userIds = await resolveArtistMemberUserIds(db, input.artistId)
    } else {
      throw new Error(
        `emitNotification(${input.type}): userIds is required for audience "user"`,
      )
    }
  }

  const uniqueUserIds = [...new Set(userIds.filter(Boolean))]
  if (uniqueUserIds.length === 0) {
    return { inserted: 0, userIds: [], skippedByPreference: 0 }
  }

  let skippedByPreference = 0
  let recipients = uniqueUserIds
  try {
    const muted = await getUsersWithInAppDisabled(db, uniqueUserIds, input.type)
    if (muted.size > 0) {
      recipients = uniqueUserIds.filter((id) => !muted.has(id))
      skippedByPreference = uniqueUserIds.length - recipients.length
    }
  } catch (err) {
    // Preferences table may be missing on partially migrated envs — fail open
    console.warn('[emitNotification] preference filter skipped:', err)
  }

  if (recipients.length === 0) {
    return { inserted: 0, userIds: uniqueUserIds, skippedByPreference }
  }

  const payload = (input.payload ?? {}) as Json
  const rows = recipients.map((userId) => ({
    user_id: userId,
    artist_id: input.artistId ?? null,
    type: input.type,
    entity_type: entityType,
    entity_id: input.entityId,
    entity_name: input.entityName ?? null,
    sender_id: input.senderId ?? null,
    payload,
    dedupe_key: input.dedupeKey ?? null,
    read: false,
  }))

  const { error, data } = await db.from('notifications').insert(rows).select('id')

  if (error) {
    if (error.code === '23505') {
      return { inserted: 0, userIds: uniqueUserIds, skippedByPreference }
    }
    throw new Error(error.message)
  }

  // Web Push — fire-and-forget; never block in-app insert path.
  // Uses full uniqueUserIds so push can still fire when in_app is off for a user.
  void import('@/lib/push/send')
    .then(({ sendPushForNotification }) =>
      sendPushForNotification(db, {
        type: input.type,
        userIds: uniqueUserIds,
        entityId: input.entityId,
        entityName: input.entityName,
        artistId: input.artistId,
      }),
    )
    .catch((err: unknown) => {
      console.warn('[emitNotification] web push skipped:', err)
    })

  return {
    inserted: data?.length ?? rows.length,
    userIds: uniqueUserIds,
    skippedByPreference,
  }
}
