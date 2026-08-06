'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
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
import { PressPhotoLightbox } from '@/components/press/PressPhotoLightbox'
import type { Concert, PressAsset } from '@/types'
import type { PublicArtist } from '@/lib/api/publicArtist'
import type { PublicArtistEpk } from '@/lib/api/publicArtistEpk'
import type { EpkDocumentV2 } from '@/lib/epk/schema/documentV2'
import { EpkPublicViewer } from '@/components/epk-builder/EpkPublicViewer'
import { getOptimizedImageUrl, getSquareThumbnail } from '@/lib/imageUtils'

interface ArtistEpkClientProps {
  artist: PublicArtist
  profile: PublicArtistEpk['profile'] | null
  canvasDocument: EpkDocumentV2 | null
  photos: PressAsset[]
  concerts: Concert[]
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

function CopyButton({ text, copyLabel, copiedLabel }: { text: string; copyLabel: string; copiedLabel: string }) {
  const [copied, setCopied] = useState(false)

  const onCopy = async () => {
    await navigator.clipboard.writeText(stripHtmlTags(text))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <Button variant="outline" size="sm" onClick={() => void onCopy()} className="gap-2">
      {copied ? <Check size={14} weight="bold" aria-hidden="true" /> : <Copy size={14} weight="bold" aria-hidden="true" />}
      {copied ? copiedLabel : copyLabel}
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

export function ArtistEpkClient({
  artist,
  profile,
  canvasDocument,
  photos,
  concerts,
}: ArtistEpkClientProps) {
  const t = useTranslations('press')
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(0)
  const [exportingPdf, setExportingPdf] = useState(false)

  const showCanvasEpk = Boolean(canvasDocument && profile?.epkEditorMode === 'canvas')

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
      toast.success(t('pdfDownloadSuccess'))
    } catch {
      toast.error(t('pdfExportFailed'))
    } finally {
      setExportingPdf(false)
    }
  }

  const imagePhotos = photos.filter((photo) => photo.mimeType.startsWith('image/'))
  const documentPhotos = photos.filter((photo) => !photo.mimeType.startsWith('image/'))

  const riderDocuments = [
    { label: t('downloadStagePlot'), url: profile?.riderStagePlotUrl },
    { label: t('downloadTechnicalRider'), url: profile?.riderTechnicalUrl },
    { label: t('downloadHospitalityRider'), url: profile?.riderHospitalityUrl },
  ].filter((item): item is { label: string; url: string } => Boolean(item.url))

  const openLightbox = (photoId: string) => {
    const index = imagePhotos.findIndex((photo) => photo.id === photoId)
    if (index < 0) return
    setLightboxIndex(index)
    setLightboxOpen(true)
  }

  const bios = [
    { label: t('bioShortHeading'), text: profile?.bioShort },
    { label: t('bioMediumHeading'), text: profile?.bioMedium },
    { label: t('bioLongHeading'), text: profile?.bioLong || artist.bio },
  ].filter((item): item is { label: string; text: string } => Boolean(item.text))

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-4 py-10 sm:px-6 lg:px-8">
        <Button asChild variant="ghost" className="w-fit px-0 text-muted-foreground hover:text-foreground">
          <Link href="/press">{t('backToPress')}</Link>
        </Button>

        <section className="grid gap-6 rounded-3xl border border-border bg-card/60 p-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-center lg:p-8">
          <div className="space-y-4">
            <p className="text-sm uppercase tracking-[0.2em] text-primary">{t('artistPressKit')}</p>
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
                      src={getOptimizedImageUrl(artist.logoUrl, 300)}
                      alt={`${artist.name} logo`}
                      width={200}
                      height={80}
                      unoptimized
                      className="h-20 w-auto object-contain"
                    />
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <a href={artist.logoUrl} target="_blank" rel="noopener noreferrer" download>
                      <DownloadSimple size={16} weight="bold" aria-hidden="true" />
                      {t('downloadLogo')}
                    </a>
                  </Button>
                </div>
              )}
            </div>
          </div>
          <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-border bg-background/50">
            <Image
              src={getOptimizedImageUrl(artist.imageUrl, 800)}
              alt={`${artist.name} – artist photo`}
              fill
              unoptimized
              className="object-cover"
              priority
              sizes="(max-width: 768px) 100vw, 768px"
            />
          </div>
        </section>

        {showCanvasEpk && canvasDocument && (
          <section aria-labelledby="artist-canvas-epk" className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 id="artist-canvas-epk" className="text-2xl font-bold tracking-tight">
                {t('pressKitPreview')}
              </h2>
              <Button
                type="button"
                variant="outline"
                className="min-h-[44px] gap-2"
                disabled={exportingPdf}
                onClick={() => void handleDownloadPressKitPdf()}
              >
                <DownloadSimple size={16} weight="bold" aria-hidden="true" />
                {exportingPdf ? t('generatingPdf') : t('downloadPressKitPdf')}
              </Button>
            </div>
            <div className="rounded-3xl border border-border bg-card/60 p-6">
              <EpkPublicViewer document={canvasDocument} artistName={artist.name} />
            </div>
          </section>
        )}

        <section aria-labelledby="artist-bios" className="space-y-4">
          <h2 id="artist-bios" className="text-2xl font-bold tracking-tight">{t('biosHeading')}</h2>
          <div className={`grid grid-cols-1 gap-4 ${bios.length === 2 ? 'lg:grid-cols-2' : bios.length >= 3 ? 'lg:grid-cols-3' : ''}`}>
            {bios.map((bio) => (
              <Card key={bio.label} className="border-border bg-card/70">
                <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
                  <CardTitle className="text-base">{bio.label}</CardTitle>
                  <CopyButton text={bio.text} copyLabel={t('copyBio')} copiedLabel={t('bioCopied')} />
                </CardHeader>
                <CardContent>
                  <div
                    suppressHydrationWarning
                    className="text-sm leading-relaxed text-muted-foreground [&_p]:mb-2 [&_p:last-child]:mb-0"
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(bio.text) }}
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {profile?.pressQuote && (
          <section aria-labelledby="artist-quote" className="rounded-3xl border border-border bg-card/60 p-6">
            <div className="flex items-start gap-4">
              <Quotes size={28} weight="fill" aria-hidden="true" className="mt-1 text-primary" />
              <div className="space-y-2">
                <h2 id="artist-quote" className="text-2xl font-bold tracking-tight">{t('pressQuoteHeading')}</h2>
                <blockquote className="text-lg italic leading-relaxed text-muted-foreground">{profile.pressQuote}</blockquote>
              </div>
            </div>
          </section>
        )}

        {(riderDocuments.length > 0 || documentPhotos.length > 0) && (
          <section aria-labelledby="artist-technical-docs" className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <h2 id="artist-technical-docs" className="text-2xl font-bold tracking-tight">
                {t('technicalDocumentsHeading')}
              </h2>
              <p className="text-sm text-muted-foreground">{t('technicalDocumentsDescription')}</p>
            </div>
            <div className="space-y-3">
              {riderDocuments.map((doc) => (
                <div
                  key={doc.url}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card/70 px-4 py-3"
                >
                  <p className="font-medium">{doc.label}</p>
                  <Button asChild variant="outline">
                    <a href={doc.url} target="_blank" rel="noopener noreferrer" download>
                      <DownloadSimple size={16} weight="bold" aria-hidden="true" />
                      {t('downloadPhoto')}
                    </a>
                  </Button>
                </div>
              ))}
              {documentPhotos.map((photo) => (
                <div
                  key={photo.id}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card/70 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{pressAssetTitle(photo)}</p>
                    <p className="text-sm text-muted-foreground">{photo.pressCategory ?? 'document'}</p>
                  </div>
                  <Button asChild variant="outline">
                    <a href={photo.publicUrl} target="_blank" rel="noopener noreferrer" download>
                      <DownloadSimple size={16} weight="bold" aria-hidden="true" />
                      {t('downloadPhoto')}
                    </a>
                  </Button>
                </div>
              ))}
            </div>
          </section>
        )}

        <section aria-labelledby="artist-photos" className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 id="artist-photos" className="text-2xl font-bold tracking-tight">{t('pressPhotosHeading')}</h2>
            <p className="text-sm text-muted-foreground">{t('pressPhotosDescription')}</p>
          </div>
          {imagePhotos.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('noPressPhotos')}</p>
          ) : (
            <ul className="grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 xl:grid-cols-3">
              {imagePhotos.map((photo) => (
                <li key={photo.id} className="overflow-hidden rounded-2xl border border-border bg-card/70">
                  {photo.mimeType.startsWith('image/') ? (
                    <button
                      type="button"
                      className="group relative block aspect-square w-full overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => openLightbox(photo.id)}
                      aria-label={`View ${pressAssetTitle(photo)}`}
                    >
                      <Image
                        src={getSquareThumbnail(photo.publicUrl, 400)}
                        alt={photo.altText ?? `${artist.name} – press photo`}
                        fill
                        unoptimized
                        className="object-cover transition-transform duration-300 group-hover:scale-105"
                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
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
                        {t('downloadPhoto')}
                      </a>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <PressPhotoLightbox
          photos={imagePhotos}
          initialIndex={lightboxIndex}
          open={lightboxOpen}
          onClose={() => setLightboxOpen(false)}
          artistName={artist.name}
        />

        <section aria-labelledby="artist-tour" className="space-y-4">
          <h2 id="artist-tour" className="text-2xl font-bold tracking-tight">{t('tourDatesHeading')}</h2>
          {concerts.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('noTourDates')}</p>
          ) : (
            <div className="space-y-3">
              {concerts.map((concert) => (
                <Card key={concert.id} className="border-border bg-card/70">
                  <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                      <CalendarBlank size={20} weight="bold" aria-hidden="true" className="mt-0.5 text-primary" />
                      <div>
                        <p className="font-semibold">{concert.eventName || concert.venueName || t('liveShow')}</p>
                        <p className="text-sm text-muted-foreground">
                          {[concert.venueName, concert.venueCity, concert.venueCountry].filter(Boolean).join(' · ')}
                        </p>
                        <p className="text-sm text-muted-foreground">{new Date(concert.concertDate).toLocaleDateString()}</p>
                      </div>
                    </div>
                    {concert.ticketUrl && concert.status !== 'cancelled' && (
                      <Button asChild variant="outline">
                        <a href={concert.ticketUrl} target="_blank" rel="noopener noreferrer">{t('tickets')}</a>
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