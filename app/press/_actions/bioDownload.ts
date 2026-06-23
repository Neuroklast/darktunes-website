'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getArtistById } from '@/lib/api/artists'
import {
  getJournalistArtistEpk,
  resolvePublishedBioLong,
  resolvePublishedBioMedium,
  resolvePublishedBioShort,
  resolvePublishedPressQuote,
  type PressLocale,
} from '@/lib/api/artistProfiles'
import { logBioEvent } from '@/lib/api/bioEvents'
import { logDownload } from '@/lib/api/journalistDownloads'
import { buildBioAssetKey, type BioDownloadFormat, type BioDownloadTier } from '@/lib/press/bioAssetKey'
import { buildBioTxtDocument, stripHtmlToPlainText } from '@/lib/press/bioText'
import { renderBioPdfBuffer } from '@/lib/press/renderBioPdf'

const TIER_LABELS: Record<BioDownloadTier, string> = {
  short: 'Short Bio',
  medium: 'Medium Bio',
  long: 'Long Bio',
}

export interface BioDownloadResult {
  ok: true
  filename: string
  mimeType: string
  dataBase64: string
}

export async function downloadArtistBio(input: {
  artistId: string
  locale: PressLocale
  tier: BioDownloadTier
  format: BioDownloadFormat
}): Promise<{ ok: false } | BioDownloadResult> {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false }

    const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
    if (!profile || !['journalist', 'admin'].includes(profile.role)) return { ok: false }

    const [artist, epk] = await Promise.all([
      getArtistById(supabase, input.artistId).catch(() => null),
      getJournalistArtistEpk(supabase, input.artistId).catch(() => null),
    ])
    if (!artist || !epk) return { ok: false }

    const html =
      input.tier === 'short'
        ? resolvePublishedBioShort(epk, input.locale)
        : input.tier === 'medium'
          ? resolvePublishedBioMedium(epk, input.locale)
          : resolvePublishedBioLong(epk, input.locale)
    if (!html?.trim()) return { ok: false }

    const plain = stripHtmlToPlainText(html)
    const pressQuote =
      input.tier === 'short' ? resolvePublishedPressQuote(epk, input.locale) : undefined
    const tierLabel = TIER_LABELS[input.tier]
    const safeName = artist.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()
    const localeSuffix = input.locale === 'en' ? '-en' : '-de'

    if (input.format === 'txt') {
      const txt = buildBioTxtDocument(artist.name, tierLabel, plain, pressQuote)
      const filename = `${safeName}-${input.tier}-bio${localeSuffix}.txt`
      await Promise.all([
        logDownload(supabase, {
          journalist_id: user.id,
          release_id: null,
          artist_id: artist.id,
          asset_key: buildBioAssetKey(artist.id, input.locale, input.tier, 'txt'),
        }),
        logBioEvent(supabase, {
          artistId: artist.id,
          eventType: 'download',
          journalistId: user.id,
          locale: input.locale,
          tier: input.tier,
          format: 'txt',
        }),
      ])
      return {
        ok: true,
        filename,
        mimeType: 'text/plain;charset=utf-8',
        dataBase64: Buffer.from(txt, 'utf-8').toString('base64'),
      }
    }

    const pdfBuffer = await renderBioPdfBuffer({
      artistName: artist.name,
      tierLabel,
      body: plain,
      pressQuote,
    })
    const filename = `${safeName}-${input.tier}-bio${localeSuffix}.pdf`
    await Promise.all([
      logDownload(supabase, {
        journalist_id: user.id,
        release_id: null,
        artist_id: artist.id,
        asset_key: buildBioAssetKey(artist.id, input.locale, input.tier, 'pdf'),
      }),
      logBioEvent(supabase, {
        artistId: artist.id,
        eventType: 'download',
        journalistId: user.id,
        locale: input.locale,
        tier: input.tier,
        format: 'pdf',
      }),
    ])
    return {
      ok: true,
      filename,
      mimeType: 'application/pdf',
      dataBase64: pdfBuffer.toString('base64'),
    }
  } catch {
    return { ok: false }
  }
}