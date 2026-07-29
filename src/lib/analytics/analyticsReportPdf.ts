/**
 * Client-side analytics PDF report (jsPDF). Text/tables only — no canvas capture.
 */

import type { PlatformAggregate } from '@/lib/api/streamingStats'
import type { PublicSpotifyPresenceModel } from '@/lib/analytics/publicSpotifyPresence'
import type { AnalyticsKpis } from '@/lib/analytics/insights'

export interface AnalyticsReportPdfInput {
  artistName: string
  periodLabel: string
  generatedAt: Date
  kpis: AnalyticsKpis
  presence: PublicSpotifyPresenceModel
  platformAggregates: PlatformAggregate[]
  labels: {
    title: string
    subtitle: string
    period: string
    generated: string
    kpiStreams: string
    kpiRevenue: string
    kpiListeners: string
    kpiFollowers: string
    presenceHeading: string
    topTracks: string
    byRelease: string
    platforms: string
    colTrack: string
    colRelease: string
    colPlays: string
    colShare: string
    colPlatform: string
    colStreams: string
    noData: string
    disclaimer: string
  }
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return n.toLocaleString()
}

export async function buildAnalyticsReportPdf(
  input: AnalyticsReportPdfInput,
): Promise<Blob> {
  const { jsPDF } = (await import('jspdf')) as unknown as {
    jsPDF: new (opts?: { orientation?: string; unit?: string; format?: string }) => {
      setFontSize: (n: number) => void
      setFont: (name: string, style?: string) => void
      text: (t: string | string[], x: number, y: number, opts?: { maxWidth?: number }) => void
      splitTextToSize: (text: string, maxWidth: number) => string[]
      addPage: () => void
      setPage: (n: number) => void
      getNumberOfPages: () => number
      internal: { pageSize: { getWidth: () => number; getHeight: () => number } }
      output: (type: 'blob') => Blob
      line: (x1: number, y1: number, x2: number, y2: number) => void
      setDrawColor: (r: number, g: number, b: number) => void
    }
  }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 14
  let y = 18
  const { labels } = input

  const ensureSpace = (need: number) => {
    if (y + need > doc.internal.pageSize.getHeight() - 16) {
      doc.addPage()
      y = 18
    }
  }

  const h1 = (text: string) => {
    ensureSpace(12)
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text(text, margin, y)
    y += 8
  }

  const h2 = (text: string) => {
    ensureSpace(10)
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text(text, margin, y)
    y += 6
  }

  const body = (text: string) => {
    ensureSpace(6)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text(text, margin, y, { maxWidth: pageW - margin * 2 })
    y += 5
  }

  const line = () => {
    ensureSpace(4)
    doc.setDrawColor(180, 180, 180)
    doc.line(margin, y, pageW - margin, y)
    y += 5
  }

  h1(labels.title)
  body(`${labels.subtitle}: ${input.artistName}`)
  body(`${labels.period}: ${input.periodLabel}`)
  body(`${labels.generated}: ${input.generatedAt.toISOString().slice(0, 16).replace('T', ' ')} UTC`)
  line()

  h2(labels.kpiStreams)
  body(fmtNum(input.kpis.totalStreams))
  body(`${labels.kpiRevenue}: ${input.kpis.totalRevenueEur.toFixed(2)} EUR`)
  if (input.presence.kpis.latestListeners !== null) {
    body(`${labels.kpiListeners}: ${fmtNum(input.presence.kpis.latestListeners)}`)
  }
  if (input.presence.kpis.latestFollowers !== null) {
    body(`${labels.kpiFollowers}: ${fmtNum(input.presence.kpis.latestFollowers)}`)
  }
  line()

  if (input.platformAggregates.length > 0) {
    h2(labels.platforms)
    body(`${labels.colPlatform} | ${labels.colStreams}`)
    for (const p of input.platformAggregates.slice(0, 20)) {
      body(`${p.platform}: ${fmtNum(p.totalStreams)}`)
    }
    line()
  }

  if (input.presence.topTracks.length > 0) {
    h2(labels.topTracks)
    for (const [i, row] of input.presence.topTracks.slice(0, 15).entries()) {
      const name = row.trackName ?? row.spotifyTrackId
      body(
        `${i + 1}. ${name} — ${fmtNum(row.playCount)} (${row.sharePct}%)` +
          (row.releaseTitle ? ` · ${row.releaseTitle}` : ''),
      )
    }
    line()
  }

  if (input.presence.byRelease.length > 0) {
    h2(labels.byRelease)
    for (const row of input.presence.byRelease.slice(0, 15)) {
      body(
        `${row.releaseTitle ?? labels.noData}: ${fmtNum(row.playCount)} · ${row.trackCount} tracks · ${row.sharePct}%`,
      )
    }
  }

  if (
    input.platformAggregates.length === 0 &&
    input.presence.topTracks.length === 0 &&
    !input.presence.kpis.hasAnyData
  ) {
    body(labels.noData)
  }

  line()
  h2('Disclaimer')
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  const discLines = doc.splitTextToSize(labels.disclaimer, pageW - margin * 2)
  ensureSpace(discLines.length * 4 + 4)
  doc.text(discLines, margin, y)
  y += discLines.length * 4 + 2

  // Footer page numbers
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.text(
      `${i} / ${pages}`,
      pageW - margin - 10,
      doc.internal.pageSize.getHeight() - 8,
    )
  }

  return doc.output('blob')
}

export function triggerPdfDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
