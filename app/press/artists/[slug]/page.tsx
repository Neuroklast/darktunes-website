export const dynamic = 'force-dynamic'

import { cache } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createServerSupabaseClient, createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import { createPublicSupabaseClient } from '@/lib/supabase/publicClient'
import { getPublicArtistBySlug } from '@/lib/api/publicArtist'
import { getPressKitForArtist } from '@/lib/api/pressKit'
import { getConcertsByArtistId } from '@/lib/api/concerts'
import { getPublicArtistEpkByArtistId } from '@/lib/api/publicArtistEpk'
import { listEpkFonts, buildEpkFontPublicUrl } from '@/lib/api/epkFonts'
import { hydrateDocumentFonts } from '@/lib/epk/editor/hydrateDocumentFonts'
import { ArtistEpkClient } from './_components/ArtistEpkClient'

const getArtist = cache(async (slug: string) => {
  const publicClient = createPublicSupabaseClient()
  return getPublicArtistBySlug(publicClient, slug).catch(() => null)
})

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const artist = await getArtist(slug)
  return {
    title: artist ? `${artist.name} — Press Kit` : 'Artist Press Kit',
  }
}

export default async function ArtistEpkPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const artist = await getArtist(slug)
  if (!artist) notFound()

  const { serverEnv } = await import('@/lib/env.server')
  const supabase = await createServerSupabaseClient()
  const serviceDb = await createServiceRoleSupabaseClient()
  const publicClient = createPublicSupabaseClient()

  const [publicEpk, photos, concerts, fonts] = await Promise.all([
    getPublicArtistEpkByArtistId(serviceDb, artist.id).catch(() => null),
    getPressKitForArtist(supabase, artist.id).catch(() => []),
    getConcertsByArtistId(supabase, artist.id).catch(() => []),
    listEpkFonts(publicClient, artist.id).catch(() => []),
  ])

  const hydratedDocument =
    publicEpk?.document && fonts.length > 0
      ? hydrateDocumentFonts(
          publicEpk.document,
          fonts.map((font) => ({
            id: font.id,
            publicUrl: buildEpkFontPublicUrl(font.r2Key, serverEnv.CLOUDFLARE_R2_PUBLIC_URL),
          })),
        )
      : publicEpk?.document ?? null

  return (
    <ArtistEpkClient
      artist={artist}
      profile={publicEpk?.profile ?? null}
      canvasDocument={hydratedDocument}
      photos={photos}
      concerts={concerts}
    />
  )
}