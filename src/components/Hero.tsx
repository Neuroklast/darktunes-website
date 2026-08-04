'use client'

import { useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { motion, useReducedMotion, useInView } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { ScrollReveal } from '@/components/animations/ScrollReveal'
import { Badge } from '@/components/ui/badge'
import { Play, ArrowDown } from '@phosphor-icons/react'
import { useSmoothScrollToAnchor } from '@/hooks/useSmoothScrollToAnchor'
import { getOptimizedImageUrl } from '@/lib/imageUtils'
import logoImage from '@/assets/images/logo_(1).png'
import { useTranslations } from 'next-intl'
import type { Release, NewsPost, SiteSettings } from '@/types'
import type { SectionProps } from '@/lib/component-contracts'
import { resolveHeroItemDescription } from '@/lib/heroPromoTeaser'

interface HeroProps extends SectionProps {
  heroItem?: Release | NewsPost
  siteSettings: SiteSettings
  /** Slug of the artist associated with the current hero item. When present,
   *  the secondary "Explore Artist" button links to /artists/[artistSlug]. */
  artistSlug?: string
}

function isRelease(item: Release | NewsPost): item is Release {
  return 'artistName' in item
}

export function Hero({ heroItem, siteSettings, artistSlug }: HeroProps) {
  const t = useTranslations('hero')
  const prefersReducedMotion = useReducedMotion()
  const sectionRef = useRef<HTMLElement>(null)
  // Stop the bounce animation as soon as the hero scrolls out of view so the
  // Framer Motion rAF loop doesn't keep running while the user reads below.
  const isInView = useInView(sectionRef, { margin: '0px 0px -20% 0px' })
  // Must be called unconditionally before any early returns (Rules of Hooks).
  const handleSmoothScroll = useSmoothScrollToAnchor()

  // ── Logo-only fallback when nothing is featured ──────────────────────────
  if (!heroItem) {
    const logoSrc = siteSettings.logoUrl
      ? getOptimizedImageUrl(siteSettings.logoUrl, 320)
      : logoImage.src
    return (
      <section
        id="hero"
        ref={sectionRef}
        className="relative min-h-screen flex items-center justify-center pt-28 md:pt-32 pb-16"
      >
        <motion.div
          initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.8 }}
          className="flex flex-col items-center gap-6 text-center"
        >
          <Image
            src={logoSrc}
            alt={siteSettings.labelName}
            width={320}
            height={120}
            className="h-24 w-auto object-contain md:h-36"
            priority
          />
          {siteSettings.labelTagline && (
            <p className="text-lg md:text-xl text-muted-foreground font-serif max-w-md leading-relaxed">
              {siteSettings.labelTagline}
            </p>
          )}
        </motion.div>
      </section>
    )
  }

  const itemIsRelease = isRelease(heroItem)

  /**
   * Background image hierarchy (highest priority first):
   * 1) Item-specific hero background (`release.heroBgUrl` / `news.heroBgUrl`)
   * 2) Global override (`siteSettings.heroCustomBgUrl`)
   * 3) Item cover fallback (`release.coverArt` / `news.imageUrl`)
   */
  let bgUrl: string | undefined
  if (heroItem.heroBgUrl) {
    bgUrl = getOptimizedImageUrl(heroItem.heroBgUrl, 1200)
  } else if (siteSettings.heroCustomBgUrl) {
    bgUrl = getOptimizedImageUrl(siteSettings.heroCustomBgUrl, 1200)
  } else if (itemIsRelease) {
    bgUrl = getOptimizedImageUrl(heroItem.coverArt, 1200)
  } else if (heroItem.imageUrl) {
    bgUrl = getOptimizedImageUrl(heroItem.imageUrl, 1200)
  }

  // Title / subtitle / description
  const heroTitle = heroItem.title
  const heroSubtitle = itemIsRelease
    ? (heroItem.artists && heroItem.artists.length > 0
        ? heroItem.artists.map((a) => a.name).join(', ')
        : heroItem.artistName)
    : undefined
  // Item promo/excerpt always wins. Global heroDescription is only used when
  // the featured release/news has no own body text (never mixed with promo).
  const heroDescription = resolveHeroItemDescription(
    itemIsRelease
      ? {
          kind: 'release',
          promoText: heroItem.promoText,
          fallback: siteSettings.heroDescription,
        }
      : {
          kind: 'news',
          excerpt: heroItem.excerpt,
          fallback: siteSettings.heroDescription,
        },
  )
  const heroLink = itemIsRelease
    ? `/releases/${heroItem.id}`
    : `/news/${heroItem.slug}`
  const coverImageUrl = itemIsRelease
    ? getOptimizedImageUrl(heroItem.coverArt, 800)
    : heroItem.imageUrl
    ? getOptimizedImageUrl(heroItem.imageUrl, 800)
    : undefined

  // ── Hero button resolution ──────────────────────────────────────────────
  // Primary button
  const rawPrimary = heroItem.heroPrimaryBtn
  const primaryLabel =
    rawPrimary?.label ||
    siteSettings.heroDefaultPrimaryBtnLabel ||
    (!itemIsRelease ? t('readMore') : t('listenNow'))
  const primaryAction = rawPrimary?.action || 'link'
  const primaryHref = rawPrimary?.href || heroLink

  // Secondary button
  const rawSecondary = heroItem.heroSecondaryBtn
  const secondaryLabel =
    rawSecondary?.label ||
    siteSettings.heroDefaultSecondaryBtnLabel ||
    t('exploreArtist')
  // Default action: navigate to the artist page when a slug is known,
  // otherwise fall back to scrolling the relevant section.
  const defaultSecondaryAction = artistSlug ? 'link' : 'scroll'
  const defaultSecondaryHref = artistSlug
    ? `/artists/${artistSlug}`
    : (!itemIsRelease ? '#news' : '#releases')
  const secondaryAction = rawSecondary?.action || defaultSecondaryAction
  const secondaryHref = rawSecondary?.href || defaultSecondaryHref

  return (
    <section id="hero" ref={sectionRef} className="relative min-h-screen flex items-center justify-center pt-28 md:pt-32 pb-16">
      {/* Hero background — Next.js Image with priority delivers fetchPriority="high"
          + eager loading for the LCP image before CSSOM construction completes. */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        {bgUrl && (
          <Image
            src={bgUrl}
            alt=""
            aria-hidden="true"
            fill
            className="object-cover object-center"
            sizes="100vw"
            priority
            fetchPriority="high"
            unoptimized
          />
        )}
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(to bottom, rgba(var(--background-rgb), 0.55), rgba(var(--background-rgb), 0.85))`,
          }}
        />
      </div>
      
      <div className="container mx-auto px-4 lg:px-16 z-10">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <ScrollReveal delay={0.2} className="min-w-0 space-y-8">
            <Badge className="bg-secondary/90 text-secondary-foreground uppercase tracking-wider font-bold text-sm px-4 py-2 backdrop-blur-sm">
              {itemIsRelease ? siteSettings.heroBadge : (siteSettings.heroNewsBadge || '📰 News')}
            </Badge>
            
            <div className="space-y-4">
              <h1 className="max-w-full text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-bold leading-none tracking-tight break-words text-balance">
                {heroTitle}
              </h1>
              {heroSubtitle && (
                <p className="text-xl sm:text-3xl md:text-4xl lg:text-5xl text-muted-foreground font-medium font-serif">
                  {heroSubtitle}
                </p>
              )}
            </div>

            {heroDescription && (
              <p className="text-lg md:text-xl text-muted-foreground max-w-xl font-serif leading-relaxed line-clamp-4">
                {heroDescription}
              </p>
            )}

            <div className="flex flex-wrap gap-4 items-center">
              {primaryAction !== 'none' && (
                primaryAction === 'scroll' ? (
                  <Button
                    size="lg"
                    className="bg-accent text-accent-foreground hover:bg-accent/90 font-bold uppercase tracking-wider text-base px-8 py-6"
                    onClick={(e) => handleSmoothScroll(e, primaryHref)}
                  >
                    <Play className="mr-2" weight="fill" size={20} aria-hidden="true" />
                    {primaryLabel}
                  </Button>
                ) : (
                  <Button
                    size="lg"
                    className="bg-accent text-accent-foreground hover:bg-accent/90 font-bold uppercase tracking-wider text-base px-8 py-6"
                    asChild
                  >
                    {primaryHref.startsWith('http') ? (
                      <a href={primaryHref} target="_blank" rel="noopener noreferrer">
                        <Play className="mr-2" weight="fill" size={20} aria-hidden="true" />
                        {primaryLabel}
                      </a>
                    ) : (
                      <Link href={primaryHref}>
                        <Play className="mr-2" weight="fill" size={20} aria-hidden="true" />
                        {primaryLabel}
                      </Link>
                    )}
                  </Button>
                )
              )}
              {secondaryAction !== 'none' && (
                secondaryAction === 'link' ? (
                  <Button
                    size="lg"
                    variant="outline"
                    className="border-2 font-bold uppercase tracking-wider text-base px-8 py-6 hover:bg-primary hover:text-primary-foreground hover:border-primary"
                    asChild
                  >
                  {secondaryHref.startsWith('http') ? (
                    <a href={secondaryHref} target="_blank" rel="noopener noreferrer">
                      {secondaryLabel}
                    </a>
                  ) : (
                    <Link href={secondaryHref}>
                      {secondaryLabel}
                    </Link>
                  )}
                </Button>
                ) : (
                  <Button
                    size="lg"
                    variant="outline"
                    className="border-2 font-bold uppercase tracking-wider text-base px-8 py-6 hover:bg-primary hover:text-primary-foreground hover:border-primary"
                    onClick={(e) => handleSmoothScroll(e, secondaryHref)}
                  >
                    {secondaryLabel}
                  </Button>
                )
              )}
            </div>
          </ScrollReveal>

          {coverImageUrl && (
            <ScrollReveal delay={0.4} className="relative hidden lg:block">
              <div className="glow-card relative aspect-square rounded-lg overflow-hidden shadow-2xl shadow-accent/20">
                <Image 
                  src={coverImageUrl}
                  alt={heroTitle}
                  fill
                  className="object-cover"
                  sizes="50vw"
                  unoptimized
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent" />
              </div>
            </ScrollReveal>
          )}
        </div>
      </div>

      {/* Scroll-down indicator — bounce animation stops when hero leaves the
          viewport to prevent a permanent rAF loop while the page is scrolled. */}
      <motion.div
        aria-hidden="true"
        className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2 text-muted-foreground"
        animate={(!prefersReducedMotion && isInView) ? { y: [0, 10, 0] } : { y: 0 }}
        transition={
          (!prefersReducedMotion && isInView)
            ? { duration: 2, repeat: Infinity, ease: 'easeInOut' }
            : { duration: 0 }
        }
      >
        <p className="text-sm uppercase tracking-widest font-mono">{t('scrollDown')}</p>
        <ArrowDown size={20} weight="bold" />
      </motion.div>
    </section>
  )
}
