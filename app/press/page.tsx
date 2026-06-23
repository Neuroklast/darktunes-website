export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { getDictionary, getLocale } from '@/i18n/getDictionary'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getPublicArtists } from '@/lib/api/artists'
import { getPublicArtistEpksByArtistIds, type PublicArtistEpk } from '@/lib/api/artistProfiles'
import { getPressOnlyNewsPosts } from '@/lib/api/pressReleases'
import { getSiteSettings } from '@/lib/api/siteSettings'
import { PressLandingClient } from './_components/PressLandingClient'

export const metadata: Metadata = {
  title: 'Press & Media — darkTunes Music Group',
  description: 'Label press portal with artist press kits, media contacts, and exclusive press releases.',
}

export default async function PressPage() {
  const locale = await getLocale()
  const dict = await getDictionary(locale)
  const supabase = await createServerSupabaseClient()

  const pressLocale = locale === 'en' ? 'en' : 'de'

  const [artists, pressReleases, siteSettings] = await Promise.all([
    getPublicArtists(supabase).catch((err: unknown) => {
      console.error('[press/page] Failed to fetch artists:', err)
      return []
    }),
    getPressOnlyNewsPosts(supabase).then((posts) => posts.slice(0, 6)).catch((err: unknown) => {
      console.error('[press/page] Failed to fetch press releases:', err)
      return []
    }),
    getSiteSettings(supabase).catch((err: unknown) => {
      console.error('[press/page] Failed to fetch site settings:', err)
      return {
        labelName: 'darkTunes Music Group',
        labelTagline: '',
        contactEmail: 'info@darktunes.com',
        impressumPhone: '',
        impressumEmail: 'info@darktunes.com',
      }
    }),
  ])

  const artistEpksMap = await getPublicArtistEpksByArtistIds(
    supabase,
    artists.map((a) => a.id),
    pressLocale,
  ).catch((err: unknown) => {
    console.error('[press/page] Failed to fetch artist EPK bios:', err)
    return new Map<string, PublicArtistEpk>()
  })

  const artistEpks = Object.fromEntries(artistEpksMap) as Record<string, PublicArtistEpk>

  return (
    <PressLandingClient
      artists={artists}
      artistEpks={artistEpks}
      pressReleases={pressReleases}
      siteSettings={siteSettings}
      dict={dict}
    />
  )
}
