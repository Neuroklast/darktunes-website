/**
 * Public read-only tour share page (no auth).
 * Logistics + deal framework only.
 */

export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import { getTourShareLinkByToken } from '@/lib/api/tourShareLinks'
import { getTourById } from '@/lib/api/tours'
import { getTourStopsByTourId } from '@/lib/api/tourStops'
import { buildPublicTourView } from '@/lib/tour-planner/publicTourShare'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface PageProps {
  params: Promise<{ token: string }>
}

export default async function PublicTourSharePage({ params }: PageProps) {
  const { token } = await params
  const t = await getTranslations('portal')
  const db = await createServiceRoleSupabaseClient()

  const link = await getTourShareLinkByToken(db, token).catch(() => null)
  if (!link) notFound()

  const tour = await getTourById(db, link.tourId).catch(() => null)
  if (!tour || tour.archived) notFound()

  const stops = await getTourStopsByTourId(db, tour.id).catch(() => [])
  let artistName: string | null = null
  const { data: artist } = await db
    .from('artists')
    .select('name')
    .eq('id', tour.artistId)
    .maybeSingle()
  artistName = artist?.name ?? null

  const view = buildPublicTourView(tour, stops, artistName)

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-4 py-10 space-y-8">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            {t('tour_share_public_badge')}
          </p>
          <h1 className="text-3xl font-bold tracking-tight">{view.name}</h1>
          {view.artistName && (
            <p className="text-lg text-muted-foreground">{view.artistName}</p>
          )}
          {view.description && (
            <p className="text-sm text-muted-foreground max-w-prose">{view.description}</p>
          )}
          {(view.startDate || view.endDate) && (
            <p className="text-sm tabular-nums">
              {view.startDate ?? '—'} → {view.endDate ?? '—'}
            </p>
          )}
          <p className="text-xs text-muted-foreground">{t('tour_share_public_disclaimer')}</p>
        </header>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">{t('tour_share_public_stops')}</h2>
          {view.stops.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t('tour_share_public_no_stops')}</p>
          ) : (
            <ul className="space-y-3">
              {view.stops.map((stop) => (
                <li key={stop.id}>
                  <Card className="border-border bg-card/80">
                    <CardHeader className="pb-2 flex flex-row flex-wrap items-center justify-between gap-2">
                      <CardTitle className="text-base">
                        {stop.isTravelDay
                          ? t('tour_share_public_travel_day')
                          : (stop.venueName ?? t('tour_share_public_show'))}
                      </CardTitle>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline" className="tabular-nums">
                          {stop.stopDate}
                        </Badge>
                        {!stop.isTravelDay && (
                          <Badge variant="secondary">{stop.showStatus}</Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="text-sm space-y-1 text-muted-foreground">
                      {!stop.isTravelDay && (
                        <>
                          {(stop.venueCity || stop.venueCountry) && (
                            <p>
                              {[stop.venueCity, stop.venueCountry].filter(Boolean).join(', ')}
                            </p>
                          )}
                          {stop.venueAddress && <p>{stop.venueAddress}</p>}
                          {stop.daySchedule?.stageTime && (
                            <p>
                              {t('tour_share_public_stage')}:{' '}
                              <span className="text-foreground tabular-nums">
                                {stop.daySchedule.stageTime}
                              </span>
                              {stop.daySchedule.doors
                                ? ` · ${t('tour_share_public_doors')}: ${stop.daySchedule.doors}`
                                : null}
                            </p>
                          )}
                          {(stop.hotelName || stop.hotelCity) && (
                            <p>
                              {t('tour_share_public_hotel')}:{' '}
                              {[stop.hotelName, stop.hotelCity].filter(Boolean).join(' · ')}
                            </p>
                          )}
                          {stop.deal && (
                            <p className="text-foreground">
                              {t('tour_share_public_deal')}: {stop.deal.type}
                              {stop.deal.guarantee != null
                                ? ` · ${stop.deal.guarantee} ${stop.deal.currency}`
                                : null}
                              {stop.deal.doorSplitPercentage != null
                                ? ` · ${stop.deal.doorSplitPercentage}%`
                                : null}
                            </p>
                          )}
                        </>
                      )}
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  )
}
