'use client'

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { motion, useInView, useReducedMotion } from 'framer-motion'
import Image from 'next/image'
import { Card } from '@/components/ui/card'
import { ScrollReveal } from '@/components/animations/ScrollReveal'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Play, ArrowLeft, ArrowRight, MagnifyingGlass } from '@phosphor-icons/react'
import { getOptimizedImageUrl } from '@/lib/imageUtils'
import { useLocale, useTranslations } from 'next-intl'
import { toBcp47 } from '@/i18n/locales'
import type { Video } from '@/types'
import type { SectionProps } from '@/lib/component-contracts'

// VideoModal is interaction-only — lazy-load to exclude it from the initial bundle.
const VideoModal = lazy(() => import('@/components/VideoModal').then((m) => ({ default: m.VideoModal })))

interface VideosProps extends SectionProps {
  videos: Video[]
  /** Optional R2 placeholder image URL for the ConsentGate in VideoModal. */
  placeholderUrl?: string
  heading?: string
  subheading?: string
  /** Number of videos per page (default: 9). */
  videosPerPage?: number
  /** When true, show only the first page and add a "View all" link to /videos. */
  videosLinkToPage?: boolean
}

// Batched stagger animation — single IntersectionObserver + shared scheduler
const listVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
}

const itemVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
}

/** Individual video card with skeleton loading state for the thumbnail. */
function VideoCard({
  video,
  dateLocale,
  onPlay,
}: {
  video: Video
  dateLocale: string
  onPlay: (video: Video) => void
}) {
  const [imgLoaded, setImgLoaded] = useState(false)

  return (
    <Card
      className="glow-card group overflow-hidden bg-card border-border hover:border-accent/50 hover:shadow-[0_0_30px_rgba(73,54,135,0.3)] transition-all duration-300 cursor-pointer flex flex-col w-full"
      onClick={() => onPlay(video)}
    >
      <div className="relative aspect-video overflow-hidden shrink-0">
        {/* Skeleton shown until the thumbnail image has loaded */}
        {!imgLoaded && (
          <Skeleton className="absolute inset-0 w-full h-full rounded-none" />
        )}
        <Image
          src={getOptimizedImageUrl(video.thumbnailUrl ?? '', 600)}
          alt={`${video.title} – video thumbnail`}
          fill
          unoptimized
          className={`object-cover transform-gpu group-hover:scale-110 transition-[transform,opacity] duration-300 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
          sizes="(max-width: 768px) 82vw, (max-width: 1024px) 50vw, 33vw"
          onLoad={() => setImgLoaded(true)}
        />
        <div className="absolute inset-0 bg-black/40 group-hover:bg-black/60 transition-colors flex items-center justify-center">
          <Button
            size="lg"
            aria-label={`Play ${video.title}`}
            className="bg-gradient-to-br from-primary to-secondary text-white rounded-full w-16 h-16 p-0 hover:scale-110 hover:shadow-[0_0_20px_rgba(73,54,135,0.7)] transition-all duration-300"
            tabIndex={-1}
          >
            <Play size={28} weight="fill" aria-hidden="true" />
          </Button>
        </div>
      </div>
      <div className="p-6 flex flex-col flex-1">
        <Badge className="mb-3 bg-secondary/20 text-secondary-foreground border-secondary/40 uppercase tracking-wider font-mono text-xs self-start">
          {video.artistName}
        </Badge>
        <h3 className="text-xl font-bold mb-2 group-hover:text-accent transition-colors flex-1">
          {video.title}
        </h3>
        <p className="text-sm text-muted-foreground font-mono mt-auto">
          {new Date(video.publishedAt).toLocaleDateString(dateLocale, {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </p>
      </div>
    </Card>
  )
}

export function Videos({ videos, placeholderUrl, heading, subheading, videosPerPage = 9, videosLinkToPage = false }: VideosProps) {
  const t = useTranslations('videos')
  const tConsent = useTranslations('consent')
  const locale = useLocale()
  const dateLocale = toBcp47(locale)
  const sectionHeading = heading ?? t('heading')
  const sectionSubheading = subheading ?? t('subheading')
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState('')
  const listRef = useRef<HTMLUListElement>(null)
  const prefersReducedMotion = useReducedMotion()
  const isListInView = useInView(listRef, { once: true, margin: '0px 0px -80px 0px' })

  const filteredVideos = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return videos
    return videos.filter(
      (v) =>
        v.title.toLowerCase().includes(q) ||
        (v.artistName?.toLowerCase().includes(q) ?? false),
    )
  }, [videos, query])

  const perPage = Math.max(1, videosPerPage)
  const totalPages = Math.ceil(filteredVideos.length / perPage)
  // When videosLinkToPage is true, only show the first page
  const effectiveTotalPages = videosLinkToPage ? 1 : totalPages
  const currentPage = Math.min(page, Math.max(1, effectiveTotalPages))
  const pageVideos = filteredVideos.slice((currentPage - 1) * perPage, currentPage * perPage)

  // Reset to first page when the search query changes
  useEffect(() => { setPage(1) }, [query])

  useEffect(() => {
    listRef.current?.scrollTo({ left: 0, behavior: 'instant' as ScrollBehavior })
  }, [currentPage])

  const handleVideoClick = (video: Video) => {
    setSelectedVideo(video)
    setModalOpen(true)
  }

  return (
    <>
      <section id="videos" className="py-24 px-4 lg:px-16 scroll-mt-36">
        <div className="container mx-auto">
          <ScrollReveal className="mb-12 flex items-end justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-5xl lg:text-6xl font-bold mb-4 tracking-tight">{sectionHeading}</h2>
              <p className="text-xl text-muted-foreground font-serif">{sectionSubheading}</p>
            </div>
            {(
              <Button variant="ghost" className="group/btn hover:text-accent px-0 uppercase tracking-wider font-bold" asChild>
                <Link href="/videos">
                  {t('viewAll')}
                  <ArrowRight className="ml-2 group-hover/btn:translate-x-2 transition-transform" weight="bold" />
                </Link>
              </Button>
            )}
          </ScrollReveal>

          {/* Search input */}
          <div className="relative mb-8 max-w-sm">
            <MagnifyingGlass
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="pl-9"
              aria-label={t('searchPlaceholder')}
            />
          </div>

          {filteredVideos.length === 0 && (
            <p className="text-center text-muted-foreground font-mono py-12">
              {t('noVideos')}
            </p>
          )}

          {/* data-lenis-prevent is required on mobile where this is overflow-x-auto snap-x.
              On md+ it becomes a grid (overflow-x-visible) — the attribute is a no-op there. */}
          {/* key={currentPage} forces remount on page change so the whileInView
              IntersectionObserver fires fresh and new items animate in properly. */}
          <motion.ul
            key={currentPage}
            ref={listRef}
            data-lenis-prevent
            className="list-none flex overflow-x-auto snap-x snap-mandatory scrollbar-hide gap-4 pb-4 md:grid md:grid-cols-2 md:items-stretch md:overflow-x-visible md:gap-8 md:pb-0 lg:grid-cols-3"
            variants={prefersReducedMotion ? undefined : listVariants}
            initial={prefersReducedMotion ? { opacity: 1 } : 'hidden'}
            animate={prefersReducedMotion ? { opacity: 1 } : isListInView ? 'visible' : 'hidden'}
          >
            {pageVideos.map((video) => (
              <motion.li
                key={video.id}
                className="flex-none w-[82vw] snap-start md:w-auto flex"
                variants={prefersReducedMotion ? undefined : itemVariants}
              >
                <VideoCard video={video} dateLocale={dateLocale} onPlay={handleVideoClick} />
              </motion.li>
            ))}
          </motion.ul>

          {/* Pagination controls */}
          {(effectiveTotalPages > 1 || videosLinkToPage) && (
            <div className="flex items-center justify-center gap-4 mt-12">
              {effectiveTotalPages > 1 && (
                <>
                  <Button
                    variant="outline"
                    size="icon"
                    className="min-w-[44px] min-h-[44px]"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage <= 1}
                    aria-label="Previous page"
                  >
                    <ArrowLeft size={18} aria-hidden="true" />
                  </Button>
                  <span className="text-sm text-muted-foreground font-mono">
                    {currentPage} / {effectiveTotalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="min-w-[44px] min-h-[44px]"
                    onClick={() => setPage((p) => Math.min(effectiveTotalPages, p + 1))}
                    disabled={currentPage >= effectiveTotalPages}
                    aria-label="Next page"
                  >
                    <ArrowRight size={18} aria-hidden="true" />
                  </Button>
                </>
              )}
              {videosLinkToPage && filteredVideos.length > perPage && (
                <Button asChild variant="outline" size="lg" className="min-w-[160px]">
                  <Link href="/videos">{t('viewAll')}</Link>
                </Button>
              )}
            </div>
          )}
        </div>
      </section>

      <Suspense fallback={null}>
        <VideoModal
          video={selectedVideo}
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          placeholderUrl={placeholderUrl}
          youtubeLabel={tConsent('loadYouTube')}
        />
      </Suspense>
    </>
  )
}
