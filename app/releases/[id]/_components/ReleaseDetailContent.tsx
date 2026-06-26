'use client'

import { motion, useReducedMotion } from 'framer-motion'
import Image from 'next/image'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Calendar,
  ArrowLeft,
  Globe,
  SpotifyLogo,
  InstagramLogo,
  YoutubeLogo,
  FacebookLogo,
  TwitterLogo,
  TiktokLogo,
  MusicNote,
  LinkSimple,
} from '@phosphor-icons/react'
import { getOptimizedImageUrl } from '@/lib/imageUtils'
import { buildPlatformLinkEntries } from '@/lib/platforms/buildPlatformLinkEntries'
import { ODESLI_PLATFORM_CONFIG } from '@/lib/platforms/odesliPlatformConfig'
import {
  resolveReleaseHubLink,
  resolveReleaseHubLinkLabelKey,
} from '@/lib/platforms/resolveReleaseHubLink'
import { BandcampIcon } from '@/components/icons/BandcampIcon'
import { ShareButton } from '@/components/ShareButton'
import { trackSmartLinkClick } from '@/lib/analytics/trackPageEvent'
import { useLocale, useTranslations } from 'next-intl'
import type { Release, Artist } from '@/types'

interface ReleaseDetailContentProps {
  release: Release
  artist?: Artist | null
}

/**
 * Client component for the release detail page.
 *
 * The `layoutId` on the cover art image matches the one used in the
 * Releases grid card, enabling Framer Motion's Shared Layout Animation:
 * the thumbnail seamlessly morphs into the large header image when the
 * user navigates from the grid to this detail page.
 *
 * Per-platform streaming buttons: Odesli-resolved `platformLinks` merged
 * with individually stored URLs (Spotify, Apple Music, Tidal, Amazon, etc.).
 */
export function ReleaseDetailContent({ release, artist }: ReleaseDetailContentProps) {
  const t = useTranslations('releaseDetail')
  const locale = useLocale()
  const dateLocale = locale === 'de' ? 'de-DE' : 'en-US'
  const prefersReducedMotion = useReducedMotion()
  const formattedDate = new Date(release.releaseDate).toLocaleDateString(dateLocale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const heroBackgroundUrl = getOptimizedImageUrl(release.heroBgUrl ?? release.coverArt, 1200)
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

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ------------------------------------------------------------------ */}
      {/* Hero — shared layout cover art                                       */}
      {/* ------------------------------------------------------------------ */}
      <div className="relative">
        {/* Full-bleed blurred background — hero banner when set, else cover art */}
        <div
          className="absolute inset-0 h-[70vh] overflow-hidden"
          style={{ zIndex: 0 }}
          aria-hidden
        >
          <Image
            src={heroBackgroundUrl}
            alt=""
            fill
            className="object-cover opacity-20 blur-2xl scale-110"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/80 to-background" />
        </div>

        <div className="relative z-10 container mx-auto px-4 lg:px-8 pt-36 pb-16">
          <Link
            href="/releases"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-accent transition-colors mb-10"
          >
            <ArrowLeft size={16} weight="bold" />
            {t('backToReleases')}
          </Link>

          <div className="flex flex-col lg:flex-row gap-10 lg:gap-16 items-start">
            {/* Shared Layout cover art */}
            <motion.div
              layoutId={`release-cover-${release.id}`}
              className="w-full max-w-xs lg:max-w-sm shrink-0 rounded-xl overflow-hidden shadow-2xl shadow-black/60"
            >
              <Image
                src={getOptimizedImageUrl(release.coverArt, 600)}
                alt={`${release.title} cover`}
                width={480}
                height={480}
                className="w-full aspect-square object-cover"
              />
            </motion.div>

            {/* Metadata */}
            <motion.div
              initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: prefersReducedMotion ? 0 : 0.15, duration: prefersReducedMotion ? 0 : 0.5 }}
              className="flex-1 min-w-0 space-y-5 pt-2"
            >
              <div className="flex flex-wrap gap-2">
                <Badge
                  variant="outline"
                  className="uppercase text-xs font-mono tracking-widest border-primary/30 text-primary-foreground"
                >
                  {release.type}
                </Badge>
                {release.featured && (
                  <Badge className="bg-secondary/90 text-secondary-foreground font-bold uppercase tracking-wider text-xs">
                    {t('featured')}
                  </Badge>
                )}
              </div>

              <div>
                <h1 className="text-4xl lg:text-6xl font-bold tracking-tight leading-none mb-2">
                  {release.title}
                </h1>
                <p className="text-xl text-muted-foreground font-medium">{release.artistName}</p>
              </div>

              <p className="flex items-center gap-2 text-sm text-muted-foreground font-mono">
                <Calendar size={16} weight="bold" />
                {formattedDate}
              </p>

              {/* Smart link hub + per-platform streaming buttons */}
              {hasStreamingLinks && (
                <div className="flex flex-wrap gap-2 pt-2">
                  {hubLinkUrl && (
                    <a
                      href={hubLinkUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={t(hubLinkLabelKey)}
                      onClick={() => {
                        const artistId = artist?.id ?? release.artistId
                        if (artistId) {
                          trackSmartLinkClick(artistId, `/releases/${release.id}`)
                        }
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-90 hover:scale-105 bg-primary text-primary-foreground"
                    >
                      <LinkSimple size={14} weight="bold" aria-hidden="true" />
                      {t(hubLinkLabelKey)}
                    </a>
                  )}
                  {platformEntries.map(({ key, url }) => {
                    const cfg = ODESLI_PLATFORM_CONFIG[key]
                    const Icon = cfg?.icon ?? Globe
                    const label = cfg?.label ?? key
                    const bg = cfg?.bg ?? undefined
                    const textColor = cfg?.textColor ?? 'text-white'
                    return (
                      <a
                        key={key}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Listen on ${label}`}
                        onClick={() => {
                          const artistId = artist?.id ?? release.artistId
                          if (artistId) {
                            trackSmartLinkClick(artistId, `/releases/${release.id}`)
                          }
                        }}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-90 hover:scale-105 ${textColor}`}
                        style={bg ? { backgroundColor: bg } : undefined}
                      >
                        <Icon size={14} weight="fill" aria-hidden="true" />
                        {label}
                      </a>
                    )
                  })}
                </div>
              )}

              {/* Share button */}
              <div className="pt-1">
                <ShareButton
                  title={release.title}
                  text={`${release.artistName} — ${release.title}`}
                  labels={{
                    share: t('share'),
                    shareSuccess: t('shareSuccess'),
                    shareLinkCopied: t('shareLinkCopied'),
                    shareError: t('shareError'),
                  }}
                />
              </div>

              {/* Promo / description text */}
              {release.promoText && (
                <div className="pt-2 border-t border-border/40">
                  <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-2">
                    {t('promoText')}
                  </p>
                  <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-line">
                    {release.promoText}
                  </p>
                </div>
              )}

              {/* Artist social links */}
              {artist && (() => {
                const socialLinks = [
                  { url: artist.spotifyUrl,    icon: SpotifyLogo,    label: `${artist.name} on Spotify` },
                  { url: artist.appleMusicUrl, icon: MusicNote,      label: `${artist.name} on Apple Music` },
                  { url: artist.instagramUrl,  icon: InstagramLogo,  label: `${artist.name} on Instagram` },
                  { url: artist.youtubeUrl,    icon: YoutubeLogo,    label: `${artist.name} on YouTube` },
                  { url: artist.facebookUrl,   icon: FacebookLogo,   label: `${artist.name} on Facebook` },
                  { url: artist.twitterUrl,    icon: TwitterLogo,    label: `${artist.name} on X (Twitter)` },
                  { url: artist.tiktokUrl,     icon: TiktokLogo,     label: `${artist.name} on TikTok` },
                  { url: artist.bandcampUrl,   icon: BandcampIcon,   label: `${artist.name} on Bandcamp` },
                  { url: artist.websiteUrl,    icon: Globe,          label: `${artist.name} official website` },
                ].filter((s) => s.url)
                if (socialLinks.length === 0) return null
                return (
                  <div className="pt-2 border-t border-border/40">
                    <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-3">
                      {t('artistConnect')}
                    </p>
                    <TooltipProvider>
                      <div className="flex flex-wrap gap-2">
                        {socialLinks.map(({ url, icon: Icon, label }) => (
                          <Tooltip key={label}>
                            <TooltipTrigger asChild>
                              <a
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={label}
                                className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg bg-muted hover:bg-accent hover:text-accent-foreground transition-all hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                              >
                                <Icon size={20} weight="fill" aria-hidden="true" />
                              </a>
                            </TooltipTrigger>
                            <TooltipContent>{label}</TooltipContent>
                          </Tooltip>
                        ))}
                      </div>
                    </TooltipProvider>
                  </div>
                )
              })()}
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  )
}
