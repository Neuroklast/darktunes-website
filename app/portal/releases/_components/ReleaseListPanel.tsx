'use client'

/**
 * Catalog releases list for portal (no checklist).
 * Submission status/progress lives under /portal/releases/submissions.
 */

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { CaretDown, CaretUp, MusicNotes } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { PortalEmptyState } from '@/components/portal/PortalEmptyState'
import { getSquareThumbnail } from '@/lib/imageUtils'
import type { Release } from '@/types'

interface ReleaseListPanelProps {
  upcomingReleases: Release[]
  releasedReleases: Release[]
}

function ReleaseCard({ release }: { release: Release }) {
  const t = useTranslations('portal')
  const [open, setOpen] = useState(false)
  const typeBadgeVariant =
    release.type === 'album' ? 'default' : release.type === 'ep' ? 'secondary' : 'outline'

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <button
          type="button"
          className="flex w-full items-start gap-3 text-left"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md bg-muted">
            {release.coverArt ? (
              <Image
                src={getSquareThumbnail(release.coverArt, 112)}
                alt=""
                fill
                className="object-cover"
                sizes="56px"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                <MusicNotes size={22} aria-hidden />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium truncate">{release.title}</p>
              {release.type && (
                <Badge variant={typeBadgeVariant} className="capitalize text-[10px]">
                  {release.type}
                </Badge>
              )}
            </div>
            {release.releaseDate && (
              <p className="text-xs text-muted-foreground mt-0.5">{release.releaseDate}</p>
            )}
          </div>
          {open ? (
            <CaretUp size={18} className="shrink-0 text-muted-foreground" aria-hidden />
          ) : (
            <CaretDown size={18} className="shrink-0 text-muted-foreground" aria-hidden />
          )}
        </button>
      </CardHeader>
      {open && (
        <CardContent className="space-y-2 text-sm text-muted-foreground border-t border-border pt-3">
          {release.catalogNumber && (
            <p>
              <span className="font-medium text-foreground">{t('releases_catalog')}: </span>
              {release.catalogNumber}
            </p>
          )}
          {release.isrc && (
            <p>
              <span className="font-medium text-foreground">ISRC: </span>
              {release.isrc}
            </p>
          )}
          <p className="text-xs">
            {t('releases_status_hint')}{' '}
            <Link href="/portal/releases/submissions" className="text-primary underline-offset-2 hover:underline">
              {t('releases_submissions_heading')}
            </Link>
          </p>
        </CardContent>
      )}
    </Card>
  )
}

export function ReleaseListPanel({
  upcomingReleases,
  releasedReleases,
}: ReleaseListPanelProps) {
  const t = useTranslations('portal')
  const empty = upcomingReleases.length === 0 && releasedReleases.length === 0

  if (empty) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-3xl font-bold">{t('releases_heading')}</h1>
          <Button asChild>
            <Link href="/portal/releases/new">{t('releases_submit_new')}</Link>
          </Button>
        </div>
        <PortalEmptyState
          icon={MusicNotes}
          heading={t('releases_noReleases')}
          description={t('releases_noData')}
          action={{ label: t('releases_submit_new'), href: '/portal/releases/new' }}
        />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-3xl font-bold">{t('releases_heading')}</h1>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/portal/releases/submissions">{t('releases_submissions_heading')}</Link>
          </Button>
          <Button asChild>
            <Link href="/portal/releases/new">{t('releases_submit_new')}</Link>
          </Button>
        </div>
      </div>

      {upcomingReleases.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">{t('releases_upcoming_heading')}</h2>
          <div className="space-y-3">
            {upcomingReleases.map((r) => (
              <ReleaseCard key={r.id} release={r} />
            ))}
          </div>
        </section>
      )}

      {releasedReleases.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">{t('releases_past_heading')}</h2>
          <p className="text-sm text-muted-foreground">{t('releases_past_desc')}</p>
          <div className="space-y-3">
            {releasedReleases.map((r) => (
              <ReleaseCard key={r.id} release={r} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
