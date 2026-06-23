export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getArtistBySlug } from '@/lib/api/artists'
import { getPressKitForArtist } from '@/lib/api/pressKit'
import { getConcertsByArtistId } from '@/lib/api/concerts'
import { getPublicArtistEpkByArtistId } from '@/lib/api/publicArtistEpk'
import { listEpkFonts, buildEpkFontPublicUrl } from '@/lib/api/epkFonts'
import { hydrateDocumentFonts } from '@/lib/epk/editor/hydrateDocumentFonts'
import {
  getPublicArtistEpk,
  getJournalistArtistEpk,
  resolvePublishedBioShort,
  resolvePublishedPressQuote,
  type JournalistArtistEpk,
  type PressLocale,
} from '@/lib/api/artistProfiles'
import { logBioEvent } from '@/lib/api/bioEvents'
import { getDictionary, getLocale } from '@/i18n/getDictionary'
import { stripHtmlToPlainText } from '@/lib/press/bioText'
import { buildPressEpkSchema, serializeJsonLd } from '@/lib/seo/jsonld'
import type { Database } from '@/types/database'
import type { EpkEditorMode } from '@/lib/epk/schema/documentV2'
import { ArtistEpkClient } from './_components/ArtistEpkClient'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const supabase = await createServerSupabaseClient()
  const [artist, locale] = await Promise.all([
    getArtistBySlug(supabase, slug).catch(() => null),
    getLocale().then((l) => (l === 'en' ? 'en' : 'de') as PressLocale),
  ])
  if (!artist) {
    return { title: 'Artist Press Kit' }
  }

  const publicEpk = await getPublicArtistEpk(supabase, artist.id, locale).catch(() => null)
  const description = publicEpk?.bioShort
    ? stripHtmlToPlainText(publicEpk.bioShort).slice(0, 160)
    : artist.bio?.slice(0, 160)

  return {
    title: `${artist.name} — Press Kit`,
    description: description ?? `${artist.name} press kit on darkTunes Music Group`,
    openGraph: {
      title: `${artist.name} — Press Kit`,
      description,
      images: artist.imageUrl ? [{ url: artist.imageUrl }] : [],
      type: 'website',
    },
  }
}

async function resolvePressAccessLevel(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
): Promise<'public' | 'journalist'> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return 'public'

  const { data: userProfile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (userProfile && ['journalist', 'admin'].includes(userProfile.role)) {
    return 'journalist'
  }
  return 'public'
}

export default async function ArtistEpkPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createServerSupabaseClient()
  const artist = await getArtistBySlug(supabase, slug).catch(() => null)
  if (!artist) notFound()

  const { serverEnv } = await import('@/lib/env.server')
  const publicClient = createClient<Database>(
    serverEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  )

  const [accessLevel, locale] = await Promise.all([
    resolvePressAccessLevel(supabase),
    getLocale().then((l) => (l === 'en' ? 'en' : 'de') as PressLocale),
  ])

  const [canvasEpk, bioProfile, photos, concerts, fonts] = await Promise.all([
    getPublicArtistEpkByArtistId(publicClient, artist.id).catch(() => null),
    accessLevel === 'journalist'
      ? getJournalistArtistEpk(supabase, artist.id).catch(() => null)
      : getPublicArtistEpk(supabase, artist.id, locale).catch(() => null),
    getPressKitForArtist(supabase, artist.id).catch(() => []),
    getConcertsByArtistId(supabase, artist.id).catch(() => []),
    listEpkFonts(publicClient, artist.id).catch(() => []),
  ])

  const hydratedDocument =
    canvasEpk?.document && fonts.length > 0
      ? hydrateDocumentFonts(
          canvasEpk.document,
          fonts.map((font) => ({
            id: font.id,
            publicUrl: buildEpkFontPublicUrl(font.r2Key, serverEnv.CLOUDFLARE_R2_PUBLIC_URL),
          })),
        )
      : canvasEpk?.document ?? null

  const epkEditorMode = (canvasEpk?.profile.epkEditorMode ?? 'legacy') as EpkEditorMode

  const {
    data: { user },
  } = await supabase.auth.getUser()
  let journalistId: string | null = null
  if (user) {
    const { data: userProfile } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle()
    if (userProfile && ['journalist', 'admin'].includes(userProfile.role)) {
      journalistId = user.id
    }
  }

  void logBioEvent(supabase, {
    artistId: artist.id,
    eventType: 'view',
    journalistId,
    locale,
    tier: 'short',
  }).catch(() => undefined)

  const journalistProfile =
    accessLevel === 'journalist' && bioProfile ? (bioProfile as JournalistArtistEpk) : null
  const shortBioHtml = journalistProfile
    ? resolvePublishedBioShort(journalistProfile, locale)
    : bioProfile?.bioShort
  const pressQuote = journalistProfile
    ? resolvePublishedPressQuote(journalistProfile, locale)
    : bioProfile?.pressQuote
  const schemaDescription = shortBioHtml ? stripHtmlToPlainText(shortBioHtml) : undefined
  const uiLocale = locale === 'en' ? 'en' : 'de'
  const dict = await getDictionary(uiLocale)

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(
            buildPressEpkSchema({
              artist,
              description: schemaDescription,
              pressQuote,
            }),
          ),
        }}
      />
      <ArtistEpkClient
        artist={artist}
        profile={bioProfile}
        canvasDocument={hydratedDocument}
        epkEditorMode={epkEditorMode}
        photos={photos}
        concerts={concerts}
        accessLevel={accessLevel}
        locale={locale}
        dict={dict.press}
      />
    </>
  )
}