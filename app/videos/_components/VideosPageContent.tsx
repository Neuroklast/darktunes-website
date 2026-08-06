'use client'

import { useState, useMemo, lazy, Suspense } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { motion, useReducedMotion } from 'framer-motion'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Play, ArrowLeft, ArrowRight, MagnifyingGlass } from '@phosphor-icons/react'
import { useLocale, useTranslations } from 'next-intl'
import { toBcp47 } from '@/i18n/locales'
import type { Video } from '@/types'
import { getOptimizedImageUrl } from '@/lib/imageUtils'

const VideoModal = lazy(() =>
  import('@/components/VideoModal').then((m) => ({ default: m.VideoModal }))
)

interface VideosPageContentProps {
  videos: Video[]
  placeholderUrl?: string
  videosPerPage: number
}

const listVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.03 } },
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
}

export function VideosPageContent({
  videos,
  placeholderUrl,
  videosPerPage,
}: VideosPageContentProps) {
  const t = useTranslations('videos')
  const tConsent = useTranslations('consent')
  const locale = useLocale()
  const dateLocale = toBcp47(locale)
  const [query, setQuery] = useState('')
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [page, setPage] = useState(1)
  const prefersReducedMotion = useReducedMotion()

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return videos
    return videos.filter(
      (v) =>
        v.title.toLowerCase().includes(q) ||
        v.artistName.toLowerCase().includes(q),
    )
  }, [videos, query])

  const perPage = Math.max(1, videosPerPage)
  const totalPages = Math.ceil(filtered.length / perPage)
  const currentPage = Math.min(page, Math.max(1, totalPages))
  const pageVideos = filtered.slice((currentPage - 1) * perPage, currentPage * perPage)

  const handleQueryChange = (value: string) => {
    setQuery(value)
    setPage(1)
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto px-4 lg:px-8 py-12">
        {/* Back link */}
        <Link
          href="/#videos"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-accent transition-colors mb-8"
        >
          <ArrowLeft size={16} weight="bold" aria-hidden="true" />
          Back
        </Link>

        {/* Header */}
        <div className="mb-10">
          <h1 className="text-5xl lg:text-6xl font-bold mb-4 tracking-tight">{t('heading')}</h1>
          <p className="text-xl text-muted-foreground font-serif mb-8">{t('subheading')}</p>

          {/* Search */}
          <div className="relative max-w-md">
            <MagnifyingGlass
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
              aria-hidden="true"
            />
            <Input
              type="search"
              placeholder={t('searchPlaceholder')}
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              className="pl-10"
              aria-label={t('searchPlaceholder')}
            />
          </div>
        </div>

        {/* Count */}
        {query && (
          <p className="text-sm text-muted-foreground font-mono mb-6">
            {filtered.length} result{filtered.length !== 1 ? 's' : ''}
          </p>
        )}

        {filtered.length === 0 ? (
          <p className="text-center text-muted-foreground font-mono py-16">
            {t('noVideos')}
          </p>
        ) : (
          <>
            {/* key={currentPage} forces remount on page change so initial→visible
                animation replays and new items animate in. */}
            <motion.ul
              key={currentPage}
              className="list-none grid sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-10"
              variants={prefersReducedMotion ? undefined : listVariants}
              initial={prefersReducedMotion ? { opacity: 1 } : 'hidden'}
              animate={prefersReducedMotion ? { opacity: 1 } : 'visible'}
            >
              {pageVideos.map((video) => (
                <motion.li
                  key={video.id}
                  className="flex"
                  variants={prefersReducedMotion ? undefined : itemVariants}
                >
                  <Card
                    className="glow-card group overflow-hidden bg-card border-border hover:border-accent/50 transition-all duration-300 cursor-pointer flex flex-col w-full"
                    onClick={() => {
                      setSelectedVideo(video)
                      setModalOpen(true)
                    }}
                  >
                    <div className="relative aspect-video overflow-hidden shrink-0">
                      <Image
                        src={getOptimizedImageUrl(video.thumbnailUrl ?? '', 600)}
                        alt={`${video.title} – video thumbnail`}
                        fill
                        unoptimized
                        className="object-cover transform-gpu group-hover:scale-110 transition-transform duration-500"
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      />
                      <div className="absolute inset-0 bg-black/40 group-hover:bg-black/60 transition-colors flex items-center justify-center">
                        <Button
                          size="lg"
                          aria-label={`Play ${video.title}`}
                          className="bg-accent text-accent-foreground hover:bg-accent/90 rounded-full w-16 h-16 p-0 hover:scale-110 transition-transform"
                          tabIndex={-1}
                        >
                          <Play size={28} weight="fill" aria-hidden="true" />
                        </Button>
                      </div>
                    </div>
                    <div className="p-5 flex flex-col flex-1">
                      <Badge className="mb-2 bg-primary/20 text-primary-foreground border-primary/30 uppercase tracking-wider font-mono text-xs self-start">
                        {video.artistName}
                      </Badge>
                      <h3 className="text-base font-bold mb-2 group-hover:text-accent transition-colors flex-1">
                        {video.title}
                      </h3>
                      <p className="text-xs text-muted-foreground font-mono mt-auto">
                        {new Date(video.publishedAt).toLocaleDateString(dateLocale, {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </p>
                    </div>
                  </Card>
                </motion.li>
              ))}
            </motion.ul>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-4">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  aria-label="Previous page"
                >
                  <ArrowLeft size={18} aria-hidden="true" />
                </Button>
                <span className="text-sm text-muted-foreground font-mono">
                  {currentPage} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  aria-label="Next page"
                >
                  <ArrowRight size={18} aria-hidden="true" />
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      <Suspense>
        <VideoModal
          video={selectedVideo}
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          placeholderUrl={placeholderUrl}
          youtubeLabel={tConsent('loadYouTube')}
        />
      </Suspense>
    </div>
  )
}
