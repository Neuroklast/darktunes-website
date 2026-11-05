/**
 * app/artists/[slug]/page.tsx — Artist profile page (RSC)
 *
 * Fetches artist by slug + their releases and concerts server-side.
 * Other artist data remains cached, while news is always queried live so
 * publication timestamps take effect at the first request after release.
 *
 * ── Data API Waterfall ──────────────────────────────────────────────────────
 * 1. `params.slug`              → URL slug of the artist
 * 2. `getArtistBySlug`          → SELECT * FROM artists WHERE slug = ?
 * 3. Parallel:
 *    `getReleasesByArtistId`    → SELECT * FROM releases WHERE artist_id = ?
 *    `getConcertsByArtistId`    → SELECT * FROM concerts WHERE artist_id = ?
 *    `getVideosByArtistId`      → SELECT * FROM videos WHERE artist_id = ?
 *    `getPublicNewsPostsByArtistId` → artist news (preview rows from site_settings)
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
  getPublicRelatedArtists,
} from '@/lib/api/publicArtist'
import { getReleasesByArtistId } from '@/lib/api/releases'
import { getConcertsByArtistId } from '@/lib/api/concerts'
import { getPublicVideosByArtistId } from '@/lib/api/videos'
import { getPublicNewsPostsByArtistId } from '@/lib/api/news'
import { getPublicArtistEpkByArtistId } from '@/lib/api/publicArtistEpk'
import { getCachedSiteSettings } from '@/lib/cache/publicQueries'
import {
  ARTIST_PROFILE_PREVIEW_ROWS_DEFAULT,
  clampArtistProfilePreviewRows,
} from '@/lib/artistProfilePreview'

import { ArtistDetailContent } from './_components/ArtistDetailContent'
import { buildMusicGroupSchema, serializeJsonLd } from '@/lib/seo/jsonld'
import { getMetadataBrand, pageTitle, pageTitlePipe } from '@/lib/seo/metadata'

interface Props {
  params: Promise<{ slug: string }>
}

/** News visibility is date-based and must not be frozen in the full route cache. */
export const dynamic = 'force-dynamic'

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
    // No fallback catches in here: a throw keeps Next's last good cache entry
    // instead of storing a degraded payload for the TTL.
    async () => {
      const client = createPublicSupabaseClient()
      // Public artist path: column whitelist only (no secrets in RSC payload).
      // EPK uses service role after Phase-2 RLS drops anon read on artist_epks.
      const artist = await getPublicArtistBySlug(client, slug)
      if (!artist) return null
      const serviceDb = await createServiceRoleSupabaseClient()
      const [releases, concerts, videos, publicEpk, relatedArtists] = await Promise.all([
        getReleasesByArtistId(client, artist.id),
        getConcertsByArtistId(client, artist.id),
        getPublicVideosByArtistId(client, artist.id),
        getPublicArtistEpkByArtistId(serviceDb, artist.id),
        getPublicRelatedArtists(client, artist.id, artist.genres),
      ])
      const galleryPhotos = (publicEpk?.profile.epkGalleryPhotos ?? []).filter(Boolean)
      return { artist, releases, concerts, videos, galleryPhotos, relatedArtists }
    },
    [`artist-${slug}`],
    // Granular tags: 'artists' invalidates all artist lists;
    // `artist-${slug}` invalidates only this specific artist page.
    { revalidate: 60, tags: ['artists', `artist-${slug}`] },
  )
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
  // Site settings use a separate cache tag so artist-slug revalidation stays independent.
  const [data, settings] = await Promise.all([
    makeGetArtistData(slug)(),
    getCachedSiteSettings().catch(() => null),
  ])
  if (!data) notFound()
  const { artist, releases, concerts, videos, galleryPhotos, relatedArtists } = data
  const news = await getPublicNewsPostsByArtistId(createPublicSupabaseClient(), artist.id)
  const videoPreviewRows = clampArtistProfilePreviewRows(
    settings?.artistProfileVideoRows ?? ARTIST_PROFILE_PREVIEW_ROWS_DEFAULT,
  )
  const newsPreviewRows = clampArtistProfilePreviewRows(
    settings?.artistProfileNewsRows ?? ARTIST_PROFILE_PREVIEW_ROWS_DEFAULT,
  )
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
        videoPreviewRows={videoPreviewRows}
        newsPreviewRows={newsPreviewRows}
      />
    </>
  )
}
