'use client'

import Link from 'next/link'
import Image from 'next/image'
import { Globe, LinkSimple, X } from '@phosphor-icons/react'
import { buildPlatformLinkEntries } from '@/lib/platforms/buildPlatformLinkEntries'
import {
  resolveReleaseHubLink,
  resolveReleaseHubLinkLabelKey,
} from '@/lib/platforms/resolveReleaseHubLink'
import { ODESLI_PLATFORM_CONFIG } from '@/lib/platforms/odesliPlatformConfig'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ConsentGate } from '@/components/ConsentGate'
import { getSpotifyEmbedPath } from '@/lib/spotifyEmbedPath'
import { getOptimizedImageUrl } from '@/lib/imageUtils'
import { useTranslations } from 'next-intl'
import type { Release } from '@/types'

interface ReleasePreviewModalProps {
  release: Release | null
  open: boolean
  onClose: () => void
}

export function ReleasePreviewModal({ release, open, onClose }: ReleasePreviewModalProps) {
  const t = useTranslations('releases')
  const tDetail = useTranslations('releaseDetail')
  const tConsent = useTranslations('consent')
  if (!release) return null

  const spotifyEmbedUri = release.spotifyId ? `spotify:album:${release.spotifyId}` : undefined
  const hubLinkUrl = resolveReleaseHubLink({
    smartlinkUrl: release.smartlinkUrl,
    smartUrl: release.smartUrl,
    platformLinks: release.platformLinks,
  })
  const hubLinkLabelKey = resolveReleaseHubLinkLabelKey({
    smartlinkUrl: release.smartlinkUrl,
    smartUrl: release.smartUrl,
    platformLinks: release.platformLinks,
  })
  const platformEntries = buildPlatformLinkEntries({
    platformLinks: release.platformLinks,
    spotifyUrl: release.spotifyUrl,
    appleMusicUrl: release.appleMusicUrl,
    youtubeUrl: release.youtubeUrl,
    bandcampUrl: release.bandcampUrl,
  })
  const hasStreamingLinks = !!hubLinkUrl || platformEntries.length > 0

  const formattedDate = release.releaseDate
    ? new Date(release.releaseDate).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    : null

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
      <DialogContent
        aria-describedby={undefined}
        hideCloseButton
        className="sm:max-w-lg md:max-w-xl lg:max-w-2xl w-full p-0 overflow-hidden bg-card border-border"
      >
        <DialogTitle className="sr-only">{release.title}</DialogTitle>
        {/* Close button – uses Radix DialogPrimitive.Close so it properly closes the dialog */}
        <DialogPrimitive.Close
          aria-label="Close release preview"
          className="absolute top-3 right-3 z-10 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full bg-background/70 backdrop-blur-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <X size={16} />
        </DialogPrimitive.Close>

        <div className="flex flex-col sm:flex-row">
          {/* Cover art */}
          <div className="relative w-full sm:w-48 shrink-0 aspect-square sm:aspect-auto">
            <Image
              src={getOptimizedImageUrl(release.coverArt, 400)}
              alt={`${release.title} by ${release.artistName}`}
              fill
              unoptimized
              className="object-cover"
            />
          </div>

          {/* Info – scrollable body so long content never clips the viewport */}
          <div data-lenis-prevent className="overflow-y-auto max-h-[70vh] flex flex-col gap-3 p-4 flex-1 min-w-0">
            <div>
              <Badge variant="secondary" className="text-xs uppercase tracking-wider mb-2">
                {release.type}
              </Badge>
              <h2 className="text-lg font-bold leading-tight truncate">{release.title}</h2>
              <p className="text-sm text-muted-foreground mt-0.5">{release.artistName}</p>
              {formattedDate && (
                <p className="text-xs text-muted-foreground mt-1">{formattedDate}</p>
              )}
            </div>

            {/* Spotify embed */}
            {spotifyEmbedUri && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                  {t('previewTitle')}
                </p>
                <ConsentGate label={tConsent('loadSpotify')}>
                  <iframe
                    src={`https://open.spotify.com/embed${getSpotifyEmbedPath(spotifyEmbedUri)}`}
                    width="100%"
                    height="80"
                    frameBorder="0"
                    allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                    loading="lazy"
                    className="rounded-md"
                    title={`${release.title} – Spotify preview`}
                  />
                </ConsentGate>
              </div>
            )}

            {hasStreamingLinks && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                  {t('streamingLinks')}
                </p>
                <div className="flex flex-wrap gap-2">
                  {hubLinkUrl && (
                    <a
                      href={hubLinkUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-primary/90 text-primary-foreground hover:bg-primary transition-colors"
                    >
                      <LinkSimple size={12} weight="bold" aria-hidden="true" />
                      {tDetail(hubLinkLabelKey)}
                    </a>
                  )}
                  {platformEntries.map(({ key, url }) => {
                    const cfg = ODESLI_PLATFORM_CONFIG[key]
                    const Icon = cfg?.icon ?? Globe
                    const label = cfg?.label ?? key
                    return (
                      <a
                        key={key}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-muted/60 border border-border hover:bg-muted transition-colors"
                      >
                        <Icon size={12} weight="fill" aria-hidden="true" />
                        {label}
                      </a>
                    )
                  })}
                </div>
              </div>
            )}

            {/* View full page */}
            <Button asChild size="sm" variant="outline" className="mt-auto self-start">
              <Link href={`/releases/${release.id}`}>
                {t('viewFullPage')}
              </Link>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
