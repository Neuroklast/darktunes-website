'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { ScrollReveal } from '@/components/animations/ScrollReveal'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Calendar, MapPin, Ticket, ArrowRight, ArrowLeft, MagnifyingGlass } from '@phosphor-icons/react'
import { useLocale, useTranslations } from 'next-intl'
import { toBcp47 } from '@/i18n/locales'
import type { Concert } from '@/types'
import type { SectionProps } from '@/lib/component-contracts'

interface ConcertsProps extends SectionProps {
  concerts: Concert[]
  heading?: string
  subheading?: string
  /** Number of concerts per page (default: 8). */
  concertsPerPage?: number
  /** When true, show only the first page and add a "View all" link to /events. */
  concertsLinkToPage?: boolean
}

export function Concerts({ concerts, heading, subheading, concertsPerPage = 8, concertsLinkToPage = false }: ConcertsProps) {
  const t = useTranslations('concerts')
  const locale = useLocale()
  const dateLocale = toBcp47(locale)
  const sectionHeading = heading ?? t('heading')
  const sectionSubheading = subheading ?? t('subheading')
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  const filteredConcerts = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return concerts
    return concerts.filter(
      (c) =>
        (c.artistName?.toLowerCase().includes(q) ?? false) ||
        (c.eventName?.toLowerCase().includes(q) ?? false) ||
        (c.venueName?.toLowerCase().includes(q) ?? false) ||
        (c.venueCity?.toLowerCase().includes(q) ?? false),
    )
  }, [concerts, query])

  const perPage = Math.max(1, concertsPerPage)
  const totalPages = Math.ceil(filteredConcerts.length / perPage)
  const effectiveTotalPages = concertsLinkToPage ? 1 : totalPages
  const currentPage = Math.min(page, Math.max(1, effectiveTotalPages))
  const pageConcerts = filteredConcerts.slice((currentPage - 1) * perPage, currentPage * perPage)

  // Reset to first page when the search query changes
  useEffect(() => { setPage(1) }, [query])

  useEffect(() => {
    listRef.current?.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [currentPage])

  return (
    <section id="events" className="py-24 px-4 lg:px-16 scroll-mt-36">
      <div className="container mx-auto">
        <ScrollReveal className="mb-12 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-5xl lg:text-6xl font-bold mb-4 tracking-tight">{sectionHeading}</h2>
            <p className="text-xl text-muted-foreground font-serif">{sectionSubheading}</p>
          </div>
          {(
            <Button variant="ghost" className="group/btn hover:text-accent px-0 uppercase tracking-wider font-bold" asChild>
              <Link href="/events">
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

        {filteredConcerts.length === 0 && concerts.length > 0 ? (
          <p className="text-center text-muted-foreground font-mono py-12">
            {t('noResults')}
          </p>
        ) : concerts.length === 0 ? (
          <ScrollReveal>
            <Card className="bg-card border-border p-8 text-center">
              <p className="text-lg font-semibold mb-2">{t('noShows')}</p>
              <p className="text-muted-foreground">{t('checkBack')}</p>
            </Card>
          </ScrollReveal>
        ) : (
          <div ref={listRef} className="space-y-4">
            {pageConcerts.map((concert) => {
              const isCancelled = concert.status === 'cancelled'
              const location = [concert.venueCity, concert.venueCountry].filter(Boolean).join(', ')
              return (
                <ScrollReveal key={concert.id}>
                  <Card className="bg-card border-border p-5 md:p-6 relative group cursor-pointer hover:border-accent/50 transition-colors">
                    {/* Invisible full-card overlay link — sits behind all content */}
                    <Link
                      href={`/events/${concert.id}`}
                      aria-label={`${concert.artistName} – ${concert.eventName}`}
                      className="absolute inset-0 z-0 rounded-[inherit]"
                    />
                    <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between relative z-10 pointer-events-none">
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-sm uppercase tracking-wider text-muted-foreground">
                          <Calendar size={16} />
                          <span className={isCancelled ? 'line-through' : ''}>
                            {new Date(concert.concertDate).toLocaleDateString(dateLocale, {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                            })}
                          </span>
                          {isCancelled && (
                            <Badge variant="destructive" className="uppercase tracking-wide">
                              {t('cancelled')}
                            </Badge>
                          )}
                        </div>
                        <p className="text-2xl font-bold tracking-tight">{concert.artistName}</p>
                        <p className="text-muted-foreground">{concert.eventName}</p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <MapPin size={16} />
                          <span>{[concert.venueName, location].filter(Boolean).join(' · ')}</span>
                        </div>
                      </div>

                      {concert.ticketUrl && (
                        <Button asChild className="uppercase tracking-wider font-bold relative z-20 pointer-events-auto">
                          <a
                            href={concert.ticketUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`${t('ticketLink')} (${t('opensInNewTab')})`}
                          >
                            <Ticket size={16} className="mr-2" />
                            {t('ticketLink')}
                          </a>
                        </Button>
                      )}
                    </div>
                  </Card>
                </ScrollReveal>
              )
            })}
          </div>
        )}

        {/* Pagination controls */}
        {(effectiveTotalPages > 1 || concertsLinkToPage) && (
          <div className="flex items-center justify-center gap-4 mt-12">
            {effectiveTotalPages > 1 && (
              <>
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
                  {currentPage} / {effectiveTotalPages}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setPage((p) => Math.min(effectiveTotalPages, p + 1))}
                  disabled={currentPage >= effectiveTotalPages}
                  aria-label="Next page"
                >
                  <ArrowRight size={18} aria-hidden="true" />
                </Button>
              </>
            )}
            {concertsLinkToPage && filteredConcerts.length > perPage && (
              <Button asChild variant="outline" size="lg" className="min-w-[160px]">
                <Link href="/events">{t('viewAll')}</Link>
              </Button>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
