/**
 * app/api/epk/press/[slug]/export/route.ts
 *
 * GET — server-side EPK PDF export from the public press artist page.
 * Logs downloads with source `press` for portal analytics.
 */

import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandler, ApiError } from '@/lib/errors'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import { getPublicArtistBySlug } from '@/lib/api/publicArtist'
import { getPublicArtistEpkByArtistId } from '@/lib/api/publicArtistEpk'
import { listEpkFonts, buildEpkFontPublicUrl } from '@/lib/api/epkFonts'
import { ensureDocumentFontsForExport } from '@/lib/epk/editor/ensureDocumentFontsForExport'
import { generateEpkPdfBytes } from '@/lib/epk/export/generateEpkPdfBytes'
import { checkRateLimit, getClientIp } from '@/lib/ipRateLimit'
import { recordEpkDownloadAsync } from '@/lib/epk/recordEpkDownload'

export const maxDuration = 60

function extractSlug(req: NextRequest): string {
  const segments = req.nextUrl.pathname.split('/')
  const exportIndex = segments.lastIndexOf('export')
  const slug = exportIndex > 0 ? segments[exportIndex - 1] : ''
  if (!slug) throw new ApiError(400, 'Missing artist slug')
  return slug
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const slug = extractSlug(req)
  const ip = getClientIp(req)
  const { limited } = checkRateLimit(`epk-press-export:${ip}:${slug}`, 10, 10 * 60_000)
  if (limited) throw new ApiError(429, 'Too many export requests. Please try again later.')

  const { serverEnv } = await import('@/lib/env.server')
  const db = await createServiceRoleSupabaseClient()

  const artist = await getPublicArtistBySlug(db, slug)
  if (!artist?.isVisible) throw new ApiError(404, 'Artist not found')

  const publicEpk = await getPublicArtistEpkByArtistId(db, artist.id)
  if (!publicEpk?.document || publicEpk.profile.epkEditorMode !== 'canvas') {
    throw new ApiError(404, 'Canvas EPK not available')
  }

  const fonts = await listEpkFonts(db, artist.id).catch(() => [])
  const document = ensureDocumentFontsForExport(
    publicEpk.document,
    fonts.map((font) => ({
      id: font.id,
      name: font.name,
      r2Key: font.r2Key,
      publicUrl: buildEpkFontPublicUrl(font.r2Key, serverEnv.CLOUDFLARE_R2_PUBLIC_URL),
    })),
  )

  const pdfBytes = await generateEpkPdfBytes({
    document,
  })

  recordEpkDownloadAsync({
    artistId: artist.id,
    source: 'press',
    ip,
    userAgent: req.headers.get('user-agent') ?? undefined,
  })

  const filename = `${slugify(artist.name)}-press-kit.pdf`
  return new NextResponse(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
})

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'press-kit'
}