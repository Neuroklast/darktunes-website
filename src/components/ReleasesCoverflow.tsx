'use client'

import { useCallback, useEffect, useRef, useState, useMemo } from 'react'
import type { AnchorHTMLAttributes, MouseEvent } from 'react'
import { useReducedMotion } from 'framer-motion'
import Image from 'next/image'
import Link from 'next/link'
import { Calendar, CaretLeft, CaretRight } from '@phosphor-icons/react'
import { Swiper, SwiperSlide } from 'swiper/react'
import { Autoplay, EffectCoverflow, Keyboard, Virtual } from 'swiper/modules'
import type { Swiper as SwiperType } from 'swiper/types'
import { Badge } from '@/components/ui/badge'
import { getSquareThumbnail } from '@/lib/imageUtils'
import { cn } from '@/lib/utils'
import { useLocale, useTranslations } from 'next-intl'
import { toBcp47 } from '@/i18n/locales'
import type { Release } from '@/types'
import 'swiper/css'
import 'swiper/css/effect-coverflow'

export interface ReleasesCoverflowProps {
  releases: Release[]
  autoplayMs?: number
}

const MAX_DOTS = 12
const DOTS_THRESHOLD = 50

function SlideContent({
  release,
  isActive,
  onActivate,
  onOverlayClick,
  featuredLabel,
  openAriaLabel,
}: {
  release: Release
  isActive: boolean
  onActivate: () => void
  onOverlayClick: AnchorHTMLAttributes<HTMLAnchorElement>['onClick']
  featuredLabel: string
  openAriaLabel: string
}) {
  const [isLoaded, setIsLoaded] = useState(false)

  return (
    <div className="relative aspect-square w-full h-full group">
      <div
        aria-hidden="true"
        className={cn(
          'absolute inset-0 overflow-hidden rounded-lg border transition-all duration-300',
          isActive
            ? 'border-accent/60 shadow-[0_8px_40px_-8px_rgba(73,54,135,0.6)] opacity-100'
            : 'border-border opacity-60',
        )}
      >
        {!isLoaded && (
          <div className="absolute inset-0 animate-pulse bg-muted z-0 flex items-center justify-center">
            <div className="h-8 w-8 border-2 border-muted-foreground/30 border-t-accent rounded-full animate-spin" />
          </div>
        )}
        <Image
          src={getSquareThumbnail(release.coverArt, 600)}
          alt={`${release.title} by ${release.artistName} – cover art`}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 40vw, 30vw"
          unoptimized
          className="object-cover relative z-10"
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={() => setIsLoaded(true)}
          onError={(e) => {
            console.error('[ReleasesCoverflow] Image load failed:', release.id)
            e.currentTarget.style.display = 'none'
          }}
        />
        {release.featured && (
          <Badge className="absolute right-3 top-3 bg-secondary/90 text-secondary-foreground text-xs font-bold uppercase tracking-wider backdrop-blur-sm z-20">
            {featuredLabel}
          </Badge>
        )}
      </div>

      {isActive ? (
        <Link
          href={`/releases/${release.id}`}
          aria-label={openAriaLabel}
          onClick={onOverlayClick}
          className="absolute inset-0 z-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent rounded-lg"
          draggable={false}
        />
      ) : (
        <button
          type="button"
          onClick={onActivate}
          aria-label="Bring to center"
          className="absolute inset-0 z-30 w-full h-full cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent rounded-lg"
        />
      )}
    </div>
  )
}

export function ReleasesCoverflow({ releases, autoplayMs = 0 }: ReleasesCoverflowProps) {
  const t = useTranslations('releases')
  const locale = useLocale()
  const total = releases.length
  const prefersReducedMotion = useReducedMotion() ?? false
  const swiperRef = useRef<SwiperType | null>(null)
  const isDragging = useRef(false)
  const [displayIndex, setDisplayIndex] = useState(0)
  const [formattedDates, setFormattedDates] = useState<string[]>([])
  const metaRef = useRef<HTMLDivElement>(null)
  const [isDesktop, setIsDesktop] = useState(true)

  // Responsive Detection (stabil + performant)
  useEffect(() => {
    const checkSize = () => setIsDesktop(window.innerWidth >= 1024)
    checkSize()
    const handleResize = () => {
      checkSize()
      // Swiper nach Resize aktualisieren
      setTimeout(() => swiperRef.current?.update(), 100)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Formatierte Daten
  useEffect(() => {
    const dateLocale = toBcp47(locale)
    setFormattedDates(
      releases.map((release) =>
        new Date(release.releaseDate).toLocaleDateString(dateLocale, {
          year: 'numeric', month: 'short', day: 'numeric',
        }),
      ),
    )
  }, [locale, releases])

  // Meta-Info Fade Animation
  useEffect(() => {
    const el = metaRef.current
    if (!el) return
    el.classList.remove('animate-in', 'fade-in', 'duration-200')
    void el.offsetHeight
    el.classList.add('animate-in', 'fade-in', 'duration-200')
  }, [displayIndex])

  const handlePrev = useCallback(() => swiperRef.current?.slidePrev(), [])
  const handleNext = useCallback(() => swiperRef.current?.slideNext(), [])

  const handleOverlayClick = useCallback((event: MouseEvent<HTMLAnchorElement>) => {
    if (isDragging.current) {
      event.preventDefault()
      isDragging.current = false
    }
  }, [])

  const goToIndex = useCallback((index: number) => {
    void (swiperRef.current?.slideToLoop?.(index) ?? swiperRef.current?.slideTo(index))
  }, [])

  const handleMouseEnter = useCallback(() => {
    if (autoplayMs > 0 && isDesktop) swiperRef.current?.autoplay?.stop()
  }, [autoplayMs, isDesktop])

  const handleMouseLeave = useCallback(() => {
    if (autoplayMs > 0 && isDesktop) swiperRef.current?.autoplay?.start()
  }, [autoplayMs, isDesktop])

  // Dynamische Konfiguration (Coverflow nur auf Desktop)
  const effect = isDesktop ? 'coverflow' : 'slide'

  const coverflowEffect = useMemo(() => {
    if (!isDesktop) return undefined
    return {
      rotate: 0,
      stretch: 0,
      depth: 100,
      modifier: 2.2,
      slideShadows: false,
      scale: 0.92,
    }
  }, [isDesktop])

  const autoplayConfig = useMemo(() => {
    if (!isDesktop || autoplayMs <= 0 || prefersReducedMotion) return false
    return { delay: autoplayMs, disableOnInteraction: false }
  }, [autoplayMs, prefersReducedMotion, isDesktop])

  const breakpoints = {
    0: { slidesPerView: 1.15, spaceBetween: 12 },
    640: { slidesPerView: 1.6, spaceBetween: 16 },
    1024: { slidesPerView: 2.4, spaceBetween: 20 },
    1280: { slidesPerView: 3.0, spaceBetween: 24 },
  }

  if (total === 0) return null

  const activeRelease = releases[displayIndex] ?? releases[0]
  const hiddenDotCount = Math.max(0, total - MAX_DOTS)

  return (
    <div
      className="relative py-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent max-w-6xl mx-auto"
      role="region"
      aria-label={t('coverflowRegionLabel')}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') { e.preventDefault(); handlePrev() }
        if (e.key === 'ArrowRight') { e.preventDefault(); handleNext() }
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="relative overflow-clip" data-lenis-prevent style={{ touchAction: 'pan-y pinch-zoom' }}>
        <Swiper
          key={isDesktop ? 'desktop' : 'mobile'} // Force re-init bei Wechsel
          modules={[EffectCoverflow, Keyboard, Autoplay, Virtual]}
          effect={effect}
          virtual={{ enabled: true }}
          centeredSlides
          grabCursor
          touchStartPreventDefault={false}
          passiveListeners
          watchOverflow
          threshold={8}
          preventClicks={false}
          preventClicksPropagation={false}
          observer
          observeParents
          keyboard={{ enabled: true }}
          autoplay={autoplayConfig}
          coverflowEffect={coverflowEffect}
          speed={prefersReducedMotion ? 0 : 380}
          breakpoints={breakpoints}
          onSwiper={(swiper) => {
            swiperRef.current = swiper
            setDisplayIndex(swiper.activeIndex)
          }}
          onSlideChangeTransitionEnd={(swiper) => setDisplayIndex(swiper.activeIndex)}
          onTouchStart={() => { isDragging.current = false }}
          onTouchMove={() => { isDragging.current = true }}
          className="pb-2"
        >
          {releases.map((release, index) => (
            <SwiperSlide key={release.id} virtualIndex={index}>
              {({ isActive }) => (
                <SlideContent
                  release={release}
                  isActive={isActive}
                  onOverlayClick={handleOverlayClick}
                  featuredLabel={t('featured')}
                  openAriaLabel={`${release.title} by ${release.artistName} – ${t('openReleaseAriaSuffix')}`}
                  onActivate={() => {
                    if (!isDragging.current) goToIndex(index)
                  }}
                />
              )}
            </SwiperSlide>
          ))}
        </Swiper>
      </div>

      {/* Meta Info */}
      <div ref={metaRef} className="animate-in fade-in duration-200 mt-6">
        <Link
          href={`/releases/${activeRelease.id}`}
          tabIndex={-1}
          aria-hidden="true"
          className="block px-4 text-center hover:opacity-80 transition-opacity"
        >
          <Badge variant="outline" className="uppercase text-xs font-mono tracking-widest border-primary/30">
            {activeRelease.type}
          </Badge>
          <h3 className="mt-2 text-xl font-bold line-clamp-1">{activeRelease.title}</h3>
          <p className="mt-1 text-sm font-medium text-muted-foreground">
            {activeRelease.artists?.length
              ? activeRelease.artists.map((a) => a.name).join(', ')
              : activeRelease.artistName}
          </p>
          <p className="mt-1 flex items-center justify-center gap-1.5 text-xs font-mono text-muted-foreground">
            <Calendar size={12} weight="bold" aria-hidden="true" />
            {formattedDates[displayIndex] ?? ''}
          </p>
        </Link>
      </div>

      {/* Navigation */}
      {total > 1 && (
        <div className="mt-5 flex items-center justify-center gap-6">
          <button
            onClick={handlePrev}
            aria-label={t('previousReleaseAriaLabel')}
            className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-full bg-muted p-3 transition-all hover:bg-accent hover:text-accent-foreground active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            <CaretLeft size={22} weight="bold" />
          </button>

          {total <= DOTS_THRESHOLD && (
            <div className="flex items-center gap-1.5" role="group">
              {releases.slice(0, MAX_DOTS).map((release, index) => (
                <button
                  key={release.id}
                  onClick={() => goToIndex(index)}
                  aria-label={t('goToReleaseAriaLabelTemplate', { index: index + 1, title: release.title })}
                  aria-pressed={index === displayIndex}
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <span
                    className={cn(
                      'h-2 rounded-full transition-all',
                      index === displayIndex ? 'w-7 bg-accent' : 'w-2 bg-muted-foreground/40 hover:bg-muted-foreground/70',
                    )}
                  />
                </button>
              ))}
              {hiddenDotCount > 0 && (
                <span className="pl-2 text-xs font-mono text-muted-foreground">+{hiddenDotCount}</span>
              )}
            </div>
          )}

          <button
            onClick={handleNext}
            aria-label={t('nextReleaseAriaLabel')}
            className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-full bg-muted p-3 transition-all hover:bg-accent hover:text-accent-foreground active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            <CaretRight size={22} weight="bold" />
          </button>
        </div>
      )}

      <p className="mt-2 text-center text-xs font-mono text-muted-foreground">
        {displayIndex + 1} / {total}
      </p>
    </div>
  )
}
