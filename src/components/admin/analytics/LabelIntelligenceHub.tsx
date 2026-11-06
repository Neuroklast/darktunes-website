'use client'

import dynamic from 'next/dynamic'
import { ChartBar, CurrencyEur, TrendUp, Users } from '@phosphor-icons/react'
import { useMessages } from 'next-intl'
import type { Dictionary } from '@/i18n/types'
import { OperatorPlaybook } from '@/components/admin/sos/OperatorPlaybook'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { LabelAnalyticsSnapshot } from '@/lib/api/labelAnalytics'
import type { JournalistDownload } from '@/types'
import type { FinancialAuditEvent } from '@/lib/api/financialAudit'
import { RosterHealthTable } from './RosterHealthTable'
import { PressAnalyticsDashboard } from './PressAnalyticsDashboard'
import { FinancialAuditViewer } from './FinancialAuditViewer'
import { WebsiteEngagementPanel } from './WebsiteEngagementPanel'
import { ExternalMetricsSyncPanel } from '@/components/admin/sos/ExternalMetricsSyncPanel'
import { ApifySpotifySyncPanel } from '@/components/admin/sos/ApifySpotifySyncPanel'
import type { LabelPageEngagementStats } from '@/lib/api/pageEvents'

const TrendsChartInner = dynamic(
  () => import('./TrendsChartInner').then((m) => m.TrendsChartInner),
  { ssr: false, loading: () => <Skeleton className="h-72 w-full rounded-xl" /> },
)

interface LabelIntelligenceHubProps {
  snapshot: LabelAnalyticsSnapshot
  pressDownloads: JournalistDownload[]
  auditEvents: FinancialAuditEvent[]
  websiteEngagement: LabelPageEngagementStats
}

function formatEur(value: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value)
}

function KpiCard({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: string
  icon: React.ElementType
}) {
  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs text-muted-foreground uppercase tracking-widest flex items-center gap-1">
          <Icon size={12} aria-hidden="true" />
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  )
}

const LABEL_INTELLIGENCE_FALLBACK = {
  emptyTrendsHint: 'No saved period summaries yet.',
  syncToolsTitle: 'Data synchronization',
  playbookTitle: 'How to populate this hub',
  playbookStep1: 'Upload distributor CSVs in Accounting and approve statements in Settlement Center.',
  playbookStep2: 'Click Save to Portal in Accounting → Portal Data to persist territory metrics.',
  playbookStep3: 'Return here to review trends, roster health, and audit history.',
} as const

export function LabelIntelligenceHub({
  snapshot,
  pressDownloads,
  auditEvents,
  websiteEngagement,
}: LabelIntelligenceHubProps) {
  const messages = useMessages() as Dictionary
  const t = { ...LABEL_INTELLIGENCE_FALLBACK, ...messages.admin?.labelIntelligence }

  const latestSummary = snapshot.periodSummaries[0]
  const trendData = [...snapshot.periodSummaries]
    .sort((a, b) => a.periodStart.localeCompare(b.periodStart))
    .map((s) => ({
      period: `${s.periodStart} – ${s.periodEnd}`,
      revenue: s.totalRevenue,
      payout: s.totalPayout,
    }))

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Label revenue (territory)"
          value={formatEur(snapshot.totalLabelRevenue)}
          icon={CurrencyEur}
        />
        <KpiCard
          label="Total streams"
          value={snapshot.totalLabelStreams.toLocaleString()}
          icon={ChartBar}
        />
        <KpiCard
          label="Artists with data"
          value={String(snapshot.artistCountWithData)}
          icon={Users}
        />
        <KpiCard
          label="Latest period payout"
          value={latestSummary ? formatEur(latestSummary.totalPayout) : '—'}
          icon={TrendUp}
        />
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="bg-card border border-border flex-wrap h-auto w-full justify-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="roster">Roster</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
          <TabsTrigger value="press">Press</TabsTrigger>
          <TabsTrigger value="engagement">Website</TabsTrigger>
          <TabsTrigger value="audit">Financial audit</TabsTrigger>
          <TabsTrigger value="sync">{t.syncToolsTitle}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-0 space-y-4">
          <RosterHealthTable rows={snapshot.rosterHealth.slice(0, 8)} />
          {trendData.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground">Revenue trend (saved periods)</h3>
              <TrendsChartInner data={trendData} />
            </div>
          )}
        </TabsContent>

        <TabsContent value="roster" className="mt-0">
          <RosterHealthTable rows={snapshot.rosterHealth} />
        </TabsContent>

        <TabsContent value="trends" className="mt-0 space-y-4">
          {trendData.length === 0 ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{t.emptyTrendsHint}</p>
              <OperatorPlaybook
                title={t.playbookTitle}
                step1={t.playbookStep1}
                step2={t.playbookStep2}
                step3={t.playbookStep3}
              />
            </div>
          ) : (
            <TrendsChartInner data={trendData} />
          )}
        </TabsContent>

        <TabsContent value="press" className="mt-0">
          <PressAnalyticsDashboard downloads={pressDownloads} />
        </TabsContent>

        <TabsContent value="engagement" className="mt-0">
          <WebsiteEngagementPanel stats={websiteEngagement} />
        </TabsContent>

        <TabsContent value="audit" className="mt-0">
          <FinancialAuditViewer events={auditEvents} />
        </TabsContent>
        <TabsContent value="sync" className="mt-0 space-y-4">
          <ExternalMetricsSyncPanel />
          <ApifySpotifySyncPanel />
        </TabsContent>
      </Tabs>
    </div>
  )
}