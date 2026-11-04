/**
 * Zod schemas and helpers for Supabase `Json` columns.
 * Phase 2 DAL modules should import from here instead of `as unknown as` casts.
 */

import { z } from 'zod'
import type { Json } from '@/types/database'
import type { HeroButton } from '@/types'
import { epkDocumentV2Schema, type EpkDocumentV2 } from '@/lib/epk/schema/documentV2'

export const heroButtonActionSchema = z.enum(['link', 'scroll', 'none'])
export type HeroButtonAction = z.infer<typeof heroButtonActionSchema>

export const heroButtonSchema = z.object({
  label: z.string().optional(),
  action: heroButtonActionSchema.optional(),
  href: z.string().optional(),
})

export const platformLinksSchema = z.record(z.string(), z.string())

export const junctionArtistSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
})

export type CompactArtist = z.infer<typeof junctionArtistSchema>

export const customLinkSchema = z.object({
  label: z.string(),
  url: z.string(),
})

export const customLinksSchema = z.array(customLinkSchema)

export type JunctionRow<P extends string> = Record<P, string> & {
  sort_order?: number
  artists: CompactArtist | null
}

/**
 * Parses a hero CTA button from a database row or JSON payload.
 * @returns Parsed button or `undefined` when input is absent or invalid.
 */
export function parseHeroButton(value: unknown): HeroButton | undefined {
  const result = heroButtonSchema.safeParse(value)
  return result.success ? result.data : undefined
}

/**
 * Parses persisted per-platform streaming links from a JSON column.
 * @returns Link map or `undefined` when input is absent or invalid.
 */
export function parsePlatformLinks(value: unknown): Record<string, string> | undefined {
  if (value == null) return undefined
  const result = platformLinksSchema.safeParse(value)
  return result.success ? result.data : undefined
}

/**
 * Parses a compact artist object from a junction-table join (`artists(...)`).
 * @returns Parsed artist or `undefined` when input is absent or invalid.
 */
export function parseCompactArtist(value: unknown): CompactArtist | undefined {
  const result = junctionArtistSchema.safeParse(value)
  return result.success ? result.data : undefined
}

/**
 * Parses portal custom links from an `artist_epks.custom_links` JSON column.
 * @returns Valid links or an empty array when input is absent or invalid.
 */
export function parseCustomLinks(value: unknown): Array<{ label: string; url: string }> {
  if (value == null) return []
  const result = customLinksSchema.safeParse(value)
  return result.success ? result.data : []
}

/**
 * Parses junction-table rows that embed a nested `artists` object.
 * Skips rows with missing parent IDs or malformed artist payloads.
 */
export function parseJunctionRows<P extends string>(
  data: unknown,
  parentIdKey: P,
): Array<JunctionRow<P>> {
  if (!Array.isArray(data)) return []

  const rows: Array<JunctionRow<P>> = []
  for (const item of data) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const parentId = record[parentIdKey]
    if (typeof parentId !== 'string') continue

    let artists: CompactArtist | null = null
    if (record.artists != null) {
      const parsedArtist = parseCompactArtist(record.artists)
      if (!parsedArtist) continue
      artists = parsedArtist
    }

    const row: JunctionRow<P> = {
      [parentIdKey]: parentId,
      artists,
    } as JunctionRow<P>
    if (typeof record.sort_order === 'number') {
      row.sort_order = record.sort_order
    }
    rows.push(row)
  }

  return rows
}

/**
 * Validates an EPK canvas document before persistence.
 * @throws ZodError when the payload does not match document v2 schema.
 */
export function parseEpkDocumentColumn(value: unknown): EpkDocumentV2 {
  return epkDocumentV2Schema.parse(value)
}

/**
 * Serializes a typed value into a Supabase-compatible `Json` column value.
 * Uses JSON round-trip to strip non-JSON types (e.g. `undefined`, `Date`).
 */
export function toSupabaseJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json
}

/**
 * Serializes a typed value for DB columns typed as `Record<string, unknown>`.
 * Falls back to `{}` when JSON round-trip does not produce a plain object.
 */
export function toDbRecord(value: unknown): Record<string, unknown> {
  const json = toSupabaseJson(value)
  if (json !== null && typeof json === 'object' && !Array.isArray(json)) {
    return json as Record<string, unknown>
  }
  return {}
}