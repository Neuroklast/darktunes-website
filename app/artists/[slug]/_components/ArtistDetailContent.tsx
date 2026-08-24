'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import {
  ARTIST_PROFILE_MD_MEDIA,
  ARTIST_PROFILE_PREVIEW_ROWS_DEFAULT,
  ARTIST_PROFILE_XL_MEDIA,
  artistProfileNewsColumns,
  artistProfileVideoColumns,
  artistProfileVisibleCount,
  clampArtistProfilePreviewRows,
} from '@/lib/artistProfilePreview'
import {
  ArrowLeft,
  SpotifyLogo,
  InstagramLogo,
  YoutubeLogo,
  Globe,
  FacebookLogo,
  TwitterLogo,
  TiktokLogo,
  MusicNote,
  ShoppingBag,
  LinkSimple,
  MapPin,
  Calendar,
  Ticket,
  Play,
  CaretDown,
  CaretUp,
  Images,
} from '@phosphor-icons/react'
import { ConsentGate } from '@/components/ConsentGate'
import { VideoModal } from '@/components/VideoModal'
import { buildPlatformLinkEntries } from '@/lib/platforms/buildPlatformLinkEntries'
import { ODESLI_PLATFORM_CONFIG } from '@/lib/platforms/odesliPlatformConfig'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { BandcampIcon } from '@/components/icons/BandcampIcon'
import { useLocale, useTranslations } from 'next-intl'
import { toBcp47 } from '@/i18n/locales'
import type { Release, Concert, Video, NewsPost } from '@/types'
import type { PublicArtist } from '@/lib/api/publicArtist'
import { trackShopClick, trackSmartLinkClick } from '@/lib/analytics/trackPageEvent'
import { ShareButton } from './ShareButton'
import { RelatedArtists } from './RelatedArtists'
import { sanitizeHtml } from '@/lib/sanitizeHtml'
import { PressPhotoLightbox } from '@/components/press/PressPhotoLightbox'
import { galleryUrlToPressAsset } from '@/lib/api/portalGalleryPress'
import { getOptimizedImageUrl, getSquareThumbnail } from '@/lib/imageUtils'

interface ArtistDetailContentProps {
  artist: PublicArtist
  releases: Release[]
  concerts: Concert[]
  videos: Video[]
  news: NewsPost[]
  galleryPhotos: string[]
  relatedArtists?: PublicArtist[]
  /** Grid rows of videos before "Show all". Default 2. */
  videoPreviewRows?: number
  /** Grid rows of news before "Show all". Default 2. */
  newsPreviewRows?: number
}

function extractYouTubeId(url: string): string | null {
  const match = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|v\/))([\w-]{11})/,
  )
  return match?.[1] ?? null
}

/** Collapsible section header with animated chevron. */
function SectionHeader({
  title,
  isOpen,
  onToggle,
  collapseLabel,
  expandLabel,
}: {
  title: string
  isOpen: boolean
  onToggle: () => void
  collapseLabel: string
  expandLabel: string
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="group flex items-center gap-3 w-full text-left mb-6"
      aria-expanded={isOpen}
      aria-label={isOpen ? collapseLabel : expandLabel}
    >
      <h2 className="text-3xl font-bold tracking-tight text-foreground flex-1">
        {title}
      </h2>
      <span className="shrink-0 p-1 rounded-md text-muted-foreground group-hover:text-foreground transition-colors">
        {isOpen ? <CaretUp size={22} weight="bold" aria-hidden="true" /> : <CaretDown size={22} weight="bold" aria-hidden="true" />}
      </span>
    </button>
  )
}

export function ArtistDetailContent({
  artist,
  releases,
  concerts,
  videos,
  news,
  galleryPhotos,
  relatedArtists = [],
  videoPreviewRows = ARTIST_PROFILE_PREVIEW_ROWS_DEFAULT,
  newsPreviewRows = ARTIST_PROFILE_PREVIEW_ROWS_DEFAULT,
}: ArtistDetailContentProps) {
  const t = useTranslations('artistDetail')
  const tConsent = useTranslations('consent')
  const locale = useLocale()
  const prefersReducedMotion = useReducedMotion()
  const dateLocale = toBcp47(locale)
  const youtubeId = artist.youtubeUrl ? extractYouTubeId(artist.youtubeUrl) : null
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null)
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false)
  const [galleryLightboxOpen, setGalleryLightboxOpen] = useState(false)
  const [galleryLightboxIndex, setGalleryLightboxIndex] = useState(0)
  const [videosExpanded, setVideosExpanded] = useState(false)
  const [newsExpanded, setNewsExpanded] = useState(false)

  const isMd = useMediaQuery(ARTIST_PROFILE_MD_MEDIA)
  const isXl = useMediaQuery(ARTIST_PROFILE_XL_MEDIA)
  const videoRows = clampArtistProfilePreviewRows(videoPreviewRows)
  const newsRows = clampArtistProfilePreviewRows(newsPreviewRows)
  const videoVisibleLimit = artistProfileVisibleCount(
    videoRows,
    artistProfileVideoColumns(isMd, isXl),
  )
  const newsVisibleLimit = artistProfileVisibleCount(
    newsRows,
    artistProfileNewsColumns(isMd),
  )
  const visibleVideos = videosExpanded ? videos : videos.slice(0, videoVisibleLimit)
  const visibleNews = newsExpanded ? news : news.slice(0, newsVisibleLimit)
  const showVideosToggle = videos.length > videoVisibleLimit
  const showNewsToggle = news.length > newsVisibleLimit

  const galleryPressPhotos = useMemo(
    () => galleryPhotos.map((url, index) => galleryUrlToPressAsset(url, artist.id, index)),
    [galleryPhotos, artist.id],
  )

  // Collapsible state — all sections open by default
  const [openSections, setOpenSections] = useState({
    videos: true,
    discography: true,
    news: true,
    tourDates: true,
  })

  const toggleSection = (key: keyof typeof openSections) =>
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }))

  const openVideoModal = (video: Video) => {
    setSelectedVideo(video)
    setIsVideoModalOpen(true)
  }

  const socialLinks = [
    { url: artist.spotifyUrl, icon: SpotifyLogo, label: `${artist.name} on Spotify` },
    { url: artist.appleMusicUrl, icon: MusicNote, label: `${artist.name} on Apple Music` },
    { url: artist.instagramUrl, icon: InstagramLogo, label: `${artist.name} on Instagram` },
    { url: artist.youtubeUrl, icon: YoutubeLogo, label: `${artist.name} on YouTube` },
    { url: artist.facebookUrl, icon: FacebookLogo, label: `${artist.name} on Facebook` },
    { url: artist.twitterUrl, icon: TwitterLogo, label: `${artist.name} on X (Twitter)` },
    { url: artist.tiktokUrl, icon: TiktokLogo, label: `${artist.name} on TikTok` },
    { url: artist.bandcampUrl, icon: BandcampIcon, label: `${artist.name} on Bandcamp` },
    { url: artist.websiteUrl, icon: Globe, label: `${artist.name} official website` },
  ]

  const collapseLabel = t('collapse')
  const expandLabel = t('expand')

  const collapseVariants = {
    open: { opacity: 1, height: 'auto' },
    closed: { opacity: 0, height: 0 },
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ------------------------------------------------------------------ */}
      {/* Hero                                                                 */}
      {/* ------------------------------------------------------------------ */}
      <div className="relative overflow-hidden">
        <div
          className="absolute inset-0 h-[60vh] overflow-hidden"
          style={{ zIndex: 0 }}
          aria-hidden
        >
          <Image
            src={getOptimizedImageUrl(artist.imageUrl, 1200)}
            alt=""
            aria-hidden="true"
            fill
            unoptimized
            className="object-cover opacity-20 blur-2xl scale-110"
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/50 via-background/80 to-background" />
        </div>

        <div className="relative z-10 container mx-auto max-w-7xl px-4 lg:px-8 pt-36 pb-16">
          <Link
            href="/artists"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-accent transition-colors mb-10"
          >
            <ArrowLeft size={16} weight="bold" aria-hidden="true" />
            {t('backToArtists')}
          </Link>

          {/* Two-column hero on desktop: photo | metadata */}
          <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-10 lg:gap-16 items-start">
            {/* Artist photo + logo (left column) */}
            <div className="flex flex-col gap-4 w-full max-w-xs lg:w-80 xl:w-96 shrink-0">
            <motion.div
              initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.5 }}
              className="w-full rounded-xl overflow-hidden shadow-2xl shadow-black/60"
            >
              {artist.imageUrl ? (
                <Image
                  src={getSquareThumbnail(artist.imageUrl, 480)}
                  alt={`${artist.name} – artist photo`}
                  width={480}
                  height={480}
                  priority
                  unoptimized
                  className="w-full aspect-square object-cover"
                  style={{
                    objectPosition: `${artist.imagePositionX ?? 50}% ${artist.imagePositionY ?? 50}%`,
                  }}
                  onError={(e) => {
                    e.currentTarget.style.display = 'none'
                    const placeholder = e.currentTarget.nextElementSibling as HTMLElement | null
                    if (placeholder) placeholder.style.display = 'flex'
                  }}
                />
              ) : null}
              <div
                className="w-full aspect-square bg-gradient-to-br from-card to-background flex items-center justify-center"
                style={{ display: artist.imageUrl ? 'none' : 'flex' }}
              >
                <span className="text-8xl font-bold text-muted-foreground/40 select-none uppercase">
                  {artist.name.slice(0, 2)}
                </span>
              </div>
            </motion.div>

            {/* Artist logo — shown below the photo when a dedicated logo image exists */}
            {artist.logoUrl && (
              <div className="flex items-center justify-center px-4 py-3 rounded-xl bg-card/60 border border-border/40">
                <Image
                  src={getOptimizedImageUrl(artist.logoUrl, 320)}
                  alt={`${artist.name} – logo`}
                  width={320}
                  height={120}
                  unoptimized
                  className="h-20 w-auto max-w-full object-contain brightness-0 invert opacity-90"
                  onError={(e) => { e.currentTarget.parentElement!.style.display = 'none' }}
                />
              </div>
            )}
            </div>

            {/* Metadata */}
            <motion.div
              initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: prefersReducedMotion ? 0 : 0.2, duration: prefersReducedMotion ? 0 : 0.5 }}
              className="min-w-0 space-y-5 pt-2"
            >
              {/* Tactical FUI metadata */}
              {(artist.country || artist.foundedYear) && (
                <div className="flex flex-wrap gap-4 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                  {artist.country && (
                    <span className="flex items-center gap-1">
                      <MapPin size={12} aria-hidden="true" />
                      {artist.country}
                    </span>
                  )}
                  {artist.foundedYear && (
                    <span className="flex items-center gap-1">
                      <Calendar size={12} aria-hidden="true" />
                      {t('since')} {artist.foundedYear}
                    </span>
                  )}
                </div>
              )}

              <div>
                <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold tracking-tight leading-none mb-3 break-words hyphens-auto">
                  {artist.name}
                </h1>
                <div className="flex flex-wrap gap-2 mt-3">
                  {artist.genres.map((genre) => (
                    <Badge
                      key={genre}
                      className="bg-primary/20 text-primary-foreground border-primary/30 backdrop-blur-sm uppercase font-mono text-xs tracking-wider"
                    >
                      {genre}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-3 pt-2">
                {/* Per-platform streaming buttons from Odesli, or fallback to individual URL fields */}
                {(() => {
                  const platformEntries = buildPlatformLinkEntries({
                    platformLinks: artist.platformLinks,
                    spotifyUrl: artist.spotifyUrl,
                    appleMusicUrl: artist.appleMusicUrl,
                    youtubeUrl: artist.youtubeUrl,
                    bandcampUrl: artist.bandcampUrl,
                  })

                  if (platformEntries.length === 0) return null
                  return (
                    <div className="flex flex-wrap gap-2">
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
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-90 hover:scale-105 ${textColor}`}
                            style={bg ? { backgroundColor: bg } : undefined}
                          >
                            <Icon size={14} weight="fill" aria-hidden="true" />
                            {label}
                          </a>
                        )
                      })}
                    </div>
                  )
                })()}
                {artist.shopUrl && (
                  <Button asChild size="sm" className="bg-secondary hover:bg-secondary/90 text-white font-semibold">
                    <a
                      href={artist.shopUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => trackShopClick(artist.id, `/artists/${artist.slug}`)}
                    >
                      <ShoppingBag size={18} weight="fill" className="mr-2" aria-hidden="true" />
                      {t('shopMerch')}
                    </a>
                  </Button>
                )}
                {(artist.smartLinks ?? []).map((link) => (
                  link.url ? (
                    <Button key={`${link.label}-${link.url}`} asChild size="sm" variant="outline">
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => trackSmartLinkClick(artist.id, `/artists/${artist.slug}`)}
                      >
                        <LinkSimple size={16} weight="bold" className="mr-2" aria-hidden="true" />
                        {link.label || link.url}
                      </a>
                    </Button>
                  ) : null
                ))}
              </div>

              {/* Social links */}
              <div className="flex flex-wrap gap-3 pt-1">
                <TooltipProvider>
                {socialLinks
                  .filter((s) => s.url)
                  .map(({ url, icon: Icon, label }) => (
                    <Tooltip key={label}>
                      <TooltipTrigger asChild>
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={label}
                          className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg bg-muted hover:bg-accent hover:text-accent-foreground transition-all hover:scale-110"
                        >
                          <Icon size={20} weight="fill" aria-hidden="true" />
                        </a>
                      </TooltipTrigger>
                      <TooltipContent>{label}</TooltipContent>
                    </Tooltip>
                  ))}
                {artist.bandsintownId && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <a
                        href={`https://www.bandsintown.com/a/${encodeURIComponent(artist.bandsintownId)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`${artist.name} on Bandsintown`}
                        className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg bg-muted hover:bg-accent hover:text-accent-foreground transition-all hover:scale-110 font-mono text-xs font-bold uppercase tracking-tighter"
                      >
                        BIT
                      </a>
                    </TooltipTrigger>
                    <TooltipContent>Bandsintown</TooltipContent>
                  </Tooltip>
                )}
                </TooltipProvider>
              </div>

              {/* Share button */}
              <div className="pt-1">
                <ShareButton
                  title={artist.name}
                  text={artist.bio ? artist.bio.slice(0, 120) : undefined}
                  labels={{
                    share: t('share'),
                    shareSuccess: t('shareSuccess'),
                    shareLinkCopied: t('shareLinkCopied'),
                    shareError: t('shareError'),
                  }}
                />
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Content below hero                                                   */}
      {/* ------------------------------------------------------------------ */}
      <div className="container mx-auto max-w-7xl px-4 lg:px-8 pb-24 space-y-16">

        {/* Biography + Spotify side-by-side */}
        {(artist.bio || artist.spotifyId) && (
          <motion.section
            initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.5 }}
            className="grid grid-cols-1 lg:grid-cols-[1fr_340px] xl:grid-cols-[1fr_360px] gap-10 items-start"
          >
            {/* Biography */}
            {artist.bio && (
              <div>
                <h2 className="text-3xl font-bold mb-6 tracking-tight text-foreground">{t('fullBio')}</h2>
                {/^\s*<[a-z]/i.test(artist.bio) ? (
                  <div
                    suppressHydrationWarning
                    className="prose prose-invert max-w-none text-foreground/80 leading-relaxed font-serif
                      [&_p]:mb-4 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:mt-6 [&_h3]:font-semibold
                      [&_a]:text-accent [&_a]:underline [&_strong]:text-foreground"
                    dangerouslySetInnerHTML={{
                      __html: sanitizeHtml(artist.bio),
                    }}
                  />
                ) : (
                  <p className="text-foreground/80 leading-relaxed font-serif text-base whitespace-pre-line">
                    {artist.bio}
                  </p>
                )}
              </div>
            )}

            {/* Spotify embedded player */}
            {artist.spotifyId && (
              <div className="lg:sticky lg:top-36 max-w-sm lg:max-w-none">
                <h2 className="text-xl font-bold mb-4 tracking-tight text-foreground flex items-center gap-2">
                  <SpotifyLogo size={22} weight="fill" className="text-[#1DB954]" aria-hidden="true" />
                  {t('listenOn')}
                </h2>
                <ConsentGate
                  label={tConsent('spotifyBtnLabel')}
                  title={tConsent('spotifyTitle')}
                  providerIcon={<SpotifyLogo size={20} weight="fill" className="text-[#1DB954]" aria-hidden="true" />}
                  gateText={tConsent('gateText')}
                  privacyPolicyUrl="/datenschutz"
                  privacyPolicyLabel={tConsent('privacyLink')}
                >
                  <div className="rounded-xl overflow-hidden shadow-2xl shadow-black/60">
                    <iframe
                      src={`https://open.spotify.com/embed/artist/${artist.spotifyId}?utm_source=generator&theme=0`}
                      width="100%"
                      height="500"
                      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                      loading="lazy"
                      className="border-0 block"
                      title={`${artist.name} on Spotify`}
                    />
                  </div>
                </ConsentGate>
              </div>
            )}
          </motion.section>
        )}

        {/* Band Photos (portal gallery) */}
        {galleryPhotos.length > 0 && (
          <motion.section
            initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.5 }}
            aria-labelledby="artist-gallery-heading"
          >
            <h2
              id="artist-gallery-heading"
              className="text-3xl font-bold mb-6 tracking-tight text-foreground flex items-center gap-2"
            >
              <Images size={28} weight="duotone" aria-hidden="true" />
              {t('bandPhotos')}
            </h2>
            <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 list-none p-0">
              {galleryPhotos.map((url, index) => (
                <li key={url}>
                  <motion.button
                    type="button"
                    whileHover={prefersReducedMotion ? {} : { scale: 1.03 }}
                    onClick={() => {
                      setGalleryLightboxIndex(index)
                      setGalleryLightboxOpen(true)
                    }}
                    aria-label={t('viewPhoto', { index: index + 1, total: galleryPhotos.length })}
                    className="relative aspect-square w-full rounded-lg overflow-hidden bg-card border border-border cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Image
                      src={getSquareThumbnail(url, 300)}
                      alt={`${artist.name} – ${t('bandPhotos')} ${index + 1}`}
                      fill
                      unoptimized
                      className="object-cover group-hover:scale-105 transition-transform duration-500"
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors duration-300" aria-hidden="true" />
                  </motion.button>
                </li>
              ))}
            </ul>
          </motion.section>
        )}

        {/* Videos */}
        {(videos.length > 0 || youtubeId) && (
          <motion.section
            initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.5 }}
          >
            <SectionHeader
              title={t('latestVideo')}
              isOpen={openSections.videos}
              onToggle={() => toggleSection('videos')}
              collapseLabel={collapseLabel}
              expandLabel={expandLabel}
            />
            <AnimatePresence initial={false}>
              {openSections.videos && (
                <motion.div
                  key="videos-body"
                  initial="closed"
                  animate="open"
                  exit="closed"
                  variants={collapseVariants}
                  transition={{ duration: prefersReducedMotion ? 0 : 0.3, ease: 'easeInOut' }}
                  style={{ overflow: 'hidden' }}
                >
                  {videos.length > 0 ? (
                    <>
                      <ul className="grid md:grid-cols-2 xl:grid-cols-3 gap-6 list-none">
                        {visibleVideos.map((video, index) => (
                          <motion.li
                            key={video.id}
                            initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{
                              duration: prefersReducedMotion ? 0 : 0.5,
                              delay: prefersReducedMotion ? 0 : index * 0.05,
                            }}
                          >
                            <Card className="group overflow-hidden bg-card border-border hover:border-accent/50 transition-all duration-300">
                              <button
                                type="button"
                                className="relative aspect-video w-full overflow-hidden cursor-pointer"
                                onClick={() => openVideoModal(video)}
                                aria-label={`Play ${video.title}`}
                              >
                                <Image
                                  src={getOptimizedImageUrl(video.thumbnailUrl, 600)}
                                  alt={`${video.title} – video thumbnail`}
                                  fill
                                  unoptimized
                                  className="object-cover group-hover:scale-105 transition-transform duration-500"
                                />
                                <div className="absolute inset-0 bg-black/40 group-hover:bg-black/55 transition-colors flex items-center justify-center">
                                  <div
                                    aria-hidden="true"
                                    className="bg-accent text-accent-foreground rounded-full w-16 h-16 p-0 flex items-center justify-center"
                                  >
                                    <Play size={26} weight="fill" aria-hidden="true" />
                                  </div>
                                </div>
                              </button>
                              <div className="p-4">
                                <h3 className="font-bold line-clamp-2 group-hover:text-accent transition-colors">
                                  {video.title}
                                </h3>
                                <p className="text-xs text-muted-foreground font-mono mt-2">
                                  {new Date(video.publishedAt).toLocaleDateString(dateLocale, {
                                    year: 'numeric',
                                    month: 'short',
                                    day: 'numeric',
                                  })}
                                </p>
                              </div>
                            </Card>
                          </motion.li>
                        ))}
                      </ul>
                      {showVideosToggle && (
                        <div className="mt-6 flex justify-center">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setVideosExpanded((v) => !v)}
                            aria-expanded={videosExpanded}
                          >
                            {videosExpanded
                              ? t('showLess')
                              : t('showAll', { total: videos.length })}
                          </Button>
                        </div>
                      )}
                    </>
                  ) : youtubeId ? (
                    <div className="max-w-3xl">
                      <ConsentGate label={tConsent('loadYouTube')} gateText={tConsent('gateText')}>
                        <div className="aspect-video rounded-xl overflow-hidden">
                          <iframe
                            src={`https://www.youtube.com/embed/${youtubeId}`}
                            title={`${artist.name} – latest video`}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                            className="w-full h-full"
                          />
                        </div>
                      </ConsentGate>
                    </div>
                  ) : null}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.section>
        )}

        {/* Discography */}
        {releases.length > 0 && (
          <motion.section
            initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.5 }}
          >
            <SectionHeader
              title={t('discography')}
              isOpen={openSections.discography}
              onToggle={() => toggleSection('discography')}
              collapseLabel={collapseLabel}
              expandLabel={expandLabel}
            />
            <AnimatePresence initial={false}>
              {openSections.discography && (
                <motion.div
                  key="discography-body"
                  initial="closed"
                  animate="open"
                  exit="closed"
                  variants={collapseVariants}
                  transition={{ duration: prefersReducedMotion ? 0 : 0.3, ease: 'easeInOut' }}
                  style={{ overflow: 'hidden' }}
                >
                  <ul className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 list-none">
                    {releases.map((release, index) => (
                      <motion.li
                        key={release.id}
                        initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, scale: 0.95 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true }}
                        transition={{ duration: prefersReducedMotion ? 0 : 0.4, delay: prefersReducedMotion ? 0 : index * 0.05 }}
                      >
                        <Link href={`/releases/${release.id}`} aria-label={`${release.title} by ${release.artistName}`}>
                          <div className="group bg-card border border-border rounded-xl overflow-hidden hover:border-accent/50 transition-all duration-300 cursor-pointer">
                            <div className="relative aspect-square overflow-hidden">
                              <Image
                                src={getSquareThumbnail(release.coverArt, 400)}
                                alt={`${release.title} by ${artist.name} – cover art`}
                                fill
                                unoptimized
                                className="object-cover group-hover:scale-105 transition-transform duration-500"
                              />
                              <Badge
                                variant="outline"
                                className="absolute bottom-2 left-2 uppercase text-xs font-mono tracking-widest border-primary/40 text-primary-foreground bg-background/70 backdrop-blur-sm"
                              >
                                {release.type}
                              </Badge>
                            </div>
                            <div className="p-4">
                              <h3 className="font-bold line-clamp-1 group-hover:text-accent transition-colors">
                                {release.title}
                              </h3>
                              <p className="text-xs text-muted-foreground font-mono mt-1">
                                {new Date(release.releaseDate).toLocaleDateString(dateLocale, {
                                  year: 'numeric',
                                  month: 'short',
                                })}
                              </p>
                            </div>
                          </div>
                        </Link>
                      </motion.li>
                    ))}
                  </ul>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.section>
        )}

        {/* Latest News */}
        {news.length > 0 && (
          <motion.section
            initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.5 }}
          >
            <SectionHeader
              title={t('news')}
              isOpen={openSections.news}
              onToggle={() => toggleSection('news')}
              collapseLabel={collapseLabel}
              expandLabel={expandLabel}
            />
            <AnimatePresence initial={false}>
              {openSections.news && (
                <motion.div
                  key="news-body"
                  initial="closed"
                  animate="open"
                  exit="closed"
                  variants={collapseVariants}
                  transition={{ duration: prefersReducedMotion ? 0 : 0.3, ease: 'easeInOut' }}
                  style={{ overflow: 'hidden' }}
                >
                  <ul className="grid grid-cols-1 md:grid-cols-2 gap-4 list-none">
                    {visibleNews.map((post) => (
                      <li key={post.id}>
                        <Link
                          href={`/news/${post.slug}`}
                          className="group flex gap-4 p-4 rounded-xl bg-card border border-border hover:border-accent/40 transition-colors"
                        >
                          {post.imageUrl && (
                            <Image
                              src={getOptimizedImageUrl(post.imageUrl, 160)}
                              alt={`${post.title} – news thumbnail`}
                              width={80}
                              height={80}
                              unoptimized
                              className="w-20 h-20 object-cover rounded-lg shrink-0"
                            />
                          )}
                          <div className="min-w-0">
                            <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1">
                              {new Date(post.publishedAt).toLocaleDateString(dateLocale, { year: 'numeric', month: 'short', day: 'numeric' })}
                            </p>
                            <h3 className="font-bold line-clamp-2 group-hover:text-accent transition-colors">{post.title}</h3>
                            {post.excerpt && (
                              <p className="text-sm text-muted-foreground line-clamp-1 mt-1">{post.excerpt}</p>
                            )}
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {showNewsToggle && (
                    <div className="mt-6 flex justify-center">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setNewsExpanded((v) => !v)}
                        aria-expanded={newsExpanded}
                      >
                        {newsExpanded
                          ? t('showLess')
                          : t('showAll', { total: news.length })}
                      </Button>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.section>
        )}

        {/* Tour Dates */}
        <motion.section
          initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.5 }}
        >
          <SectionHeader
            title={t('tourDates')}
            isOpen={openSections.tourDates}
            onToggle={() => toggleSection('tourDates')}
            collapseLabel={collapseLabel}
            expandLabel={expandLabel}
          />
          <AnimatePresence initial={false}>
            {openSections.tourDates && (
              <motion.div
                key="tour-body"
                initial="closed"
                animate="open"
                exit="closed"
                variants={collapseVariants}
                transition={{ duration: prefersReducedMotion ? 0 : 0.3, ease: 'easeInOut' }}
                style={{ overflow: 'hidden' }}
              >
                {concerts.length === 0 ? (
                  <p className="text-foreground/70 font-serif">{t('noShows')}</p>
                ) : (
                  <ul className="grid grid-cols-1 lg:grid-cols-2 gap-3 list-none">
                    {concerts.map((concert) => (
                      <li
                        key={concert.id}
                        className="flex items-center justify-between gap-4 p-4 rounded-xl bg-card border border-border hover:border-accent/40 transition-colors"
                      >
                        <div className="flex items-center gap-4 min-w-0">
                          <div className="text-center shrink-0">
                            <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                              {new Date(concert.concertDate).toLocaleDateString(dateLocale, { month: 'short' })}
                            </p>
                            <p className="text-2xl font-bold leading-none">
                              {new Date(concert.concertDate).getDate()}
                            </p>
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold truncate">{concert.eventName}</p>
                            <p className="text-sm text-muted-foreground flex items-center gap-1">
                              <MapPin size={12} aria-hidden="true" />
                              {[concert.venueName, concert.venueCity].filter(Boolean).join(' · ')}
                            </p>
                          </div>
                        </div>
                        {concert.ticketUrl && (
                          <a
                            href={concert.ticketUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 flex items-center gap-1.5 px-4 py-2 min-h-[44px] rounded-lg bg-accent text-accent-foreground hover:bg-accent/90 transition-all hover:scale-105 text-sm font-medium"
                            aria-label={`Tickets for ${concert.eventName}`}
                          >
                            <Ticket size={16} weight="fill" aria-hidden="true" />
                            {t('getTickets')}
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.section>

        {/* Related Artists */}
        {relatedArtists.length > 0 && (
          <RelatedArtists artists={relatedArtists} heading={t('relatedArtists')} />
        )}
      </div>
      <VideoModal
        video={selectedVideo}
        open={isVideoModalOpen}
        onClose={() => setIsVideoModalOpen(false)}
        youtubeLabel={tConsent('loadYouTube')}
      />
      <PressPhotoLightbox
        photos={galleryPressPhotos}
        initialIndex={galleryLightboxIndex}
        open={galleryLightboxOpen}
        onClose={() => setGalleryLightboxOpen(false)}
        artistName={artist.name}
      />
    </div>
  )
}
