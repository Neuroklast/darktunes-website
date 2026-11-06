'use client'

/**
 * src/components/admin/sos/AnalyticsDashboard.tsx
 *
 * Revenue analytics dashboard using recharts.
 * Accepts the ArtistRevenue[] output from useCSVProcessor and renders:
 *  - KPI stat cards (total revenue, payout, artists, platforms, countries)
 *  - Platform breakdown bar chart
 *  - Top-10 countries bar chart
 *  - Monthly revenue area chart
 *  - Artist revenue pie chart
 * With optional artist / country filter.
 */

import { useMemo, useState } from 'react'
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import {
  ChartBar,
  Storefront,
  CalendarBlank,
  MusicNote,
  CurrencyEur,
  Users,
  MapPin,
} from '@phosphor-icons/react'
import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { RevenueSummaryCard } from './RevenueSummaryCard'
import type { ArtistRevenue } from '@/lib/sos/types'

interface AnalyticsDashboardProps {
  revenues: ArtistRevenue[]
  showSummaryKpis?: boolean
}

const CHART_COLORS = [
  'oklch(0.65 0.28 295)',
  'oklch(0.70 0.30 290)',
  'oklch(0.60 0.25 300)',
  'oklch(0.55 0.22 285)',
  'oklch(0.75 0.32 280)',
  'oklch(0.62 0.26 292)',
  'oklch(0.68 0.29 288)',
  'oklch(0.58 0.24 297)',
]

function fmtEur(n: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)
}

function fmtShort(n: number) {
  if (n >= 1000) return `€${(n / 1000).toFixed(1)}k`
  return fmtEur(n)
}

export function AnalyticsDashboard({ revenues, showSummaryKpis = true }: AnalyticsDashboardProps) {
  const [selectedArtist, setSelectedArtist] = useState<string>('all')
  const [selectedCountry, setSelectedCountry] = useState<string>('all')

  const allCountries = useMemo(() => {
    const set = new Set<string>()
    revenues.forEach(r => r.countryBreakdown.forEach(c => { if (c.country) set.add(c.country) }))
    return Array.from(set).sort()
  }, [revenues])

  const filteredRevenues = useMemo(() => {
    let result = revenues
    if (selectedArtist !== 'all') {
      result = result.filter(r => r.artist === selectedArtist)
    }
    if (selectedCountry !== 'all') {
      result = result
        .map(r => ({
          ...r,
          countryBreakdown: r.countryBreakdown.filter(c => c.country === selectedCountry),
        }))
        .filter(r => r.countryBreakdown.length > 0)
    }
    return result
  }, [revenues, selectedArtist, selectedCountry])

  const stats = useMemo(() => {
    const total = revenues.reduce((sum, r) => sum + r.totalRevenue, 0)
    const totalFinal = revenues.reduce((sum, r) => sum + r.finalAmount, 0)
    const allPlatforms = new Set<string>()
    const countries = new Set<string>()
    revenues.forEach(r => {
      r.platformBreakdown.forEach(p => allPlatforms.add(p.platform))
      r.countryBreakdown.forEach(c => countries.add(c.country))
    })
    return {
      totalRevenue: total,
      totalFinalAmount: totalFinal,
      artistCount: revenues.length,
      platformCount: allPlatforms.size,
      countryCount: countries.size,
    }
  }, [revenues])

  // Platform breakdown aggregated across filtered revenues
  const platformData = useMemo(() => {
    const map = new Map<string, number>()
    filteredRevenues.forEach(r =>
      r.platformBreakdown.forEach(p => {
        map.set(p.platform, (map.get(p.platform) ?? 0) + p.revenue)
      })
    )
    return Array.from(map.entries())
      .map(([platform, revenue]) => ({ platform, revenue }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 15)
  }, [filteredRevenues])

  // Top-10 countries
  const countryData = useMemo(() => {
    const map = new Map<string, number>()
    filteredRevenues.forEach(r =>
      r.countryBreakdown.forEach(c => {
        map.set(c.country, (map.get(c.country) ?? 0) + c.revenue)
      })
    )
    return Array.from(map.entries())
      .map(([country, revenue]) => ({ country, revenue }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)
  }, [filteredRevenues])

  // Monthly trend
  const monthlyData = useMemo(() => {
    const map = new Map<string, number>()
    filteredRevenues.forEach(r =>
      r.monthlyBreakdown?.forEach(m => {
        map.set(m.month, (map.get(m.month) ?? 0) + m.revenue)
      })
    )
    return Array.from(map.entries())
      .map(([month, revenue]) => ({ month, revenue }))
      .sort((a, b) => a.month.localeCompare(b.month))
  }, [filteredRevenues])

  // Artist pie respects active artist/country filters
  const artistPieData = useMemo(() =>
    filteredRevenues
      .map(r => ({ name: r.artist, value: r.totalRevenue }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8),
    [filteredRevenues]
  )

  const tooltipStyle = {
    backgroundColor: 'hsl(var(--popover))',
    border: '1px solid hsl(var(--border))',
    borderRadius: '6px',
    fontSize: 12,
  }

  return (
    <div className="w-full min-w-0 space-y-5">
      {showSummaryKpis && (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <RevenueSummaryCard
          label="Total Revenue"
          value={fmtEur(stats.totalRevenue)}
          icon={<CurrencyEur size={18} />}
        />
        <RevenueSummaryCard
          label="Total Payouts"
          value={fmtEur(stats.totalFinalAmount)}
          icon={<CurrencyEur size={18} />}
        />
        <RevenueSummaryCard
          label="Artists"
          value={String(stats.artistCount)}
          icon={<Users size={18} />}
        />
        <RevenueSummaryCard
          label="Platforms"
          value={String(stats.platformCount)}
          icon={<Storefront size={18} />}
        />
        <RevenueSummaryCard
          label="Countries"
          value={String(stats.countryCount)}
          icon={<MapPin size={18} />}
        />
      </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <Select value={selectedArtist} onValueChange={setSelectedArtist}>
          <SelectTrigger className="w-48 h-8 text-xs">
            <SelectValue placeholder="All Artists" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Artists</SelectItem>
            {revenues.map(r => (
              <SelectItem key={r.artist} value={r.artist}>{r.artist}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={selectedCountry} onValueChange={setSelectedCountry}>
          <SelectTrigger className="w-48 h-8 text-xs">
            <SelectValue placeholder="All Countries" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Countries</SelectItem>
            {allCountries.map(c => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Chart tabs */}
      <Tabs defaultValue="platforms">
        <TabsList className="h-8">
          <TabsTrigger value="platforms" className="text-xs gap-1.5">
            <Storefront size={13} /> Platforms
          </TabsTrigger>
          <TabsTrigger value="countries" className="text-xs gap-1.5">
            <MapPin size={13} /> Countries
          </TabsTrigger>
          <TabsTrigger value="monthly" className="text-xs gap-1.5">
            <CalendarBlank size={13} /> Monthly
          </TabsTrigger>
          <TabsTrigger value="artists" className="text-xs gap-1.5">
            <MusicNote size={13} /> Artists
          </TabsTrigger>
        </TabsList>

        {/* Platform bar chart */}
        <TabsContent value="platforms">
          <Card className="min-w-0 p-4 mt-2">
            <div className="flex items-center gap-1.5 mb-4">
              <ChartBar size={16} className="text-primary" />
              <span className="text-sm font-semibold">Revenue by Platform</span>
            </div>
            {platformData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">No platform data</p>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={platformData} margin={{ top: 0, right: 20, left: 10, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="platform"
                    tick={{ fontSize: 11 }}
                    angle={-35}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={fmtShort} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(v) => [fmtEur(Number(v ?? 0)), 'Revenue']}
                  />
                  <Bar dataKey="revenue" fill={CHART_COLORS[0]} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </TabsContent>

        {/* Country bar chart */}
        <TabsContent value="countries">
          <Card className="min-w-0 p-4 mt-2">
            <div className="flex items-center gap-1.5 mb-4">
              <MapPin size={16} className="text-primary" />
              <span className="text-sm font-semibold">Top Countries</span>
            </div>
            {countryData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">No country data</p>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={countryData} margin={{ top: 0, right: 20, left: 10, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="country" tick={{ fontSize: 11 }} angle={-25} textAnchor="end" interval={0} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={fmtShort} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(v) => [fmtEur(Number(v ?? 0)), 'Revenue']}
                  />
                  <Bar dataKey="revenue" fill={CHART_COLORS[2]} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </TabsContent>

        {/* Monthly area chart */}
        <TabsContent value="monthly">
          <Card className="min-w-0 p-4 mt-2">
            <div className="flex items-center gap-1.5 mb-4">
              <CalendarBlank size={16} className="text-primary" />
              <span className="text-sm font-semibold">Monthly Revenue Trend</span>
            </div>
            {monthlyData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">No monthly data</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={monthlyData} margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART_COLORS[0]} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={CHART_COLORS[0]} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={fmtShort} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(v) => [fmtEur(Number(v ?? 0)), 'Revenue']}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke={CHART_COLORS[0]}
                    fill="url(#revGrad)"
                    strokeWidth={2}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </Card>
        </TabsContent>

        {/* Artist pie chart */}
        <TabsContent value="artists">
          <Card className="min-w-0 p-4 mt-2">
            <div className="flex items-center gap-1.5 mb-4">
              <MusicNote size={16} className="text-primary" />
              <span className="text-sm font-semibold">Revenue by Artist</span>
            </div>
            {artistPieData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">No artist data</p>
            ) : (
              <div className="flex flex-col sm:flex-row items-center gap-6">
                <ResponsiveContainer width={260} height={260}>
                  <PieChart>
                    <Pie
                      data={artistPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={110}
                      dataKey="value"
                      nameKey="name"
                      isAnimationActive={false}
                    >
                      {artistPieData.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(v) => [fmtEur(Number(v ?? 0)), 'Revenue']}
                    />
                    <Legend formatter={(value) => <span className="text-xs">{value}</span>} />
                  </PieChart>
                </ResponsiveContainer>

                {/* Legend table */}
                <div className="flex-1 space-y-1.5">
                  {artistPieData.map((d, i) => (
                    <div key={d.name} className="flex items-center gap-2 text-sm">
                      <span
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
                      />
                      <span className="flex-1 truncate">{d.name}</span>
                      <span className="tabular-nums text-muted-foreground">{fmtEur(d.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
