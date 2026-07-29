'use client'

import { useTranslations } from 'next-intl'
import Link from 'next/link'
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar'
import { User, ChartBar, FileText, MusicNotes, MapPin, MapTrifold, MegaphoneSimple, ChatCircleText, ArrowRight, Globe } from '@phosphor-icons/react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { getSquareThumbnail } from '@/lib/imageUtils'
import type { CompletionField } from '@/lib/portal/profileCompletion'
import type { OverviewInsight } from '@/lib/analytics/overviewInsights'
import { PortalIntelligencePanel } from './PortalIntelligencePanel'
import { useUnreadMessages } from './PortalNotificationProvider'

interface PortalOverviewProps {
  artistName: string | null
  profileImageUrl: string | null
  totalStreams: number
  releaseCount: number
  upcomingShowCount: number
  openSubmissionCount: number
  statementCount: number
  assetCount: number
  tourCount: number
  featureFlags: Record<string, boolean>
  completionScore: number
  missingFields: CompletionField[]
  overviewInsights: OverviewInsight[]
  artistSlug?: string | null
}

export function PortalOverview({ artistName,
  profileImageUrl,
  totalStreams,
  releaseCount,
  upcomingShowCount,
  openSubmissionCount,
  statementCount,
  assetCount,
  tourCount,
  featureFlags,
  completionScore,
  missingFields,
  overviewInsights,
  artistSlug,
}: PortalOverviewProps) {
  const t = useTranslations('portal')

  const isEnabled = (id: string) => featureFlags[id] ?? true
  const { unreadCount } = useUnreadMessages()
  const initials = artistName
    ? artistName.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()
    : '?'

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-4">
        <Avatar className="h-16 w-16 shrink-0 border border-border">
          <AvatarImage
            src={profileImageUrl ? getSquareThumbnail(profileImageUrl, 64) : undefined}
            alt={`${artistName ?? 'Artist'} – artist photo`}
          />
          <AvatarFallback className="bg-primary/20 text-xl font-bold text-primary">{initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <h1 className="bg-gradient-to-r from-foreground to-primary/70 bg-clip-text text-2xl font-bold text-transparent sm:text-3xl">
            {t('welcomeBack')}
            {artistName ? `, ${artistName}` : ''}
          </h1>
          {!artistName && (
            <p className="mt-1 text-muted-foreground">{t('notLinked')}</p>
          )}
        </div>
      </div>

      {overviewInsights.length > 0 && (
        <PortalIntelligencePanel insights={overviewInsights} />
      )}

      {(isEnabled('artist.epk_builder') || isEnabled('artist.fan_page')) && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">{t('fanPage_pages_heading')}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Link href="/portal/profile">
              <Card className="border-border bg-card hover:border-primary/50 transition-colors cursor-pointer h-full">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">{t('profile')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">{t('fanPage_pages_profile_desc')}</p>
                </CardContent>
              </Card>
            </Link>
            {isEnabled('artist.epk_builder') && (
              <Link href="/portal/epk-builder">
                <Card className="border-border bg-card hover:border-primary/50 transition-colors cursor-pointer h-full">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">{t('epk_builder_nav')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground">{t('fanPage_pages_epk_desc')}</p>
                  </CardContent>
                </Card>
              </Link>
            )}
            {isEnabled('artist.fan_page') && (
              <Link href="/portal/fan-page">
                <Card className="border-border bg-card hover:border-primary/50 transition-colors cursor-pointer h-full">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">{t('fan_page_nav')}</CardTitle>
                    <Globe size={16} className="text-primary" aria-hidden />
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground">{t('fanPage_pages_fan_desc')}</p>
                  </CardContent>
                </Card>
              </Link>
            )}
            {artistSlug && (
              <a href={`/@${artistSlug}`} target="_blank" rel="noopener noreferrer">
                <Card className="border-border bg-card hover:border-primary/50 transition-colors cursor-pointer h-full">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">{t('fanPage_pages_live')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs font-mono text-muted-foreground">/@{artistSlug}</p>
                  </CardContent>
                </Card>
              </a>
            )}
          </div>
        </div>
      )}

      {/* Profile Completion Card — hidden when 100% complete */}
      {completionScore < 100 && (
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('completion_title')}
            </CardTitle>
            <span className="text-sm font-bold text-primary">{completionScore}%</span>
          </CardHeader>
          <CardContent className="space-y-3">
            <Progress
              value={completionScore}
              className="h-2"
              aria-label={`${t('completion_title')}: ${completionScore}%`}
            />
            {missingFields.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {missingFields.slice(0, 3).map((field) => (
                  <Link key={field.key} href="/portal/profile">
                    <Badge
                      variant="outline"
                      className="text-xs cursor-pointer hover:border-primary/50 hover:text-primary transition-colors gap-1"
                    >
                      {t(field.labelKey)}
                      <ArrowRight size={10} aria-hidden="true" />
                    </Badge>
                  </Link>
                ))}
                {missingFields.length > 3 && (
                  <Link href="/portal/profile">
                    <Badge variant="outline" className="text-xs cursor-pointer hover:border-primary/50">
                      +{missingFields.length - 3} {t('completion_cta')}
                    </Badge>
                  </Link>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link href="/portal/profile">
          <Card className="bg-card border-border hover:border-primary/50 transition-colors cursor-pointer glow-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t('profile')}
              </CardTitle>
              <User size={18} className="text-primary" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">EPK</p>
              <p className="text-xs text-muted-foreground mt-1">Manage bio, photo &amp; links</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/portal/analytics">
          <Card className="bg-card border-border hover:border-primary/50 transition-colors cursor-pointer glow-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t('analytics')}
              </CardTitle>
              <ChartBar size={18} className="text-primary" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{totalStreams.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-1">{t('analytics_totalStreams')}</p>
            </CardContent>
          </Card>
        </Link>

        {isEnabled('artist.statements') && (
          <Link href="/portal/statements">
            <Card className="bg-card border-border hover:border-primary/50 transition-colors cursor-pointer glow-card">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t('statements')}
                </CardTitle>
                <FileText size={18} className="text-primary" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{statementCount}</p>
                <p className="text-xs text-muted-foreground mt-1">{t('statements_heading')}</p>
              </CardContent>
            </Card>
          </Link>
        )}

        <Link href="/portal/releases">
          <Card className="bg-card border-border hover:border-primary/50 transition-colors cursor-pointer glow-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t('overview_totalReleases')}
              </CardTitle>
              <MusicNotes size={18} className="text-primary" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{releaseCount}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {openSubmissionCount > 0
                  ? t('overview_open_submissions', { count: openSubmissionCount })
                  : t('overview_no_open_submissions')}
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/portal/events">
          <Card className="bg-card border-border hover:border-primary/50 transition-colors cursor-pointer glow-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t('overview_upcomingShows')}
              </CardTitle>
              <MapPin size={18} className="text-primary" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{upcomingShowCount}</p>
              <p className="text-xs text-muted-foreground mt-1">{t('tour_heading')}</p>
            </CardContent>
          </Card>
        </Link>

        {isEnabled('artist.tour_planner') && (
          <Link href="/portal/tour-planner">
            <Card className="bg-card border-border hover:border-primary/50 transition-colors cursor-pointer glow-card">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t('tour_planner_nav')}
                </CardTitle>
                <MapTrifold size={18} className="text-primary" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{tourCount}</p>
                <p className="text-xs text-muted-foreground mt-1">{t('overview_tourPlanner')}</p>
              </CardContent>
            </Card>
          </Link>
        )}

        {isEnabled('artist.marketing') && (
          <Link href="/portal/marketing">
            <Card className="bg-card border-border hover:border-primary/50 transition-colors cursor-pointer glow-card">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{t('marketing')}</CardTitle>
                <MegaphoneSimple size={18} className="text-primary" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{assetCount}</p>
                <p className="text-xs text-muted-foreground mt-1">{t('overview_labelAssets')}</p>
              </CardContent>
            </Card>
          </Link>
        )}

        <Link href="/portal/messages">
          <Card className="bg-card border-border hover:border-primary/50 transition-colors cursor-pointer glow-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{t('messages')}</CardTitle>
              <ChatCircleText size={18} className="text-primary" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{unreadCount}</p>
              <p className="text-xs text-muted-foreground mt-1">unread messages</p>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  )
}
