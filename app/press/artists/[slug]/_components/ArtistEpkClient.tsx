'use client'

import { useState } from 'react'
import { sanitizeHtml as sanitizeHtmlSafe } from '@/lib/sanitizeHtml'
import DOMPurify from 'dompurify'
import Image from 'next/image'
import Link from 'next/link'
import {
  CalendarBlank,
  Check,
  Copy,
  DownloadSimple,
  Globe,
  InstagramLogo,
  MusicNotes,
  Quotes,
  SpotifyLogo,
  YoutubeLogo,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getOptimizedImageUrl } from '@/lib/imageUtils'
import { PressPhotoLightbox } from '@/components/press/PressPhotoLightbox'
import { EpkPublicViewer } from '@/components/epk-builder/EpkPublicViewer'
import type { EpkDocumentV2, EpkEditorMode } from '@/lib/epk/schema/documentV2'
import { cn } from '@/lib/utils'
import type { Dictionary } from '@/i18n/types'
import type { Artist, Concert, PressAsset } from '@/types'
import {
  resolvePublishedBioLong,
  resolvePublishedBioMedium,
  resolvePublishedBioShort,
  resolvePublishedPressQuote,
  type JournalistArtistEpk,
  type PressLocale,
  type PublicArtistEpk,
} from '@/lib/api/artistProfiles'
import { downloadArtistBio } from '../../../_actions/bioDownload'
import { trackBioEvent } from '../../../_actions/bioEvent'
import type { BioDownloadTier } from '@/lib/press/bioAssetKey'
import { toast } from 'sonner'

type PressEpkProfile = PublicArtistEpk | JournalistArtistEpk | null
type PressEpkDict = Dictionary['press']

/** Plain-text length above which a bio card shows read-more toggle. */
const BIO_COLLAPSE_CHAR_THRESHOLD = 320

interface ArtistEpkClientProps {
  artist: Artist
  profile: PressEpkProfile
  canvasDocument: EpkDocumentV2 | null
  epkEditorMode: EpkEditorMode
  photos: PressAsset[]
  concerts: Concert[]
  accessLevel: 'public' | 'journalist'
  locale: PressLocale
  dict: PressEpkDict
}

function isJournalistProfile(profile: PressEpkProfile): profile is JournalistArtistEpk {
  return profile !== null && 'bioMedium' in profile
}

function pressAssetTitle(photo: PressAsset): string {
  return photo.pressCaption ?? photo.originalFilename
}

function sanitizeHtml(html: string): string {
  return sanitizeHtmlSafe(html)
}

function stripHtmlTags(html: string): string {
  if (typeof window === 'undefined') return html.replace(/<[^>]*>/g, '')
  const tmp = document.createElement('div')
  tmp.innerHTML = DOMPurify.sanitize(html)
  return tmp.textContent ?? tmp.innerText ?? ''
}

function tierAriaLabel(template: string, tier: BioDownloadTier): string {
  return template.replace('{tier}', tier)
}

function CopyButton({
  text,
  dict,
  artistId,
  locale,
  tier,
}: {
  text: string
  dict: PressEpkDict
  artistId: string
  locale: PressLocale
  tier: BioDownloadTier
}) {
  const [copied, setCopied] = useState(false)

  const onCopy = async () => {
    await navigator.clipboard.writeText(stripHtmlTags(text))
    void trackBioEvent({ artistId, eventType: 'copy', locale, tier })
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <Button variant="outline" size="sm" onClick={() => void onCopy()} className="gap-2">
      {copied ? <Check size={14} weight="bold" aria-hidden="true" /> : <Copy size={14} weight="bold" aria-hidden="true" />}
      {copied ? dict.bioCopied : dict.copyBio}
    </Button>
  )
}

const SOCIAL_LINKS = [
  { key: 'spotifyUrl', label: 'Spotify', icon: SpotifyLogo },
  { key: 'instagramUrl', label: 'Instagram', icon: InstagramLogo },
  { key: 'youtubeUrl', label: 'YouTube', icon: YoutubeLogo },
  { key: 'websiteUrl', label: 'Website', icon: Globe },
  { key: 'bandcampUrl', label: 'Bandcamp', icon: MusicNotes },
] as const

function triggerBase64Download(filename: string, mimeType: string, dataBase64: string) {
  const bytes = Uint8Array.from(atob(dataBase64), (char) => char.charCodeAt(0))
  const blob = new Blob([bytes], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

function BioDownloadButtons({
  artistId,
  locale,
  tier,
  dict,
}: {
  artistId: string
  locale: PressLocale
  tier: BioDownloadTier
  dict: PressEpkDict
}) {
  const [loading, setLoading] = useState<'txt' | 'pdf' | null>(null)

  const handleDownload = async (format: 'txt' | 'pdf') => {
    setLoading(format)
    try {
      const result = await downloadArtistBio({ artistId, locale, tier, format })
      if (!result.ok) {
        toast.error(dict.downloadFailedJournalist)
        return
      }
      triggerBase64Download(result.filename, result.mimeType, result.dataBase64)
      toast.success(dict.bioDownloaded)
    } catch {
      toast.error(dict.downloadFailed)
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-2"
        disabled={loading !== null}
        onClick={() => void handleDownload('txt')}
        aria-label={tierAriaLabel(dict.downloadBioTxtAria, tier)}
      >
        <DownloadSimple size={14} weight="bold" aria-hidden="true" />
        {loading === 'txt' ? '…' : 'TXT'}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-2"
        disabled={loading !== null}
        onClick={() => void handleDownload('pdf')}
        aria-label={tierAriaLabel(dict.downloadBioPdfAria, tier)}
      >
        <DownloadSimple size={14} weight="bold" aria-hidden="true" />
        {loading === 'pdf' ? '…' : 'PDF'}
      </Button>
    </div>
  )
}

function BioCard({
  label,
  text,
  dict,
  artistId,
  locale,
  tier,
  showDownloads,
}: {
  label: string
  text: string
  dict: PressEpkDict
  artistId?: string
  locale?: PressLocale
  tier?: BioDownloadTier
  showDownloads?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const plainLength = stripHtmlTags(text).length
  const isTruncatable = plainLength > BIO_COLLAPSE_CHAR_THRESHOLD

  return (
    <Card className="border-border bg-card/70">
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-base">{label}</CardTitle>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {showDownloads && artistId && locale && tier ? (
            <BioDownloadButtons artistId={artistId} locale={locale} tier={tier} dict={dict} />
          ) : null}
          {artistId && locale && tier ? (
            <CopyButton text={text} dict={dict} artistId={artistId} locale={locale} tier={tier} />
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div
          suppressHydrationWarning
          className={cn(
            'prose prose-invert max-w-none text-sm leading-relaxed text-muted-foreground prose-p:mb-2 prose-p:last:mb-0',
            !expanded && isTruncatable && 'max-h-48 overflow-hidden',
          )}
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(text) }}
        />
        {isTruncatable ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-auto px-0 text-primary hover:text-primary/80"
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? dict.readLess : dict.readMore}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  )
}

function JournalistGateCard({ label, dict }: { label: string; dict: PressEpkDict }) {
  return (
    <Card className="border-border bg-card/70">
      <CardHeader>
        <CardTitle className="text-base">{label}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{dict.journalistGateMessage}</p>
        <Button asChild variant="outline" size="sm">
          <Link href="/press/apply">{dict.applyForPressAccess}</Link>
        </Button>
      </CardContent>
    </Card>
  )
}

export function ArtistEpkClient({
  artist,
  profile,
  canvasDocument,
  epkEditorMode,
  photos,
  concerts,
  accessLevel,
  locale,
  dict,
}: ArtistEpkClientProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(0)
  const [exportingPdf, setExportingPdf] = useState(false)

  const showCanvasEpk = Boolean(canvasDocument && epkEditorMode === 'canvas')
  const imagePhotos = photos.filter((photo) => photo.mimeType.startsWith('image/'))

  const openLightbox = (photoId: string) => {
    const index = imagePhotos.findIndex((photo) => photo.id === photoId)
    if (index < 0) return
    setLightboxIndex(index)
    setLightboxOpen(true)
  }

  const handleDownloadPressKitPdf = async () => {
    if (!artist.slug) return
    setExportingPdf(true)
    try {
      const res = await fetch(`/api/epk/press/${artist.slug}/export`)
      if (!res.ok) throw new Error('export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${artist.name.replace(/\s+/g, '-').toLowerCase()}-press-kit.pdf`
      anchor.click()
      URL.revokeObjectURL(url)
      toast.success(dict.bioDownloaded)
    } catch {
      toast.error(dict.downloadFailed)
    } finally {
      setExportingPdf(false)
    }
  }

  const journalistProfile = isJournalistProfile(profile) ? profile : null
  const shortBio =
    journalistProfile
      ? resolvePublishedBioShort(journalistProfile, locale)
      : profile?.bioShort ?? artist.bio
  const pressQuote = journalistProfile
    ? resolvePublishedPressQuote(journalistProfile, locale)
    : profile?.pressQuote

  const visibleBios =
    accessLevel === 'journalist' && journalistProfile
      ? [
          { label: dict.bioShortHeading, tier: 'short' as const, text: resolvePublishedBioShort(journalistProfile, locale) },
          { label: dict.bioMediumHeading, tier: 'medium' as const, text: resolvePublishedBioMedium(journalistProfile, locale) },
          {
            label: dict.bioLongHeading,
            tier: 'long' as const,
            text: resolvePublishedBioLong(journalistProfile, locale) || artist.bio,
          },
        ].filter((item): item is { label: string; tier: BioDownloadTier; text: string } => Boolean(item.text))
      : shortBio
        ? [{ label: dict.bioShortHeading, tier: 'short' as const, text: shortBio }]
        : []

  const showJournalistGate = accessLevel === 'public'

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-4 py-10 sm:px-6 lg:px-8">
        <Button asChild variant="ghost" className="w-fit px-0 text-muted-foreground hover:text-foreground">
          <Link href="/press">{dict.epkBack}</Link>
        </Button>

        <section className="grid gap-6 rounded-3xl border border-border bg-card/60 p-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-center lg:p-8">
          <div className="space-y-4">
            <p className="text-sm uppercase tracking-[0.2em] text-primary">{dict.epkHeroLabel}</p>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">{artist.name}</h1>
            <p className="text-muted-foreground">{artist.genres.join(' · ')}</p>
            <div className="flex flex-wrap gap-3">
              {SOCIAL_LINKS.map(({ key, label, icon: Icon }) => {
                const href = artist[key]
                if (!href) return null
                return (
                  <Button key={key} asChild variant="outline">
                    <a href={href} target="_blank" rel="noopener noreferrer" className="gap-2">
                      <Icon size={16} weight="bold" aria-hidden="true" />
                      {label}
                    </a>
                  </Button>
                )
              })}
              {artist.logoUrl && (
                <div className="flex flex-col items-start gap-2">
                  <div className="relative h-20 w-auto">
                    <Image
                      src={artist.logoUrl}
                      alt={`${artist.name} logo`}
                      width={200}
                      height={80}
                      className="h-20 w-auto object-contain"
                      unoptimized
                    />
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <a href={artist.logoUrl} target="_blank" rel="noopener noreferrer" download>
                      <DownloadSimple size={16} weight="bold" aria-hidden="true" />
                      {dict.downloadLogo}
                    </a>
                  </Button>
                </div>
              )}
            </div>
          </div>
          <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-border bg-background/50">
            <Image
              src={getOptimizedImageUrl(artist.imageUrl, 1200)}
              alt={`${artist.name} – artist photo`}
              fill
              className="object-cover"
              priority
              unoptimized
            />
          </div>
        </section>

        {showCanvasEpk && canvasDocument && (
          <section aria-labelledby="artist-canvas-epk" className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 id="artist-canvas-epk" className="text-2xl font-bold tracking-tight">
                Press Kit
              </h2>
              <Button
                type="button"
                variant="outline"
                className="min-h-[44px] gap-2"
                disabled={exportingPdf}
                onClick={() => void handleDownloadPressKitPdf()}
              >
                <DownloadSimple size={16} weight="bold" aria-hidden="true" />
                {exportingPdf ? '…' : 'PDF'}
              </Button>
            </div>
            <div className="rounded-3xl border border-border bg-card/60 p-6">
              <EpkPublicViewer document={canvasDocument} artistName={artist.name} />
            </div>
          </section>
        )}

        {(visibleBios.length > 0 || showJournalistGate) && (
          <section aria-labelledby="artist-bios" className="space-y-4">
            <h2 id="artist-bios" className="text-2xl font-bold tracking-tight">
              {dict.biosHeading}
            </h2>
            <div
              className={cn(
                'grid grid-cols-1 gap-4',
                visibleBios.length + (showJournalistGate ? 2 : 0) >= 3 && 'lg:grid-cols-3',
                visibleBios.length + (showJournalistGate ? 2 : 0) === 2 && 'lg:grid-cols-2',
              )}
            >
              {visibleBios.map((bio) => (
                <BioCard
                  key={bio.tier}
                  label={bio.label}
                  text={bio.text}
                  dict={dict}
                  artistId={artist.id}
                  locale={locale}
                  tier={bio.tier}
                  showDownloads={accessLevel === 'journalist'}
                />
              ))}
              {showJournalistGate && (
                <>
                  <JournalistGateCard label={dict.bioMediumHeading} dict={dict} />
                  <JournalistGateCard label={dict.bioLongHeading} dict={dict} />
                </>
              )}
            </div>
          </section>
        )}

        <section aria-labelledby="artist-photos" className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 id="artist-photos" className="text-2xl font-bold tracking-tight">
              {dict.pressPhotosHeading}
            </h2>
            <p className="text-sm text-muted-foreground">{dict.pressPhotosDescription}</p>
          </div>
          {photos.length === 0 ? (
            <p className="text-sm text-muted-foreground">{dict.noPressPhotos}</p>
          ) : (
            <ul className="grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 xl:grid-cols-3">
              {photos.map((photo) => (
                <li key={photo.id} className="overflow-hidden rounded-2xl border border-border bg-card/70">
                  {photo.mimeType.startsWith('image/') ? (
                    <button
                      type="button"
                      className="group relative block aspect-square w-full overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => openLightbox(photo.id)}
                      aria-label={`View ${pressAssetTitle(photo)}`}
                    >
                      <Image
                        src={getOptimizedImageUrl(photo.publicUrl, 1000)}
                        alt={photo.altText ?? `${artist.name} – press photo`}
                        fill
                        className="object-cover transition-transform duration-300 group-hover:scale-105"
                        unoptimized
                      />
                    </button>
                  ) : (
                    <div className="flex aspect-square items-center justify-center bg-card p-6 text-center text-sm text-muted-foreground">
                      {pressAssetTitle(photo)}
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{pressAssetTitle(photo)}</p>
                      <p className="text-sm text-muted-foreground">{photo.pressCategory ?? 'photo'}</p>
                    </div>
                    <Button asChild variant="outline">
                      <a href={photo.publicUrl} target="_blank" rel="noopener noreferrer" download>
                        <DownloadSimple size={16} weight="bold" aria-hidden="true" />
                        {dict.downloadPhoto}
                      </a>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {pressQuote && (
          <section aria-labelledby="artist-quote" className="rounded-3xl border border-border bg-card/60 p-6">
            <div className="flex items-start gap-4">
              <Quotes size={28} weight="fill" aria-hidden="true" className="mt-1 text-primary" />
              <div className="space-y-2">
                <h2 id="artist-quote" className="text-2xl font-bold tracking-tight">
                  {dict.quotesHeading}
                </h2>
                <blockquote className="text-lg italic leading-relaxed text-muted-foreground">{pressQuote}</blockquote>
              </div>
            </div>
          </section>
        )}

        <PressPhotoLightbox
          photos={imagePhotos}
          initialIndex={lightboxIndex}
          open={lightboxOpen}
          onClose={() => setLightboxOpen(false)}
          artistName={artist.name}
        />

        <section aria-labelledby="artist-tour" className="space-y-4">
          <h2 id="artist-tour" className="text-2xl font-bold tracking-tight">
            {dict.tourDatesHeading}
          </h2>
          {concerts.length === 0 ? (
            <p className="text-sm text-muted-foreground">{dict.noTourDates}</p>
          ) : (
            <div className="space-y-3">
              {concerts.map((concert) => (
                <Card key={concert.id} className="border-border bg-card/70">
                  <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                      <CalendarBlank size={20} weight="bold" aria-hidden="true" className="mt-0.5 text-primary" />
                      <div>
                        <p className="font-semibold">
                          {concert.eventName || concert.venueName || dict.liveShowFallback}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {[concert.venueName, concert.venueCity, concert.venueCountry].filter(Boolean).join(' · ')}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(concert.concertDate).toLocaleDateString(locale === 'en' ? 'en-GB' : 'de-DE')}
                        </p>
                      </div>
                    </div>
                    {concert.ticketUrl && concert.status !== 'cancelled' && (
                      <Button asChild variant="outline">
                        <a href={concert.ticketUrl} target="_blank" rel="noopener noreferrer">
                          {dict.tickets}
                        </a>
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}