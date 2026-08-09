/**
 * app/releases/page.tsx — Public releases listing page (RSC)
 *
 * Shows all visible, non-promo releases as a searchable, filterable grid.
 * Each card links to /releases/[id].
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { getCachedPublicReleases } from '@/lib/cache/publicQueries'
import { getRequestOrganizationId } from '@/lib/organizations/requestContext'
import { ReleasesPageContent } from './_components/ReleasesPageContent'
import { getMetadataBrand, pageTitle } from '@/lib/seo/metadata'

export const revalidate = 60

export async function generateMetadata(): Promise<Metadata> {
  const { labelName } = await getMetadataBrand()
  return {
    title: pageTitle('Releases', labelName),
    description: `Browse all releases from ${labelName} artists.`,
  }
}

export default async function ReleasesPage() {
  const orgId = await getRequestOrganizationId()
  const [releases, tPages, tReleases] = await Promise.all([
    getCachedPublicReleases(orgId),
    getTranslations('pages'),
    getTranslations('releases'),
  ])

  return (
    <main id="main-content" className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto px-4 lg:px-16 pt-36 pb-24">
        <div className="mb-12">
          <Link
            href="/"
            className="text-xs text-muted-foreground hover:text-accent font-mono uppercase tracking-widest mb-6 inline-block"
          >
            {tPages('backToHome')}
          </Link>
          <h1 className="text-5xl lg:text-7xl font-bold tracking-tight mt-2">{tReleases('heading')}</h1>
          <p className="text-xl text-muted-foreground font-serif mt-3">{tReleases('subheading')}</p>
        </div>
        <ReleasesPageContent releases={releases} />
      </div>
    </main>
  )
}