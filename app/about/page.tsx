import { unstable_cache } from 'next/cache'
import { createPublicSupabaseClient } from '@/lib/supabase/publicClient'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { getSiteSettings } from '@/lib/api/siteSettings'
import { getPublicArtists } from '@/lib/api/publicArtist'
import { getPublicNewsPosts } from '@/lib/api/news'
import { AboutContent } from './_components/AboutContent'
import { getMetadataBrand, pageTitlePipe } from '@/lib/seo/metadata'

const getCachedAboutData = unstable_cache(
  async () => {
    const client = createPublicSupabaseClient()
    const [siteSettings, artists, news] = await Promise.all([
      getSiteSettings(client),
      getPublicArtists(client),
      getPublicNewsPosts(client),
    ])
    return { siteSettings, artists, news }
  },
  ['about-page'],
  { revalidate: 60, tags: ['artists', 'news'] },
)

export async function generateMetadata(): Promise<Metadata> {
  const [t, { labelName }] = await Promise.all([
    getTranslations('about'),
    getMetadataBrand(),
  ])
  return {
    title: pageTitlePipe(t('heading'), labelName),
    description: t('subheading'),
  }
}

export default async function AboutPage() {
  const { siteSettings, artists, news } = await getCachedAboutData().catch(() => ({
    siteSettings: null,
    artists: [],
    news: [],
  }))

  return (
    <main id="main-content" className="min-h-screen bg-background">
      <AboutContent siteSettings={siteSettings} artists={artists} news={news} />
    </main>
  )
}