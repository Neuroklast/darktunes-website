'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { ScrollReveal } from '@/components/animations/ScrollReveal'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowRight, Calendar } from '@phosphor-icons/react'
import { getOptimizedImageUrl } from '@/lib/imageUtils'
import { useLocale, useTranslations } from 'next-intl'
import { toBcp47 } from '@/i18n/locales'
import type { NewsPost } from '@/types'
import type { SectionProps } from '@/lib/component-contracts'

interface NewsProps extends SectionProps {
  news: NewsPost[]
  heading?: string
  subheading?: string
  /** Number of news items shown as a sneak peek. Defaults to 3. */
  sneakPeekCount?: number
}

/** Number of news items shown as a sneak peek on the homepage. */
const DEFAULT_SNEAK_PEEK_COUNT = 3

export function News({ news, heading, subheading, sneakPeekCount }: NewsProps) {
  const t = useTranslations('news')
  const locale = useLocale()
  const dateLocale = toBcp47(locale)
  const sectionHeading = heading ?? t('heading')
  const sectionSubheading = subheading ?? t('subheading')
  const count = sneakPeekCount && sneakPeekCount > 0 ? sneakPeekCount : DEFAULT_SNEAK_PEEK_COUNT
  const sneakPeek = news.slice(0, count)
  const hasMore = news.length > count
  return (
    <section id="news" className="py-24 px-4 lg:px-16 scroll-mt-36">
      <div className="container mx-auto">
        <ScrollReveal className="mb-12 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-5xl lg:text-6xl font-bold mb-4 tracking-tight">{sectionHeading}</h2>
            <p className="text-xl text-muted-foreground">{sectionSubheading}</p>
          </div>
          <Button variant="ghost" className="group/btn hover:text-accent px-0 uppercase tracking-wider font-bold" asChild>
            <Link href="/news">
              {t('viewAll')}
              <ArrowRight className="ml-2 group-hover/btn:translate-x-2 transition-transform" weight="bold" />
            </Link>
          </Button>
        </ScrollReveal>

        <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 list-none">
          {sneakPeek.map((post, index) => (
            <li key={post.id} className="h-full">
              <ScrollReveal className="h-full">
                <Link href={`/news/${post.slug}`} className="block h-full">
                <Card className="glow-card group bg-card border-border overflow-hidden hover:border-accent/50 transition-all duration-300 h-full flex flex-col">
                {post.imageUrl && (
                  <div className="relative aspect-[16/9] overflow-hidden flex-shrink-0">
                    <Image
                      src={getOptimizedImageUrl(post.imageUrl, 800)}
                      alt={post.title}
                      fill
                      priority={index === 0}
                      unoptimized
                      className="object-cover group-hover:scale-110 transition-transform duration-500"
                      sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-background/60 to-transparent" />
                  </div>
                )}
                <div className="p-5 flex flex-col flex-1">
                  <Badge className="self-start mb-3 bg-primary/20 text-primary-foreground border-primary/30 uppercase font-mono text-xs tracking-widest flex items-center gap-2">
                    <Calendar size={12} weight="bold" />
                    {new Date(post.publishedAt).toLocaleDateString(dateLocale, {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </Badge>
                  <h3 className="text-xl font-bold mb-3 group-hover:text-accent transition-colors leading-tight line-clamp-2">
                    {post.title}
                  </h3>
                  <p className="text-muted-foreground mb-4 leading-relaxed text-sm line-clamp-3 flex-1">
                    {post.excerpt}
                  </p>
                  <span
                    className="self-start group/btn flex items-center text-accent px-0 uppercase tracking-wider font-bold text-xs mt-auto"
                  >
                    {t('readFullStory')}
                    <ArrowRight className="ml-2 group-hover:translate-x-2 transition-transform" weight="bold" />
                  </span>
                </div>
              </Card>
              </Link>
             </ScrollReveal>
           </li>
          ))}
        </ul>

        {hasMore && (
          <ScrollReveal className="mt-10 flex justify-center">
            <Button size="lg" variant="outline" className="gap-2 font-bold uppercase tracking-wider hover:bg-accent hover:text-accent-foreground hover:border-accent" asChild>
              <Link href="/news">
                {t('viewAll')}
                <ArrowRight weight="bold" />
              </Link>
            </Button>
          </ScrollReveal>
        )}
      </div>
    </section>
  )
}
