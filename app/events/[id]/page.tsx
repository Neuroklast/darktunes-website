/**
 * app/events/[id]/page.tsx — Public event detail page (RSC)
 *
 * Looks up the concert by UUID from the cached public concerts list,
 * then renders EventDetailContent with the concert data and i18n dictionary.
 */

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getLocale } from 'next-intl/server'
import { toBcp47 } from '@/i18n/locales'
import { getCachedPublicConcerts } from '@/lib/cache/publicQueries'

import { EventDetailContent } from './_components/EventDetailContent'
import { entityTitle, getMetadataBrand, pageTitle } from '@/lib/seo/metadata'

export const revalidate = 60

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const concerts = await getCachedPublicConcerts()
  const concert = concerts.find((c) => c.id === id)
  const { labelName } = await getMetadataBrand()
  if (!concert) return { title: pageTitle('Event not found', labelName) }

  const locale = await getLocale()
  const dateLocale = toBcp47(locale)
  const formattedDate = new Date(concert.concertDate).toLocaleDateString(dateLocale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const title = entityTitle(concert.eventName, concert.artistName, labelName)
  const description = `${concert.artistName} live · ${formattedDate}${concert.venueCity ? ` · ${concert.venueCity}` : ''}`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
    },
  }
}

export default async function EventDetailPage({ params }: Props) {
  const { id } = await params

  const concerts = await getCachedPublicConcerts()

  const concert = concerts.find((c) => c.id === id)
  if (!concert) notFound()

  return (
    <EventDetailContent concert={concert} />
  )
}
