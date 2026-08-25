/**
 * app/releases/[id]/page.tsx — Release detail page (RSC)
 *
 * Data is fetched server-side. The cover art uses Framer Motion's
 * `layoutId` (matching the one in the Releases grid card) to animate
 * a smooth thumbnail → hero transition on navigation.
 *
 * ── Data API Waterfall ──────────────────────────────────────────────────────
 * 1. `params.id`        → UUID of the release (from the URL segment)
 * 2. `getReleaseById`   → SELECT * FROM releases WHERE id = ? AND is_visible = TRUE
 *                         (filtered by RLS: anonymous users see visible releases
 *                          whose artist is also visible)
 * 3. Dictionary         → resolved from NEXT_LOCALE cookie / Accept-Language header
 *
 * All steps run in parallel via Promise.all.  The Supabase query uses a
 * cookie-free public client (anon key) so it can be safely cached by
 * unstable_cache without hitting Next.js 15's "cookies() not available inside
 * unstable_cache" restriction.
 * ──────────────────────────────────────────────────────────────────────────
 */

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { unstable_cache } from 'next/cache'
import { createPublicSupabaseClient } from '@/lib/supabase/publicClient'
import { getReleaseById, getPublicReleases } from '@/lib/api/releases'
import { getArtistById } from '@/lib/api/artists'
import { getRequestOrganizationId } from '@/lib/organizations/requestContext'

import { ReleaseDetailContent } from './_components/ReleaseDetailContent'
import { buildMusicAlbumSchema, serializeJsonLd } from '@/lib/seo/jsonld'
import { entityTitle, getMetadataBrand, pageTitle } from '@/lib/seo/metadata'

interface Props {
  params: Promise<{ id: string }>
}

function makeGetRelease(id: string) {
  return unstable_cache(
    async () => {
      const client = createPublicSupabaseClient()
      return getReleaseById(client, id)
    },
    [`release-${id}`],
    // Granular tags: 'releases' invalidates all release lists;
    // `release-${id}` invalidates only this specific release page.
    { revalidate: 60, tags: ['releases', `release-${id}`] },
  )
}

function makeGetArtist(artistId: string) {
  return unstable_cache(
    async () => {
      const client = createPublicSupabaseClient()
      return getArtistById(client, artistId)
    },
    [`artist-by-id-${artistId}`],
    { revalidate: 60, tags: ['artists', `artist-${artistId}`] },
  )
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const release = await makeGetRelease(id)().catch(() => null)
  const { labelName } = await getMetadataBrand()
  if (!release) return { title: pageTitle('Release not found', labelName) }
  return {
    title: entityTitle(release.title, release.artistName, labelName),
    description: `${release.type.toUpperCase()} by ${release.artistName}, released ${release.releaseDate}`,
    openGraph: {
      title: `${release.title} — ${release.artistName}`,
      images: release.coverArt ? [{ url: release.coverArt }] : [],
      type: 'music.album',
    },
  }
}

/** Opt-in ISR: revalidate every 60 s at the route-segment level. */
export const revalidate = 60

/**
 * Allow release IDs not returned by generateStaticParams to render on-demand
 * (ISR fallback). Explicit export prevents accidental regressions in Next.js 15.
 */
export const dynamicParams = true

/**
 * Pre-render all currently-visible releases at build time so ISR starts from
 * a warm page rather than a cold on-demand render.
 */
export async function generateStaticParams() {
  const client = createPublicSupabaseClient()
  // Build-time SSG uses Org #0; other orgs render via dynamicParams.
  const releases = await getPublicReleases(client).catch((error) => {
    console.error('generateStaticParams(/releases/[id]) failed:', error)
    return []
  })
  return releases.map((release) => ({ id: release.id }))
}

export default async function ReleaseDetailPage({ params }: Props) {
  // Bind request org early so host isolation runs for this route tree.
  await getRequestOrganizationId()
  const { id } = await params
  const release = await makeGetRelease(id)().catch(() => null)
  if (!release) notFound()
  const artist = release.artistId
    ? await makeGetArtist(release.artistId)().catch(() => null)
    : null
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(buildMusicAlbumSchema({ release })) }}
      />
      <ReleaseDetailContent release={release} artist={artist} />
    </>
  )
}
