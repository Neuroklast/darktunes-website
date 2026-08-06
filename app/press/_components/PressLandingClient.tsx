'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, EnvelopeSimple, Newspaper, Phone, Users, MagnifyingGlass } from '@phosphor-icons/react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useTranslations } from 'next-intl'
import { ObfuscatedText } from '@/components/press/ObfuscatedText'
import type { NewsPost, SiteSettings } from '@/types'
import type { PublicArtist } from '@/lib/api/publicArtist'
import { getOptimizedImageUrl } from '@/lib/imageUtils'

interface PressLandingClientProps {
  artists: PublicArtist[]
  pressReleases: NewsPost[]
  siteSettings: Pick<SiteSettings, 'labelName' | 'labelTagline' | 'contactEmail' | 'impressumPhone' | 'impressumEmail'>
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

type SortKey = 'nameAsc' | 'nameDesc' | 'genreAsc'

export function PressLandingClient({
  artists,
  pressReleases,
  siteSettings,
}: PressLandingClientProps) {
  const t = useTranslations('pressLanding')
  const tReleases = useTranslations('pressReleases')

  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortKey>('nameAsc')

  const filteredArtists = useMemo(() => {
    const q = search.toLowerCase()
    const filtered = artists.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.genres.some((g) => g.toLowerCase().includes(q)) ||
        (a.bio ?? '').toLowerCase().includes(q),
    )
    return filtered.slice().sort((a, b) => {
      if (sort === 'nameAsc') return a.name.localeCompare(b.name)
      if (sort === 'nameDesc') return b.name.localeCompare(a.name)
      // genreAsc: compare the sorted genre lists so every genre is considered,
      // not just the first entry in the array.
      const aGenre = [...a.genres].sort()[0] ?? ''
      const bGenre = [...b.genres].sort()[0] ?? ''
      return aGenre.localeCompare(bGenre)
    })
  }, [artists, search, sort])

  const contactEmail = siteSettings.impressumEmail || siteSettings.contactEmail
  const contactPhone = siteSettings.impressumPhone

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-12 sm:px-6 lg:px-8">
        {/* Hero header */}
        <section aria-labelledby="press-hero-title" className="rounded-3xl border border-border bg-card/60 p-6 sm:p-8 lg:p-12">
          <div className="space-y-5">
            <Badge className="w-fit gap-2 bg-primary/20 text-primary hover:bg-primary/20">
              <Newspaper size={14} weight="bold" aria-hidden="true" />
              {t('heroBadge')}
            </Badge>
            <h1 id="press-hero-title" className="text-4xl font-bold tracking-tight sm:text-5xl">
              {siteSettings.labelName}
            </h1>
            <p className="max-w-3xl text-lg text-muted-foreground">
              {siteSettings.labelTagline || t('heroDescription')}
            </p>
          </div>
        </section>

        {/* Tabs */}
        <Tabs defaultValue="roster" className="w-full">
          <TabsList className="mb-6 flex w-full flex-wrap gap-1 h-auto">
            <TabsTrigger value="roster" className="flex items-center gap-2">
              <Users size={15} weight="bold" aria-hidden="true" />
              {t('tabs.roster')}
            </TabsTrigger>
            <TabsTrigger value="releases" className="flex items-center gap-2">
              <Newspaper size={15} weight="bold" aria-hidden="true" />
              {t('tabs.releases')}
            </TabsTrigger>
            <TabsTrigger value="contact" className="flex items-center gap-2">
              <EnvelopeSimple size={15} weight="bold" aria-hidden="true" />
              {t('tabs.contact')}
            </TabsTrigger>
          </TabsList>

          {/* ── Artist Roster ── */}
          <TabsContent value="roster">
            <section aria-labelledby="press-roster-title" className="space-y-5">
              <h2 id="press-roster-title" className="sr-only">{t('tabs.roster')}</h2>

              {/* Search & sort controls */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <MagnifyingGlass
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t('rosterSearch')}
                    className="pl-9"
                    aria-label={t('rosterSearch')}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="shrink-0 text-sm text-muted-foreground">{t('rosterSort.label')}</span>
                  <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nameAsc">{t('rosterSort.nameAsc')}</SelectItem>
                      <SelectItem value="nameDesc">{t('rosterSort.nameDesc')}</SelectItem>
                      <SelectItem value="genreAsc">{t('rosterSort.genreAsc')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {filteredArtists.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('noResults')}</p>
              ) : (
                <ul className="grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 xl:grid-cols-3">
                  {filteredArtists.map((artist) => (
                    <li key={artist.id}>
                      <Link
                        href={`/press/artists/${artist.slug}`}
                        className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card transition-colors hover:border-primary/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                      >
                        <div className="relative aspect-[4/3] overflow-hidden">
                          <Image
                            src={getOptimizedImageUrl(artist.imageUrl, 600)}
                            alt={`${artist.name} – artist photo`}
                            fill
                            unoptimized
                            className="object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                        </div>
                        <div className="flex flex-1 items-center justify-between gap-3 p-4">
                          <div>
                            <p className="font-semibold">{artist.name}</p>
                            <p className="line-clamp-2 text-sm text-muted-foreground">
                              {artist.genres.join(' · ') || artist.bio}
                            </p>
                          </div>
                          <ArrowRight
                            size={18}
                            weight="bold"
                            aria-hidden="true"
                            className="shrink-0 text-primary transition-transform group-hover:translate-x-1"
                          />
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </TabsContent>

          {/* ── Press Releases ── */}
          <TabsContent value="releases">
            <section aria-labelledby="press-releases-title" className="space-y-5">
              <div className="flex items-center justify-between gap-4">
                <h2 id="press-releases-title" className="text-2xl font-bold tracking-tight">
                  {tReleases('heading')}
                </h2>
                <Button asChild variant="outline">
                  <Link href="/press/dashboard/press-releases">{t('releasesButton')}</Link>
                </Button>
              </div>

              {pressReleases.length === 0 ? (
                <p className="text-sm text-muted-foreground">{tReleases('noResults')}</p>
              ) : (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                  {pressReleases.map((post) => (
                    <Card key={post.id} className="border-border bg-card/70">
                      {post.imageUrl && (
                        <div className="relative aspect-[16/10] overflow-hidden rounded-t-xl">
                          <Image
                            src={getOptimizedImageUrl(post.imageUrl, 600)}
                            alt={`${post.title} – press release cover`}
                            fill
                            unoptimized
                            className="object-cover"
                          />
                        </div>
                      )}
                      <CardContent className="space-y-3 p-5">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          {post.releaseCategory && <Badge variant="secondary">{post.releaseCategory}</Badge>}
                          <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
                        </div>
                        <h3 className="text-xl font-semibold leading-tight">{post.title}</h3>
                        <p className="line-clamp-3 text-sm text-muted-foreground">{post.excerpt || post.content}</p>
                        <Button asChild variant="link" className="px-0 text-primary">
                          <Link href={`/press/releases/${post.slug}`}>{t('readRelease')}</Link>
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </section>
          </TabsContent>

          {/* ── Contact ── */}
          <TabsContent value="contact">
            <section aria-labelledby="press-contact-title" className="space-y-6">
              <h2 id="press-contact-title" className="text-2xl font-bold tracking-tight">
                {t('contact.title')}
              </h2>
              <p className="max-w-3xl text-muted-foreground">{t('contact.description')}</p>

              <Card className="border-border bg-card/70">
                <CardContent className="space-y-4 p-6">
                  {contactEmail && (
                    <div className="flex items-center gap-3">
                      <EnvelopeSimple
                        size={18}
                        weight="bold"
                        className="shrink-0 text-primary"
                        aria-hidden="true"
                      />
                      <div>
                        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                          {t('contact.emailLabel')}
                        </p>
                        <ObfuscatedText
                          value={contactEmail}
                          ariaLabel={contactEmail}
                          fontSize={14}
                          className="text-foreground"
                        />
                      </div>
                    </div>
                  )}

                  {contactPhone && (
                    <div className="flex items-center gap-3">
                      <Phone
                        size={18}
                        weight="bold"
                        className="shrink-0 text-primary"
                        aria-hidden="true"
                      />
                      <div>
                        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                          {t('contact.phoneLabel')}
                        </p>
                        <ObfuscatedText
                          value={contactPhone}
                          ariaLabel={contactPhone}
                          fontSize={14}
                          className="text-foreground"
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="flex flex-wrap gap-3">
                <Button asChild variant="outline">
                  <Link href="/press/apply">{t('contact.applyButton')}</Link>
                </Button>
                <Button asChild>
                  <Link href="/login">{t('contact.dashboardButton')}</Link>
                </Button>
              </div>
            </section>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

