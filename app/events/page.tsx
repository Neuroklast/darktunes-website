/**
 * app/events/page.tsx — Public events listing page (RSC)
 *
 * Shows all upcoming concerts as a filterable list.
 * Each event card shows date, venue, and a ticket link.
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { getCachedPublicConcerts } from '@/lib/cache/publicQueries'
import { getRequestOrganizationId } from '@/lib/organizations/requestContext'
import { EventsPageContent } from './_components/EventsPageContent'
import { getMetadataBrand, pageTitle } from '@/lib/seo/metadata'

export const revalidate = 60

export async function generateMetadata(): Promise<Metadata> {
  const { labelName } = await getMetadataBrand()
  return {
    title: pageTitle('Events', labelName),
    description: `Browse all upcoming live events from ${labelName} artists.`,
  }
}

export default async function EventsPage() {
  const orgId = await getRequestOrganizationId()
  const [concerts, tPages, tConcerts] = await Promise.all([
    getCachedPublicConcerts(orgId),
    getTranslations('pages'),
    getTranslations('concerts'),
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
          <h1 className="text-5xl lg:text-7xl font-bold tracking-tight mt-2">{tConcerts('heading')}</h1>
          <p className="text-xl text-muted-foreground font-serif mt-3">{tConcerts('subheading')}</p>
        </div>
        <EventsPageContent concerts={concerts} />
      </div>
    </main>
  )
}