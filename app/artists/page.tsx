/**
 * app/artists/page.tsx — Dedicated artists grid page (RSC)
 *
 * Shows all public artists as a photo grid.
 * Hovering a card reveals the band logo (if set) or the artist name.
 * Clicking opens the artist detail page.
 */

import Link from 'next/link'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { getCachedPublicArtists } from '@/lib/cache/publicQueries'
import { getRequestOrganizationId } from '@/lib/organizations/requestContext'
import { ArtistsGridContent } from './_components/ArtistsGridContent'
import { getMetadataBrand, pageTitle } from '@/lib/seo/metadata'

export async function generateMetadata(): Promise<Metadata> {
  const { labelName } = await getMetadataBrand()
  const title = pageTitle('Artists', labelName)
  return {
    title,
    openGraph: { title, type: 'website' },
  }
}

export default async function ArtistsPage() {
  const orgId = await getRequestOrganizationId()
  const [artists, tNav] = await Promise.all([
    getCachedPublicArtists(orgId),
    getTranslations('navigation'),
  ])

  return (
    <main id="main-content" className="min-h-screen bg-background">
      <div className="container mx-auto px-4 lg:px-16 pt-36 pb-24">
        <div className="mb-12">
          <Link
            href="/"
            className="text-xs text-muted-foreground hover:text-accent font-mono uppercase tracking-widest mb-6 inline-block"
          >
            ← {tNav('home')}
          </Link>
          <h1 className="text-5xl lg:text-7xl font-bold tracking-tight mt-2">{tNav('artists')}</h1>
        </div>
        <ArtistsGridContent artists={artists} />
      </div>
    </main>
  )
}