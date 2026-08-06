/**
 * app/artists/[slug]/page.tsx — Artist profile page (RSC)
 *
 * Fetches artist by slug + their releases and concerts server-side.
 * Uses Next.js route-segment revalidation (60 s ISR) instead of
 * unstable_cache so that newly-created artists are always reachable
 * without a permanent 404 from a stale negative-cache entry.
 *
 * ── Data API Waterfall ──────────────────────────────────────────────────────
 * 1. `params.slug`              → URL slug of the artist
 * 2. `getArtistBySlug`          → SELECT * FROM artists WHERE slug = ?
 * 3. Parallel:
 *    `getReleasesByArtistId`    → SELECT * FROM releases WHERE artist_id = ?
 *    `getConcertsByArtistId`    → SELECT * FROM concerts WHERE artist_id = ?
 *    `getVideosByArtistId`      → SELECT * FROM videos WHERE artist_id = ?
 *    `getPublicNewsPosts`       → latest 3 news posts
 * 4. Dictionary                 → resolved from NEXT_LOCALE cookie / Accept-Language
 * ──────────────────────────────────────────────────────────────────────────
 */

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { unstable_cache } from 'next/cache'
import { createPublicSupabaseClient } from '@/lib/supabase/publicClient'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import {
  getPublicArtistBySlug,
  getPublicArtists,
  getPublicRelatedArtists,
} from '@/lib/api/publicArtist'
import { getReleasesByArtistId } from '@/lib/api/releases'
import { getConcertsByArtistId } from '@/lib/api/concerts'
import { getPublicVideosByArtistId } from '@/lib/api/videos'
import { getPublicNewsPostsByArtistId } from '@/lib/api/news'
import { getPublicArtistEpkByArtistId } from '@/lib/api/publicArtistEpk'

import { ArtistDetailContent } from './_components/ArtistDetailContent'
import { buildMusicGroupSchema, serializeJsonLd } from '@/lib/seo/jsonld'
import { getMetadataBrand, pageTitle, pageTitlePipe } from '@/lib/seo/metadata'

interface Props {
  params: Promise<{ slug: string }>
}

/** Opt-in ISR: revalidate every 60 s at the route-segment level. */
export const revalidate = 60

/**
 * Allow slugs not returned by generateStaticParams to render on-demand
 * (ISR fallback). Without this explicit export Next.js 15 defaults to
 * dynamicParams = true, but being explicit prevents accidental regressions.
 */
export const dynamicParams = true

/**
 * Wrap artist data fetch in unstable_cache to attach granular cache tags.
 * This allows targeted revalidation per artist slug (via revalidateTag) in
 * addition to the global 'artists' tag used by list pages.
 */
function makeGetArtistData(slug: string) {
  return unstable_cache(
    async () => {
      const client = createPublicSupabaseClient()
      // Public artist path: column whitelist only (no secrets in RSC payload).
      // EPK uses service role after Phase-2 RLS drops anon read on artist_epks.
      const artist = await getPublicArtistBySlug(client, slug)
      if (!artist) return null
      const serviceDb = await createServiceRoleSupabaseClient()
      const [releases, concerts, videos, news, publicEpk, relatedArtists] = await Promise.all([
        getReleasesByArtistId(client, artist.id),
        getConcertsByArtistId(client, artist.id),
        getPublicVideosByArtistId(client, artist.id),
        getPublicNewsPostsByArtistId(client, artist.id).then((posts) => posts.slice(0, 3)),
        getPublicArtistEpkByArtistId(serviceDb, artist.id).catch(() => null),
        getPublicRelatedArtists(client, artist.id, artist.genres).catch(() => []),
      ])
      const galleryPhotos = (publicEpk?.profile.epkGalleryPhotos ?? []).filter(Boolean)
      return { artist, releases, concerts, videos, news, galleryPhotos, relatedArtists }
    },
    [`artist-${slug}`],
    // Granular tags: 'artists' invalidates all artist lists;
    // `artist-${slug}` invalidates only this specific artist page.
    { revalidate: 60, tags: ['artists', `artist-${slug}`] },
  )
}

export async function generateStaticParams() {
  const client = createPublicSupabaseClient()
  const artists = await getPublicArtists(client).catch((error) => {
    console.error('generateStaticParams(/artists/[slug]) failed:', error)
    return []
  })
  return artists.map((artist) => ({ slug: artist.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  // Silently swallow errors only in metadata generation — a missing artist
  // just returns a generic title; the page itself will show the proper 404.
  const data = await makeGetArtistData(slug)().catch(() => null)
  const { labelName } = await getMetadataBrand()
  if (!data) return { title: pageTitle('Artist not found', labelName) }
  const { artist } = data
  return {
    title: pageTitlePipe(artist.name, labelName),
    description: artist.bio
      ? artist.bio.slice(0, 160)
      : `${artist.name} — ${labelName}`,
    openGraph: {
      title: pageTitle(artist.name, labelName),
      description: artist.bio ? artist.bio.slice(0, 160) : undefined,
      images: artist.imageUrl ? [{ url: artist.imageUrl }] : [],
      type: 'profile',
    },
  }
}

export default async function ArtistDetailPage({ params }: Props) {
  const { slug } = await params
  // Do NOT swallow errors here — a Supabase failure must propagate so that
  // Next.js returns a 500 (uncached) rather than caching a false 404 for 60s.
  const data = await makeGetArtistData(slug)()
  if (!data) notFound()
  const { artist, releases, concerts, videos, news, galleryPhotos, relatedArtists } = data
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(buildMusicGroupSchema({ artist, releases })),
        }}
      />
      <ArtistDetailContent
        artist={artist}
        releases={releases}
        concerts={concerts}
        videos={videos}
        news={news}
        galleryPhotos={galleryPhotos}
        relatedArtists={relatedArtists}
      />
    </>
  )
}
