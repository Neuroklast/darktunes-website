import { z } from 'zod'
import type { AiActor } from '@/lib/ai/auth/requireAiActor'
import type { SupabaseClient } from '@supabase/supabase-js'

const definitions = {
  news_posts: ['title', 'excerpt', 'content'],
  artists: ['name', 'bio', 'spotify_url', 'instagram_url', 'website_url'],
  releases: ['title', 'spotify_url', 'apple_music_url', 'youtube_url', 'bandcamp_url', 'smartlink_url'],
  concerts: ['event_name', 'venue_name', 'venue_city', 'venue_country', 'ticket_url'],
} as const
export type EditorialCollection = keyof typeof definitions
const collectionNames = Object.keys(definitions) as EditorialCollection[]
const common = { collection: { type: 'string', enum: collectionNames } }
const uuid = z.string().uuid()

function requireEditor(actor: AiActor) {
  if (actor.role !== 'admin' || !actor.capabilities.has('admin.panel.full')) {
    throw new Error('Only a darkTunes administrator may access editorial MCP tools.')
  }
}
function tableName(value: unknown): EditorialCollection {
  if (typeof value !== 'string' || !Object.hasOwn(definitions, value)) throw new Error('Unsupported collection.')
  return value as EditorialCollection
}
function dbFor(actor: AiActor): SupabaseClient {
  // Only ever reached after OAuth and server-side RBAC checks; new table is not
  // part of the generated Database schema until the next types generation.
  return actor.serviceDb as unknown as SupabaseClient
}
function fields(collection: EditorialCollection) {
  return ['id', 'updated_at', ...definitions[collection]]
}
export function parseUpdate(collection: EditorialCollection, raw: unknown) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('changes must be an object.')
  const input = raw as Record<string, unknown>
  const allowed = new Set<string>(definitions[collection])
  if (!Object.keys(input).length || Object.keys(input).length > 8) throw new Error('Provide between one and eight changed fields.')
  const changes: Record<string, string> = {}
  for (const [key, value] of Object.entries(input)) {
    if (!allowed.has(key) || typeof value !== 'string' || !value.trim() || value.length > 8000) {
      throw new Error('Invalid or disallowed editorial field: ' + key)
    }
    if (key.endsWith('_url')) {
      try {
        const parsed = new URL(value)
        if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) throw new Error('Bad URL')
      } catch { throw new Error('Links must be valid HTTPS URLs without credentials.') }
    }
    if (key === 'content' && /[<>]/.test(value)) throw new Error('Only plain-text news content is accepted over MCP.')
    changes[key] = value.trim()
  }
  return changes
}
export const editorialTools = [
  { name: 'editorial_collections', description: 'List editorial collections and safe editable fields. Admin only.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true } },
  { name: 'editorial_list', description: 'List up to 30 editorial records in a collection. Admin only; no private contact, financial or security fields.',
    inputSchema: { type: 'object', properties: { ...common, limit: { type: 'integer', minimum: 1, maximum: 30 }, offset: { type: 'integer', minimum: 0, maximum: 5000 } }, required: ['collection'], additionalProperties: false },
    annotations: { readOnlyHint: true } },
  { name: 'editorial_get', description: 'Read one editorial record and its last update date.',
    inputSchema: { type: 'object', properties: { ...common, id: { type: 'string', format: 'uuid' } }, required: ['collection', 'id'], additionalProperties: false },
    annotations: { readOnlyHint: true } },
  { name: 'editorial_propose_update', description: 'Queue an editorial edit for separate admin MFA approval. Does NOT change live content.',
    inputSchema: { type: 'object', properties: { ...common, id: { type: 'string', format: 'uuid' }, changes: { type: 'object', additionalProperties: true } }, required: ['collection', 'id', 'changes'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false } },
  { name: 'editorial_my_requests', description: 'Show status of your last 30 editorial proposals.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true } },
] as const

export async function callEditorial(name: string, args: Record<string, unknown>, actor: AiActor) {
  requireEditor(actor)
  if (name === 'editorial_collections') return { collections: definitions }
  const db = dbFor(actor)
  if (name === 'editorial_my_requests') {
    const { data, error } = await db.from('mcp_editorial_requests')
      .select('id,collection,target_id,changes,status,created_at,reviewed_at')
      .eq('user_id', actor.userId).order('created_at', { ascending: false }).limit(30)
    if (error) throw new Error('Unable to read proposals.')
    return { requests: data }
  }
  const collection = tableName(args.collection)
  const id = uuid.safeParse(args.id)
  if (name === 'editorial_list') {
    const limit = args.limit === undefined ? 20 : Number(args.limit)
    const offset = args.offset === undefined ? 0 : Number(args.offset)
    if (!Number.isInteger(limit) || limit < 1 || limit > 30 || !Number.isInteger(offset) || offset < 0 || offset > 5000) throw new Error('Invalid pagination.')
    const { data, error } = await db.from(collection).select(fields(collection).join(','))
      .order('updated_at', { ascending: false }).range(offset, offset + limit - 1)
    if (error) throw new Error('Unable to list editorial records.')
    return { collection, items: data, next_offset: data?.length === limit ? offset + limit : null }
  }
  if (!id.success) throw new Error('Invalid record id.')
  const { data: current, error } = await db.from(collection)
    .select(fields(collection).join(',')).eq('id', id.data).maybeSingle()
  if (error) throw new Error('Unable to read editorial record.')
  if (!current) throw new Error('Editorial record not found.')
  if (name === 'editorial_get') return { collection, item: current }
  if (name === 'editorial_propose_update') {
    const changes = parseUpdate(collection, args.changes)
    const { data, error: insertError } = await db.from('mcp_editorial_requests')
      .insert({ collection, target_id: id.data, user_id: actor.userId,
        changes, base_updated_at: current.updated_at, status: 'pending' })
      .select('id,status,created_at').single()
    if (insertError) throw new Error('Could not queue proposal. Has the MCP migration been applied?')
    return { ...data, collection, target_id: id.data, changes, review_url: '/admin/mcp-requests' }
  }
  throw new Error('Unknown editorial tool.')
}
