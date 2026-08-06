/**
 * app/llms.txt/route.ts — Dynamic llms.txt endpoint
 *
 * Served at /llms.txt — follows the llmstxt.org open standard.
 * The file is generated at request-time from live Supabase data so it
 * automatically reflects every new artist, release, and site-settings change
 * without any manual update.
 *
 * Caching: ISR with a 5-minute (300 s) revalidation window.  On-demand cache
 * invalidation via POST /api/revalidate-site-settings also purges this route
 * because it shares the 'artists' and 'releases' cache tags.
 *
 * ── docs/agent/backend.md (llms.txt section) ────────────────────────────────
 * When adding a NEW public section to the website (e.g. /merch, /events):
 *   1. Add a section entry in the `## Sections` block inside `buildLlmsTxt()`.
 *   2. If the section has its own DB table, add a DAL query and render those
 *      rows in the appropriate "## <Section>" block.
 * When removing a section: delete the corresponding block and query.
 * Do NOT list private/admin/portal routes here — they are covered by robots.ts.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { getPublicArtists, type PublicArtist } from '@/lib/api/publicArtist'
import { getPublicReleases } from '@/lib/api/releases'
import { getSiteSettings, SITE_SETTINGS_DEFAULTS } from '@/lib/api/siteSettings'
import { buildDefaultSeoDescription } from '@/lib/brand/tenantDefaults'
import { resolveSiteUrl } from '@/lib/brand'
import type { Release, SiteSettings } from '@/types'

// ISR: regenerate at most once every 5 minutes
export const revalidate = 300

// ── Supabase public client (cookie-free, safe for cached contexts) ───────────

function createPublicClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key',
  )
}

// ── Text builder ─────────────────────────────────────────────────────────────

function buildLlmsTxt(
  settings: SiteSettings | null,
  artists: PublicArtist[],
  releases: Release[],
  baseUrl: string,
): string {
  const labelName = settings?.labelName ?? SITE_SETTINGS_DEFAULTS.labelName
  const tagline = settings?.labelTagline ?? SITE_SETTINGS_DEFAULTS.labelTagline
  const seoDescription =
    settings?.seoDescription ?? buildDefaultSeoDescription(labelName)
  const contactEmail = settings?.contactEmail ?? SITE_SETTINGS_DEFAULTS.contactEmail

  // Group releases by artist for compact representation
  const releasesByArtist = new Map<string, Release[]>()
  for (const r of releases) {
    const bucket = releasesByArtist.get(r.artistName) ?? []
    bucket.push(r)
    releasesByArtist.set(r.artistName, bucket)
  }

  const lines: string[] = []

  // ── Header ──────────────────────────────────────────────────────────────────
  lines.push(`# ${labelName}`)
  lines.push(``)
  lines.push(`> ${tagline}`)
  lines.push(``)
  lines.push(seoDescription)
  lines.push(``)

  // ── Optional links block ─────────────────────────────────────────────────
  if (settings?.instagramUrl) lines.push(`Instagram: ${settings.instagramUrl}`)
  if (settings?.youtubeUrl) lines.push(`YouTube: ${settings.youtubeUrl}`)
  if (settings?.spotifyUrl) lines.push(`Spotify: ${settings.spotifyUrl}`)
  for (const link of settings?.customSocialLinks ?? []) {
    if (link.url?.trim()) lines.push(`${link.label}: ${link.url}`)
  }
  if (contactEmail) lines.push(`Contact: ${contactEmail}`)
  lines.push(``)

  // ── Sections index ───────────────────────────────────────────────────────
  lines.push(`## Sections`)
  lines.push(``)
  lines.push(`- [Artists](${baseUrl}/artists): Full roster of signed artists.`)
  lines.push(`- [Releases](${baseUrl}/releases): Discography — albums, EPs, and singles.`)
  lines.push(`- [Videos](${baseUrl}/videos): Official music videos and shorts.`)
  lines.push(`- [News](${baseUrl}/news): Label news, interviews, and announcements.`)
  lines.push(`- [About](${baseUrl}/about): Label history and mission.`)
  lines.push(`- [Press](${baseUrl}/press): Electronic Press Kit (EPK) for media.`)
  lines.push(`- [Contact](${baseUrl}/contact): Get in touch with the label.`)
  lines.push(``)

  // ── Artists ──────────────────────────────────────────────────────────────
  lines.push(`## Artists`)
  lines.push(``)
  if (artists.length === 0) {
    lines.push(`No artists listed yet.`)
  } else {
    for (const artist of artists) {
      const profileUrl = `${baseUrl}/artists/${artist.slug}`
      const genreStr = artist.genres.length > 0 ? ` — ${artist.genres.join(', ')}` : ''
      const countryStr = artist.country ? ` (${artist.country})` : ''
      lines.push(`- [${artist.name}](${profileUrl})${genreStr}${countryStr}`)
      if (artist.bio) {
        // Trim bio to a single sentence / 200 chars for conciseness
        const shortBio = artist.bio.replace(/\s+/g, ' ').trim()
        const truncated = shortBio.length > 200 ? shortBio.slice(0, 197) + '…' : shortBio
        lines.push(`  ${truncated}`)
      }
    }
  }
  lines.push(``)

  // ── Releases ─────────────────────────────────────────────────────────────
  lines.push(`## Releases`)
  lines.push(``)
  if (releases.length === 0) {
    lines.push(`No releases listed yet.`)
  } else {
    // List newest first (data is already ordered by release_date DESC from DAL)
    for (const rel of releases) {
      const releaseUrl = `${baseUrl}/releases/${rel.id}`
      const year = rel.releaseDate ? rel.releaseDate.slice(0, 4) : ''
      const typeStr = rel.type ? ` [${rel.type.toUpperCase()}]` : ''
      const yearStr = year ? ` (${year})` : ''
      lines.push(`- [${rel.title}](${releaseUrl}) by ${rel.artistName}${typeStr}${yearStr}`)
    }
  }
  lines.push(``)

  // ── Footer ────────────────────────────────────────────────────────────────
  const now = new Date().toISOString().slice(0, 10)
  lines.push(`---`)
  lines.push(``)
  lines.push(`Generated: ${now} | Artists: ${artists.length} | Releases: ${releases.length}`)
  lines.push(`Source: ${baseUrl}/llms.txt`)

  return lines.join('\n')
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET() {
  const baseUrl = resolveSiteUrl()
  const db = createPublicClient()

  // Fetch all public data in parallel; gracefully degrade on errors
  const [settings, artists, releases] = await Promise.all([
    getSiteSettings(db).catch(() => null),
    getPublicArtists(db).catch(() => [] as PublicArtist[]),
    getPublicReleases(db).catch(() => [] as Release[]),
  ])

  const text = buildLlmsTxt(settings, artists, releases, baseUrl)

  return new NextResponse(text, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      // Allow public caching; CDN/edge revalidates after 5 minutes
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
    },
  })
}
