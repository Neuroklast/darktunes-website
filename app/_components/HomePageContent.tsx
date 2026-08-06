'use client'

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { Hero } from '@/components/Hero'
import { News } from '@/components/News'
import { Concerts } from '@/components/Concerts'
import { NewsletterSection } from '@/components/NewsletterSection'
import { CaretLeft, CaretRight } from '@phosphor-icons/react'

const Releases = dynamic(
  () => import('@/components/Releases').then((m) => m.Releases),
  {
    ssr: false,
    loading: () => <div className="h-96 rounded-xl bg-muted/30 animate-pulse" aria-hidden="true" />,
  },
)

const Videos = dynamic(
  () => import('@/components/Videos').then((m) => m.Videos),
  {
    ssr: false,
    loading: () => <div className="h-80 rounded-xl bg-muted/30 animate-pulse" aria-hidden="true" />,
  },
)
import { DEFAULT_SECTION_ORDER } from '@/config/sections'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import type { Release, NewsPost, Video, SiteSettings, Concert, HomepageSection } from '@/types'
import type { PublicArtist } from '@/lib/api/publicArtist'
import { selectHeroItems } from '@/lib/heroFeatured'

interface HomePageContentProps {
  releases: Release[]
  news: NewsPost[]
  videos: Video[]
  concerts: Concert[]
  siteSettings: SiteSettings
  artists?: PublicArtist[]
}

const SpotifyMultiPlayer = dynamic(
  () => import('@/components/SpotifyMultiPlayer').then((module) => module.SpotifyMultiPlayer),
  {
    ssr: false,
    loading: () => <div className="h-[352px] rounded-md bg-muted/40 animate-pulse" aria-hidden="true" />,
  },
)

/**
 * Client Component that renders the full home page.
 * Data is fetched server-side in app/page.tsx (RSC) and passed as props.
 * This component handles all interactive UI — animations, modals, smooth scroll.
 *
 */
export function HomePageContent({
  releases,
  news,
  videos,
  concerts,
  siteSettings,
  artists,
}: HomePageContentProps) {
  const tSpotify = useTranslations('spotify')
  const prefersReducedMotion = useReducedMotion()
  const heroItems = useMemo<(Release | NewsPost)[]>(() => {
    return selectHeroItems(releases, news, siteSettings)
  }, [releases, news, siteSettings])

  const heroItemsKey = useMemo(() => heroItems.map((item) => item.id).join('|'), [heroItems])
  const [heroState, setHeroState] = useState<{ key: string; index: number }>({ key: '', index: 0 })
  const heroIndex = heroState.key === heroItemsKey ? heroState.index : 0

  useEffect(() => {
    if (heroItems.length <= 1) return
    const intervalId = setInterval(() => {
      setHeroState((previousState) => ({
        key: heroItemsKey,
        index:
          previousState.key === heroItemsKey
            ? (previousState.index + 1) % heroItems.length
            : 1 % heroItems.length,
      }))
    }, 6000)
    return () => clearInterval(intervalId)
  }, [heroItemsKey, heroItems.length])

  const currentHeroItem = heroItems[heroIndex] ?? heroItems[0]

  // Resolve the artist slug for the "Explore Artist" secondary hero button.
  // Looks up the artist by artistId from the pre-fetched artists list so no
  // additional network request is needed at render time.
  const heroArtistSlug = useMemo<string | undefined>(() => {
    const artistId = currentHeroItem && 'artistId' in currentHeroItem ? currentHeroItem.artistId : undefined
    if (!artistId || !artists?.length) return undefined
    return artists.find((a) => a.id === artistId)?.slug
  }, [currentHeroItem, artists])
  const playlists =
    siteSettings.spotifyPlaylists?.length
      ? siteSettings.spotifyPlaylists
      : [{ label: 'Label Playlist', uri: siteSettings.spotifyPlaylistUri }]

  const sectionOrder = siteSettings.homepageSectionOrder ?? DEFAULT_SECTION_ORDER

  function renderSection(section: HomepageSection) {
    switch (section) {
      case 'releases':
        return (
          <motion.div
            key="releases"
            id="releases"
            initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.4 }}
          >
            <Releases
              releases={releases}
              heading={siteSettings.releasesSectionHeading}
              subheading={siteSettings.releasesSectionSubheading}
              autoplayMs={siteSettings.carouselAutoplayMs ?? 0}
            />
          </motion.div>
        )
      case 'spotify':
        return (
          <section key="spotify" id="spotify-player" className="py-12 px-4 lg:px-16">
            <div className="container mx-auto">
              <motion.div
                initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: prefersReducedMotion ? 0 : 0.6 }}
                className="mb-8 text-center"
              >
                <h2 className="text-4xl lg:text-5xl font-bold mb-4 tracking-tight">
                  {siteSettings.spotifySectionHeading || tSpotify('heading')}
                </h2>
                <p className="text-lg text-muted-foreground font-serif">
                  {siteSettings.spotifySectionSubheading || tSpotify('subheading')}
                </p>
              </motion.div>
              <SpotifyMultiPlayer
                playlists={playlists}
              />
            </div>
          </section>
        )
      case 'videos':
        return (
          <div key="videos" id="videos">
            <Videos
              videos={videos}
              placeholderUrl={siteSettings.consentPlaceholderUrl || undefined}
              heading={siteSettings.videosSectionHeading}
              subheading={siteSettings.videosSectionSubheading}
              videosPerPage={siteSettings.videosPerPage}
              videosLinkToPage={siteSettings.videosLinkToPage}
            />
          </div>
        )
      case 'concerts':
        return (
          <div key="concerts" id="concerts">
            <Concerts
              concerts={concerts}
              heading={siteSettings.concertsSectionHeading}
              subheading={siteSettings.concertsSectionSubheading}
              concertsPerPage={siteSettings.concertsPerPage}
              concertsLinkToPage={siteSettings.concertsLinkToPage}
            />
          </div>
        )
      case 'news':
        return (
          <div key="news" id="news">
            <News
              news={news}
              heading={siteSettings.newsSectionHeading}
              subheading={siteSettings.newsSectionSubheading}
              sneakPeekCount={siteSettings.homepageNewsCount}
            />
          </div>
        )
      case 'newsletter':
        return (
          <div key="newsletter" id="newsletter">
            <NewsletterSection
              heading={siteSettings.newsletterHeading}
              description={siteSettings.newsletterDescription}
            />
          </div>
        )
      default:
        return null
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground relative">
      <main id="main-content">
        <div className="relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentHeroItem?.id ?? 'hero'}
              initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={prefersReducedMotion ? { opacity: 1 } : { opacity: 0 }}
              transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.6, ease: 'easeInOut' }}
            >
              <Hero heroItem={currentHeroItem} siteSettings={siteSettings} artistSlug={heroArtistSlug} />
            </motion.div>
          </AnimatePresence>
          {heroItems.length > 1 && (
            <>
              {/* Left arrow */}
              <button
                type="button"
                aria-label="Previous hero item"
                onClick={() => setHeroState({ key: heroItemsKey, index: (heroIndex - 1 + heroItems.length) % heroItems.length })}
                className="absolute left-4 top-1/2 -translate-y-1/2 z-20 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full bg-background/30 hover:bg-background/60 backdrop-blur-sm text-white/70 hover:text-white border border-white/10 hover:border-white/30 transition-all duration-200"
              >
                <CaretLeft size={20} weight="bold" />
              </button>
              {/* Right arrow */}
              <button
                type="button"
                aria-label="Next hero item"
                onClick={() => setHeroState({ key: heroItemsKey, index: (heroIndex + 1) % heroItems.length })}
                className="absolute right-4 top-1/2 -translate-y-1/2 z-20 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full bg-background/30 hover:bg-background/60 backdrop-blur-sm text-white/70 hover:text-white border border-white/10 hover:border-white/30 transition-all duration-200"
              >
                <CaretRight size={20} weight="bold" />
              </button>
              {/* Dot indicators */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex gap-1">
                {heroItems.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setHeroState({ key: heroItemsKey, index: i })}
                    aria-label={`Show hero item ${i + 1}`}
                    className="p-3 min-w-[44px] min-h-[44px] flex items-center justify-center"
                  >
                    <span
                      className={`block rounded-full transition-all duration-300 ${i === heroIndex ? 'w-3 h-3 bg-accent scale-125' : 'w-2.5 h-2.5 bg-muted-foreground/50 hover:bg-muted-foreground'}`}
                    />
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {sectionOrder.map((section) => renderSection(section))}
      </main>
    </div>
  )
}
