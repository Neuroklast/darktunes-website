/**
 * app/news/page.tsx — News list page [RSC]
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { getCachedPublicNews } from '@/lib/cache/publicQueries'
import { getRequestOrganizationId } from '@/lib/organizations/requestContext'
import { NewsList } from './_components/NewsList'
import { getMetadataBrand, pageTitle } from '@/lib/seo/metadata'

export async function generateMetadata(): Promise<Metadata> {
  const { labelName } = await getMetadataBrand()
  return {
    title: pageTitle('News', labelName),
    description: `Latest news and updates from ${labelName}.`,
  }
}

export default async function NewsPage() {
  const orgId = await getRequestOrganizationId()
  const [posts, tPages, tNewsPage] = await Promise.all([
    getCachedPublicNews(orgId),
    getTranslations('pages'),
    getTranslations('newsPage'),
  ])

  return (
    <div id="main-content" className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto px-4 lg:px-8 pt-36 pb-24 max-w-7xl">
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:text-accent transition-colors mb-8 inline-block"
        >
          {tPages('backToHome')}
        </Link>

        <div className="mb-12">
          <h1 className="text-5xl lg:text-6xl font-bold mb-4 tracking-tight uppercase">
            {tNewsPage('heading')}
          </h1>
          <p className="text-xl text-muted-foreground">{tNewsPage('subheading')}</p>
        </div>

        <NewsList posts={posts} />
      </div>
    </div>
  )
}