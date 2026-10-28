/**
 * Bounded, non-sensitive CMS summaries suitable for external MCP clients.
 * Every query uses a server-projected allowlist of columns (never SELECT *).
 */
import { z } from 'zod'
import { registerTool } from '@/lib/ai/tools/registry'

const pagination = z.object({ limit: z.number().int().min(1).max(50).default(20) }).strict()

registerTool({
  name: 'list_cms_news',
  description: 'List darkTunes CMS news headlines, publication status and timestamps. Includes drafts only for authorized CMS editors.',
  input: pagination,
  output: z.object({
    items: z.array(z.object({
      id: z.string(), title: z.string(), slug: z.string(),
      status: z.string(), published_at: z.string().nullable(),
    })),
  }),
  capabilities: ['cms.news.edit'],
  dataScope: 'label',
  classification: 'read',
  maxResultBytes: 12_000,
  timeoutMs: 10_000,
  execute: async ({ limit }, { actor }) => {
    const { data, error } = await actor.serviceDb.from('news_posts')
      .select('id,title,slug,status,published_at')
      .order('published_at', { ascending: false }).limit(limit)
    if (error) throw error
    return { items: (data ?? []).map((row) => ({
      id: row.id, title: row.title, slug: row.slug,
      status: row.status, published_at: row.published_at,
    })) }
  },
})

registerTool({
  name: 'list_cms_artists',
  description: 'List artist names, public slugs and visibility flags. No personal data, credentials or private notes.',
  input: pagination,
  output: z.object({
    items: z.array(z.object({ id: z.string(), name: z.string(), slug: z.string(), is_visible: z.boolean() })),
  }),
  capabilities: ['admin.panel.editor'],
  dataScope: 'label',
  classification: 'read',
  maxResultBytes: 12_000,
  timeoutMs: 10_000,
  execute: async ({ limit }, { actor }) => {
    const { data, error } = await actor.serviceDb.from('artists')
      .select('id,name,slug,is_visible').order('name').limit(limit)
    if (error) throw error
    return { items: (data ?? []).map(row => ({
      id: row.id, name: row.name, slug: row.slug, is_visible: row.is_visible,
    })) }
  },
})

registerTool({
  name: 'list_cms_releases',
  description: 'List release catalog entries and identify missing cover art or streaming links.',
  input: pagination,
  output: z.object({
    items: z.array(z.object({
      id: z.string(), title: z.string(), release_date: z.string(),
      type: z.string(), has_cover: z.boolean(), has_spotify_link: z.boolean(), is_visible: z.boolean(),
    })),
  }),
  capabilities: ['cms.releases.manage'],
  dataScope: 'label',
  classification: 'read',
  maxResultBytes: 12_000,
  timeoutMs: 10_000,
  execute: async ({ limit }, { actor }) => {
    const { data, error } = await actor.serviceDb.from('releases')
      .select('id,title,release_date,type,cover_art,spotify_url,is_visible')
      .order('release_date', { ascending: false }).limit(limit)
    if (error) throw error
    return { items: (data ?? []).map(row => ({
      id: row.id, title: row.title, release_date: row.release_date, type: row.type,
      has_cover: Boolean(row.cover_art), has_spotify_link: Boolean(row.spotify_url),
      is_visible: row.is_visible,
    })) }
  },
})

registerTool({
  name: 'list_cms_events',
  description: 'List upcoming label concerts and events, including event date, location, status and ticket availability.',
  input: pagination,
  output: z.object({
    items: z.array(z.object({
      id: z.string(), event_name: z.string().nullable(), concert_date: z.string(),
      venue_name: z.string().nullable(), venue_city: z.string().nullable(),
      status: z.string(), has_ticket_url: z.boolean(),
    })),
  }),
  capabilities: ['admin.panel.editor'],
  dataScope: 'label',
  classification: 'read',
  maxResultBytes: 12_000,
  timeoutMs: 10_000,
  execute: async ({ limit }, { actor }) => {
    const today = new Date().toISOString().slice(0, 10)
    const { data, error } = await actor.serviceDb.from('concerts')
      .select('id,event_name,concert_date,venue_name,venue_city,status,ticket_url')
      .gte('concert_date', today).order('concert_date').limit(limit)
    if (error) throw error
    return { items: (data ?? []).map(row => ({
      id: row.id, event_name: row.event_name, concert_date: row.concert_date,
      venue_name: row.venue_name, venue_city: row.venue_city,
      status: row.status, has_ticket_url: Boolean(row.ticket_url),
    })) }
  },
})
