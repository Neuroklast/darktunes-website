/**
 * Narrow CMS patch contract for external AI agents.
 *
 * An external tool may only prepare a proposal. The website approval endpoint
 * revalidates the typed payload, current RBAC and optimistic row version before
 * applying changes. Never extend these schemas with private columns or status.
 */
import { z } from 'zod'
import type { AiActor } from '@/lib/ai/auth/requireAiActor'
import { ApiError } from '@/lib/errors'
import { createActionConfirmation } from '@/lib/ai/actions/confirmations'
import { sanitizeArtistWrite, sanitizeReleaseWrite } from '@/lib/sanitizeTextContent'
import { createEditorActivityLogEntry } from '@/lib/api/editorActivityLog'
import type { Json } from '@/types/database'
import type { SystemCapability } from '@/lib/rbac/types'

const id = z.string().uuid()
const link = z.string().url().max(1000).refine(value =>
  value.startsWith('https://') || value.startsWith('http://'),
  'Only HTTP(S) links are supported',
).nullable()
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(value + 'T00:00:00Z')
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value
}, 'Invalid calendar date')
const meaningfulChanges = <T extends z.ZodRawShape>(shape: T) =>
  z.object(shape).strict().refine(changes => Object.keys(changes).length > 0, 'At least one field must change')

export const artistChanges = meaningfulChanges({
  bio: z.string().trim().max(7000).nullable().optional(),
  genres: z.array(z.string().trim().min(1).max(80)).max(15).optional(),
  website_url: link.optional(),
  spotify_url: link.optional(),
  instagram_url: link.optional(),
})
export const releaseChanges = meaningfulChanges({
  title: z.string().trim().min(1).max(180).optional(),
  release_date: date.optional(),
  cover_art: link.optional(),
  spotify_url: link.optional(),
  apple_music_url: link.optional(),
  youtube_url: link.optional(),
  bandcamp_url: link.optional(),
  catalog_number: z.string().trim().max(80).nullable().optional(),
})
export const eventChanges = meaningfulChanges({
  event_name: z.string().trim().min(3).max(180).optional(),
  concert_date: date.optional(),
  event_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  venue_name: z.string().trim().max(180).nullable().optional(),
  venue_city: z.string().trim().max(120).nullable().optional(),
  venue_country: z.string().trim().max(120).nullable().optional(),
  ticket_url: link.optional(),
})

export const prepareArtistUpdate = z.object({ id, changes: artistChanges }).strict()
export const prepareReleaseUpdate = z.object({ id, changes: releaseChanges }).strict()
export const prepareEventUpdate = z.object({ id, changes: eventChanges }).strict()

const baseSnapshot = {
  entity_id: id,
  expected_updated_at: z.string().min(1).max(100),
  display_name: z.string().max(180),
  before: z.record(z.string(), z.unknown()),
}
export const contentChangePayload = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('artist'), ...baseSnapshot, changes: artistChanges }).strict(),
  z.object({ kind: z.literal('release'), ...baseSnapshot, changes: releaseChanges }).strict(),
  z.object({ kind: z.literal('event'), ...baseSnapshot, changes: eventChanges }).strict(),
])
export type ContentKind = 'artist' | 'release' | 'event'
export type ContentChangePayload = z.infer<typeof contentChangePayload>

export const contentCapability: Record<ContentKind, SystemCapability> = {
  artist: 'cms.artists.manage',
  release: 'cms.releases.manage',
  event: 'admin.panel.full',
}
export const approvalAction: Record<ContentKind, 'update_cms_artist' | 'update_cms_release' | 'update_cms_event'> = {
  artist: 'update_cms_artist',
  release: 'update_cms_release',
  event: 'update_cms_event',
}

/** A safe, non-PII snapshot limited to exactly the proposed fields. */
export async function prepareContentUpdate(
  actor: AiActor, kind: ContentKind, input: { id: string; changes: Record<string, unknown> },
) {
  if ((actor.role !== 'admin' && actor.role !== 'editor') ||
      !actor.capabilities.has(contentCapability[kind])) {
    throw new ApiError(403, 'Your account cannot edit this content.', 'FORBIDDEN')
  }
  const db = actor.serviceDb
  let row: Record<string, unknown> | null = null
  if (kind === 'artist') {
    const { data, error } = await db.from('artists')
      .select('id,name,updated_at,bio,genres,website_url,spotify_url,instagram_url')
      .eq('id', input.id).maybeSingle()
    if (error) throw error
    row = data
  } else if (kind === 'release') {
    const { data, error } = await db.from('releases')
      .select('id,title,updated_at,release_date,cover_art,spotify_url,apple_music_url,youtube_url,bandcamp_url,catalog_number')
      .eq('id', input.id).maybeSingle()
    if (error) throw error
    row = data
  } else {
    const { data, error } = await db.from('concerts')
      .select('id,event_name,updated_at,concert_date,event_time,venue_name,venue_city,venue_country,ticket_url')
      .eq('id', input.id).maybeSingle()
    if (error) throw error
    row = data
  }
  if (!row) throw new ApiError(404, 'The selected CMS record does not exist.', 'NOT_FOUND')
  const before: Record<string, unknown> = {}
  for (const key of Object.keys(input.changes)) {
    if (!Object.prototype.hasOwnProperty.call(row, key)) {
      throw new ApiError(400, 'Unrecognized CMS field.', 'VALIDATION_ERROR')
    }
    before[key] = row[key]
  }
  const payload: ContentChangePayload = {
    kind, entity_id: input.id,
    expected_updated_at: String(row.updated_at),
    display_name: String(row.name ?? row.title ?? row.event_name ?? input.id),
    before, changes: input.changes,
  } as ContentChangePayload
  // Verify the exact payload saved into the 10-minute one-time approval token.
  const valid = contentChangePayload.parse(payload)
  const preview = await createActionConfirmation(db, {
    actor, action: approvalAction[kind], payload: valid,
    summary: 'Review ' + kind + ' update: ' + valid.display_name,
  })
  const origin = (process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/$/, '')
  return {
    needs_confirmation: true as const,
    approval_url: origin + '/admin/mcp-approvals/' + encodeURIComponent(preview.confirmation_token),
    expires_at: preview.expires_at,
    summary: preview.summary,
  }
}

/**
 * Single-record compare-and-swap. Expected updated_at is generated by the server
 * at preparation time and checked atomically by PostgreSQL on UPDATE.
 */
export async function executeContentUpdate(actor: AiActor, raw: unknown) {
  const result = contentChangePayload.safeParse(raw)
  if (!result.success) throw new ApiError(400, 'The pending CMS change is invalid.', 'VALIDATION_ERROR')
  const value = result.data
  if ((actor.role !== 'admin' && actor.role !== 'editor') ||
      !actor.capabilities.has(contentCapability[value.kind])) {
    throw new ApiError(403, 'Your account can no longer edit this content.', 'FORBIDDEN')
  }
  const db = actor.serviceDb
  const now = new Date().toISOString()
  let written: { id: string } | null = null
  if (value.kind === 'artist') {
    const patch = sanitizeArtistWrite({ ...value.changes, updated_at: now })
    const { data, error } = await db.from('artists').update(patch)
      .eq('id', value.entity_id).eq('updated_at', value.expected_updated_at)
      .select('id').maybeSingle()
    if (error) throw error
    written = data
  } else if (value.kind === 'release') {
    const patch = sanitizeReleaseWrite({ ...value.changes, updated_at: now })
    const { data, error } = await db.from('releases').update(patch)
      .eq('id', value.entity_id).eq('updated_at', value.expected_updated_at)
      .select('id').maybeSingle()
    if (error) throw error
    written = data
  } else {
    const { data, error } = await db.from('concerts').update({ ...value.changes, updated_at: now })
      .eq('id', value.entity_id).eq('updated_at', value.expected_updated_at)
      .select('id').maybeSingle()
    if (error) throw error
    written = data
  }
  if (!written) throw new ApiError(409, 'The CMS entry changed after preview. Prepare a fresh update.', 'CONFLICT')
  // A durable audit record is attempted after the CAS. Audit failure is
  // flagged explicitly: it must not make callers retry an already applied edit.
  let logged = true
  try {
    await createEditorActivityLogEntry(db, {
      editor_id: actor.userId,
      action: 'update',
      entity_type: value.kind === 'event' ? 'concert' : value.kind,
      entity_id: value.entity_id,
      entity_name: value.display_name,
      changes: JSON.parse(JSON.stringify({
        source: 'mcp', before: value.before, after: value.changes,
        expected_updated_at: value.expected_updated_at,
      })) as Json,
    })
  } catch (error) {
    logged = false
    console.error('[mcp] content updated but audit write failed', error)
  }
  const path = value.kind === 'artist'
    ? '/admin/artists/' + value.entity_id + '/edit'
    : value.kind === 'release' ? '/admin/releases' : '/admin/events'
  return {
    ok: true as const, location: path,
    detail: 'The ' + value.kind + ' record was updated.' +
      (logged ? '' : ' The audit log could not be recorded; contact the administrator.'),
  }
}
