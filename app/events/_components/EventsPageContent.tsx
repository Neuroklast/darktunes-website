'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { motion, useReducedMotion } from 'framer-motion'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Calendar, MapPin, Ticket, FunnelSimple, NavigationArrow } from '@phosphor-icons/react'
import { useLocale, useTranslations } from 'next-intl'
import { toBcp47 } from '@/i18n/locales'
import type { Concert } from '@/types'

interface EventsPageContentProps {
  concerts: Concert[]
}

export function EventsPageContent({ concerts }: EventsPageContentProps) {
  const t = useTranslations('concerts')
  const locale = useLocale()
  const dateLocale = toBcp47(locale)
  const prefersReducedMotion = useReducedMotion()

  const [selectedArtist, setSelectedArtist] = useState<string | null>(null)
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null)

  // Collect unique artist names and countries
  const artists = useMemo(() => {
    const names = new Set<string>()
    concerts.forEach((c) => { if (c.artistName) names.add(c.artistName) })
    return Array.from(names).sort()
  }, [concerts])

  const countries = useMemo(() => {
    const list = new Set<string>()
    concerts.forEach((c) => { if (c.venueCountry) list.add(c.venueCountry) })
    return Array.from(list).sort()
  }, [concerts])

  const filtered = useMemo(() => {
    return concerts.filter((c) => {
      if (selectedArtist && c.artistName !== selectedArtist) return false
      if (selectedCountry && c.venueCountry !== selectedCountry) return false
      return true
    })
  }, [concerts, selectedArtist, selectedCountry])

  return (
    <div>
      {/* Filters */}
      {(artists.length > 1 || countries.length > 1) && (
        <motion.div
          initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.4 }}
          className="flex flex-col sm:flex-row gap-4 mb-8"
        >
          <div className="flex items-center gap-2 text-muted-foreground">
            <FunnelSimple size={16} aria-hidden="true" />
          </div>

          {/* Artist filter */}
          {artists.length > 1 && (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by artist">
              <button
                onClick={() => setSelectedArtist(null)}
                aria-pressed={selectedArtist === null}
                className={`px-4 py-2 text-xs font-mono uppercase tracking-widest rounded-full border transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
                  selectedArtist === null
                    ? 'bg-accent text-accent-foreground border-accent'
                    : 'bg-transparent border-border text-muted-foreground hover:border-accent/50 hover:text-foreground'
                }`}
              >
                {t('filterArtist')}
              </button>
              {artists.map((artist) => (
                <button
                  key={artist}
                  onClick={() => setSelectedArtist(artist === selectedArtist ? null : artist)}
                  aria-pressed={selectedArtist === artist}
                  className={`px-4 py-2 text-xs font-mono uppercase tracking-widest rounded-full border transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
                    selectedArtist === artist
                      ? 'bg-accent text-accent-foreground border-accent'
                      : 'bg-transparent border-border text-muted-foreground hover:border-accent/50 hover:text-foreground'
                  }`}
                >
                  {artist}
                </button>
              ))}
            </div>
          )}

          {/* Country filter */}
          {countries.length > 1 && (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by country">
              <button
                onClick={() => setSelectedCountry(null)}
                aria-pressed={selectedCountry === null}
                className={`px-4 py-2 text-xs font-mono uppercase tracking-widest rounded-full border transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
                  selectedCountry === null
                    ? 'bg-secondary text-secondary-foreground border-secondary'
                    : 'bg-transparent border-border text-muted-foreground hover:border-secondary/50 hover:text-foreground'
                }`}
              >
                {t('filterCountry')}
              </button>
              {countries.map((country) => (
                <button
                  key={country}
                  onClick={() => setSelectedCountry(country === selectedCountry ? null : country)}
                  aria-pressed={selectedCountry === country}
                  className={`px-4 py-2 text-xs font-mono uppercase tracking-widest rounded-full border transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
                    selectedCountry === country
                      ? 'bg-secondary text-secondary-foreground border-secondary'
                      : 'bg-transparent border-border text-muted-foreground hover:border-secondary/50 hover:text-foreground'
                  }`}
                >
                  {country}
                </button>
              ))}
            </div>
          )}
        </motion.div>
      )}

      {/* Events list */}
      {filtered.length === 0 ? (
        <Card className="bg-card border-border p-8 text-center">
          <p className="text-lg font-semibold mb-2">{t('noShows')}</p>
          <p className="text-muted-foreground">{t('checkBack')}</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {filtered.map((concert, index) => {
            const isCancelled = concert.status === 'cancelled'
            return (
              <motion.div
                key={concert.id}
                initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: prefersReducedMotion ? 0 : 0.4, delay: prefersReducedMotion ? 0 : index * 0.05 }}
              >
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
                      <p className="text-2xl font-bold tracking-tight">
                        {concert.artistName}
                      </p>
                      <p className="text-muted-foreground">
                        {concert.eventName}
                      </p>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <MapPin size={16} aria-hidden="true" />
                          <span>{[concert.venueName, concert.venueAddress, concert.venueCity, concert.venueCountry].filter(Boolean).join(' · ')}</span>
                        </div>
                        {concert.venueLat && concert.venueLng && (
                          <a
                            href={`https://maps.google.com/maps?q=${concert.venueLat},${concert.venueLng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-accent hover:underline ml-6 relative z-20 pointer-events-auto"
                            aria-label={`${concert.eventName} – ${t('navLink')}`}
                          >
                            <NavigationArrow size={12} aria-hidden="true" />
                            {t('navLink')}
                          </a>
                        )}
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
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}
