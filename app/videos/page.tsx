/**
 * app/videos/page.tsx — All Videos page with search (RSC)
 *
 * Full-page video browser with client-side search by title and artist.
 * Linked from the homepage Videos section when videosLinkToPage is enabled.
 */

import type { Metadata } from 'next'
import { getCachedPublicVideos, getCachedSiteSettings } from '@/lib/cache/publicQueries'
import { getRequestOrganizationId } from '@/lib/organizations/requestContext'
import { getMetadataBrand, pageTitle } from '@/lib/seo/metadata'
import { VideosPageContent } from './_components/VideosPageContent'

export const revalidate = 60

export async function generateMetadata(): Promise<Metadata> {
  const { labelName } = await getMetadataBrand()
  return {
    title: pageTitle('Videos', labelName),
    description: `Watch all music videos from ${labelName}`,
  }
}

export default async function VideosPage() {
  const orgId = await getRequestOrganizationId()
  const [settings] = await Promise.all([
    getCachedSiteSettings(orgId),
  ])

  const videos = await getCachedPublicVideos({
    excludeShorts: settings?.excludeShortsFromPublic ?? false,
    organizationId: orgId,
  })

  return (
    <VideosPageContent
      videos={videos}
      placeholderUrl={settings?.consentPlaceholderUrl || undefined}
      videosPerPage={settings?.videosPerPage ?? 9}
    />
  )
}