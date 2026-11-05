import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { unstable_cache } from 'next/cache'
import { createPublicSupabaseClient } from '@/lib/supabase/publicClient'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import { getPublishedFanPageBySlug, getDraftFanPageByArtistId } from '@/lib/api/publicFanPage'
import { getPublicArtistBySlug } from '@/lib/api/publicArtist'
import { getReleasesByArtistId } from '@/lib/api/releases'
import { getConcertsByArtistId } from '@/lib/api/concerts'
import { getPublicVideosByArtistId } from '@/lib/api/videos'
import { getPublicNewsPostsByArtistId } from '@/lib/api/news'
import { getPublishedArtistNewsByArtistId } from '@/lib/api/artistNews'
import { getPublicArtistEpkByArtistId } from '@/lib/api/publicArtistEpk'
import { mergeFanPageNews } from '@/lib/fan-page/mergeNews'
import { verifyFanPagePreviewToken } from '@/lib/fan-page/previewToken'
import { FanPagePublicView } from './_components/FanPagePublicView'
import { getMetadataBrand, pageTitle } from '@/lib/seo/metadata'

interface Props {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ preview?: string }>
}

/** Fan news must be evaluated after its scheduled UTC publication boundary. */
export const dynamic = 'force-dynamic'
export const dynamicParams = true

function makeGetFanPageData(slug: string) {
  return unstable_cache(
    // No fallback catches in here: a throw keeps Next's last good cache entry
    // instead of storing a degraded payload for the TTL.
    async () => {
      const client = createPublicSupabaseClient()
      const page = await getPublishedFanPageBySlug(client, slug)
      if (!page) return null

      const artist = await getPublicArtistBySlug(client, slug)
      if (!artist) return null

      const [releases, concerts, videos, artistNews, epk] = await Promise.all([
        getReleasesByArtistId(client, artist.id),
        getConcertsByArtistId(client, artist.id),
        getPublicVideosByArtistId(client, artist.id),
        getPublishedArtistNewsByArtistId(client, artist.id),
        getPublicArtistEpkByArtistId(client, artist.id),
      ])

      return {
        page,
        artist,
        releases,
        concerts,
        videos,
        artistNews,
        galleryPhotos: epk?.profile.epkGalleryPhotos ?? [],
      }
    },
    [`fan-page-${slug}`],
    { revalidate: 60, tags: ['fan-pages', `fan-page-${slug}`] },
  )
}

async function getPreviewFanPageData(slug: string, previewToken: string) {
  const verified = verifyFanPagePreviewToken(previewToken, slug)
  if (!verified) return null

  const client = await createServiceRoleSupabaseClient()
  const page = await getDraftFanPageByArtistId(client, verified.artistId)
  if (!page) return null

  // Service role + public columns; allow hidden artists for draft preview.
  const artist = await getPublicArtistBySlug(client, slug, { requireVisible: false })
  if (!artist) return null

  const [releases, concerts, videos, labelNews, artistNews, epk] = await Promise.all([
    getReleasesByArtistId(client, artist.id),
    getConcertsByArtistId(client, artist.id),
    getPublicVideosByArtistId(client, artist.id),
    getPublicNewsPostsByArtistId(client, artist.id).catch(() => []),
    getPublishedArtistNewsByArtistId(client, artist.id).catch(() => []),
    getPublicArtistEpkByArtistId(client, artist.id).catch(() => null),
  ])

  return {
    page,
    artist,
    releases,
    concerts,
    videos,
    news: mergeFanPageNews(labelNews, artistNews),
    galleryPhotos: epk?.profile.epkGalleryPhotos ?? [],
  }
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params
  const { preview } = await searchParams

  if (preview) {
    const data = await getPreviewFanPageData(slug, preview).catch(() => null)
    if (data) {
      return {
        title: `${data.page.artistName} — Preview`,
        robots: { index: false, follow: false },
      }
    }
  }

  const data = await makeGetFanPageData(slug)().catch(() => null)
  const { labelShortName } = await getMetadataBrand()
  if (!data) return { title: pageTitle('Personal Artist Page', labelShortName) }

  const title = data.page.seoTitle ?? `${data.page.artistName} — Personal Artist Page`
  const description =
    data.page.seoDescription ??
    `Official personal artist page for ${data.page.artistName} on ${labelShortName}.`

  return { title, description }
}

export default async function FanPageRoute({ params, searchParams }: Props) {
  const { slug } = await params
  const { preview } = await searchParams

  if (preview) {
    const previewData = await getPreviewFanPageData(slug, preview).catch(() => null)
    if (!previewData) notFound()

    return (
      <main id="main-content">
        <FanPagePublicView
          document={previewData.page.document}
          artist={previewData.artist}
          releases={previewData.releases}
          concerts={previewData.concerts}
          videos={previewData.videos}
          news={previewData.news}
          galleryPhotos={previewData.galleryPhotos}
          isPreview
        />
      </main>
    )
  }

  // Do NOT swallow errors here — a Supabase failure must surface as a 500
  // (uncached) rather than render a false 404.
  const data = await makeGetFanPageData(slug)()
  if (!data) notFound()
  const labelNews = await getPublicNewsPostsByArtistId(createPublicSupabaseClient(), data.artist.id)
  const news = mergeFanPageNews(labelNews, data.artistNews)

  return (
    <main id="main-content">
      <FanPagePublicView
        document={data.page.document}
        artist={data.artist}
        releases={data.releases}
        concerts={data.concerts}
        videos={data.videos}
        news={news}
        galleryPhotos={data.galleryPhotos}
      />
    </main>
  )
}