import { jsPDF, GState } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { SafeProcessedArtistData, LabelInfo, PdfExportSettings, LabelArtist, CompilationFilter } from '../types'
import { resolveTemplate } from '../utils'
import { APP_CREDITS, APP_LOGO, APP_NAME } from '@/config/softwareBranding'
import {
  DEFAULT_PDF_SETTINGS,
  formatCurrency,
  safeFinite,
  isCompilationRelease,
  resolveImageDimensions,
  computeFitDimensions,
  LABEL_LOGO_MAX_WIDTH_MM,
  LABEL_LOGO_MAX_HEIGHT_MM,
  APP_LOGO_FOOTER_SIZE_MM,
  FOOTER_LOGO_LEFT_OFFSET_MM,
  FOOTER_LOGO_VERTICAL_NUDGE_MM,
  FOOTER_BOTTOM_MARGIN_MM,
  FOOTER_ROW_SPACING_MM,
  FOOTER_TEXT_WIDTH_RATIO,
  FOOTER_RESERVED_MM,
  MAX_BREAKDOWN_ROWS,
  MIN_SPACE_FOR_SECTION_HEADING_MM,
  FOOTNOTE_FONT_SIZE_PT,
  FOOTNOTE_TEXT_COLOR_RGB,
  NEGATIVE_PAYOUT_COLOR_RGB,
  TOTAL_PAGES_PLACEHOLDER,
  buildDigitalSplitLabel,
  type DigitalSourceSplit,
} from './shared'

export async function generatePDF(
  artistData: SafeProcessedArtistData,
  labelInfo: LabelInfo,
  periodStart?: string,
  periodEnd?: string,
  invoiceNumber?: string,
  pdfSettings?: Partial<PdfExportSettings>,
  emailOptions?: {
    financeEmail: string
    deadlineDate: string
    donationOrg: string
  },
  artistInfo?: LabelArtist,
  compilationFilters: CompilationFilter[] = []
): Promise<Blob> {
  // Pre-load label logo dimensions so buildPDF can preserve the aspect ratio.
  let logoDimensions: { w: number; h: number } | undefined
  const logoSrc = labelInfo.logoBase64 ?? labelInfo.logo
  if (logoSrc) {
    const naturalDims = await resolveImageDimensions(logoSrc)
    // Only compute fit dimensions when both axes are valid positive values;
    // otherwise leave logoDimensions undefined so buildPDF falls back to the
    // default 25×25 square rather than rendering a potentially distorted image.
    if (naturalDims && naturalDims.width > 0 && naturalDims.height > 0) {
      logoDimensions = computeFitDimensions(naturalDims.width, naturalDims.height, LABEL_LOGO_MAX_WIDTH_MM, LABEL_LOGO_MAX_HEIGHT_MM)
    }
  }

  try {
    const settings = { ...DEFAULT_PDF_SETTINGS, ...pdfSettings }
    return buildPDF(artistData, labelInfo, periodStart, periodEnd, invoiceNumber, settings, emailOptions, artistInfo, logoDimensions, compilationFilters)
  } catch (err) {
    throw new Error(
      `PDF generation failed for "${artistData.artist}": ${err instanceof Error ? err.message : String(err)}`
    )
  }
}

function buildPDF(
  artistData: SafeProcessedArtistData,
  labelInfo: LabelInfo,
  periodStart?: string,
  periodEnd?: string,
  invoiceNumber?: string,
  settings: PdfExportSettings = DEFAULT_PDF_SETTINGS,
  emailOptions?: { financeEmail: string; deadlineDate: string; donationOrg: string },
  artistInfo?: LabelArtist,
  logoDimensions?: { w: number; h: number },
  compilationFilters: CompilationFilter[] = []
): Blob {
  const doc = new jsPDF({ compress: true })
  const margin = 20

  // Embed document metadata so PDF readers show a meaningful title.
  doc.setProperties({ title: `${APP_NAME} · Statement of Sales`, creator: APP_NAME })

  // ── Optional e-mail cover letter page ────────────────────────────────────
  if (settings.includeEmailCoverLetter && labelInfo.emailTemplate) {
    const period = periodStart && periodEnd ? `${periodStart} – ${periodEnd}` : (periodStart ?? periodEnd ?? '')
    const amount = formatCurrency(artistData.finalPayout)
    const appDefaults = {
      financeEmail: emailOptions?.financeEmail,
      invoiceDeadlineDate: emailOptions?.deadlineDate,
      royaltyDonationOrg: emailOptions?.donationOrg,
    }
    const covered = resolveTemplate(
      labelInfo.emailTemplate,
      artistData.artist,
      period,
      amount,
      labelInfo,
      appDefaults
    )
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    const coverLines = doc.splitTextToSize(covered, 170)
    const coverPageHeight = doc.internal.pageSize.getHeight()
    let yC = margin
    coverLines.forEach((line: string) => {
      if (yC > coverPageHeight - FOOTER_RESERVED_MM) { doc.addPage(); yC = margin }
      doc.text(line, margin, yC)
      yC += 5
    })
    doc.addPage()
  }

  let yPos = margin

  // Add label logo in the header, filling the right third of the page width.
  // Uses pre-computed dimensions (logoDimensions) to preserve the original
  // aspect ratio — equivalent to CSS object-contain within the right-third area.
  const logoSrc = labelInfo.logoBase64 ?? labelInfo.logo
  if (logoSrc) {
    try {
      const pageWidth = doc.internal.pageSize.getWidth()
      const { w, h } = logoDimensions ?? { w: LABEL_LOGO_MAX_WIDTH_MM, h: LABEL_LOGO_MAX_HEIGHT_MM }
      // Right-align against the right margin so the logo never overflows.
      const logoX = pageWidth - margin - w
      const logoY = yPos - 5
      doc.addImage(logoSrc, 'PNG', logoX, logoY, w, h)
    } catch {
      // Logo rendering failed, continue without it
    }
  }

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  
  if (labelInfo.name) {
    doc.text(labelInfo.name, margin, yPos)
    yPos += 5
  }

  if (labelInfo.legalForm) {
    doc.setTextColor(120, 120, 120)
    doc.text(labelInfo.legalForm, margin, yPos)
    doc.setTextColor(0, 0, 0)
    yPos += 5
  }
  
  if (labelInfo.address) {
    const addressLines = labelInfo.address.split('\n')
    addressLines.forEach((line) => {
      doc.text(line, margin, yPos)
      yPos += 5
    })
  }

  if (labelInfo.email) {
    doc.text(`E-Mail: ${labelInfo.email}`, margin, yPos)
    yPos += 5
  }

  if (labelInfo.taxNumber) {
    doc.text(`Tax Number: ${labelInfo.taxNumber}`, margin, yPos)
    yPos += 5
  }

  if (labelInfo.taxId) {
    doc.text(`VAT ID: ${labelInfo.taxId}`, margin, yPos)
    yPos += 5
  }
  
  yPos += 5

  if (invoiceNumber) {
    doc.setFontSize(10)
    doc.text(`Invoice No.: ${invoiceNumber}`, margin, yPos)
    yPos += 5
  }

  if (periodStart && periodEnd) {
    doc.setFontSize(10)
    doc.text(`Billing Period: ${periodStart} – ${periodEnd}`, margin, yPos)
    yPos += 10
  }

  doc.setLineWidth(0.5)
  doc.line(margin, yPos, 190, yPos)
  yPos += 10

  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('Statement of Sales', margin, yPos)
  yPos += 10

  doc.setFontSize(12)
  doc.text(`Artist: ${artistData.artist}`, margin, yPos)
  yPos += 6

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)

  // ── Page footer helper ────────────────────────────────────────────────────
  // Two-row footer layout to prevent element overlap:
  //   Row 1 (footerTopY): label bank / contact info, left-aligned
  //   Row 2 (footerBotY): [NR logo left] [APP_CREDITS center] [Page N/M right]
  // The logo is rendered here (not in a separate post-loop) so draw order is
  // deterministic and text is never painted underneath the logo.
  const drawPageFooter = (data: { pageNumber: number }) => {
    const pageHeight = doc.internal.pageSize.getHeight()
    const pageWidth = doc.internal.pageSize.getWidth()

    // Row 2 baseline — leaves FOOTER_BOTTOM_MARGIN_MM from the bottom edge for readability.
    const footerBotY = pageHeight - FOOTER_BOTTOM_MARGIN_MM
    // Row 1 baseline — FOOTER_ROW_SPACING_MM above Row 2 for label bank/contact text.
    const footerTopY = footerBotY - FOOTER_ROW_SPACING_MM

    // Reset font to a known state so bold/italic set by previous drawing calls (e.g.
    // section headings, autoTable internals) never bleeds into the footer text.
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(150, 150, 150)

    // ── Row 1: label-specific footer text or bank details ─────────────────
    // Constrained to FOOTER_TEXT_WIDTH_RATIO of the page so it never reaches the
    // center credit text on Row 2.
    const footerLeft = labelInfo.footerText
      ? labelInfo.footerText.replace(/\n/g, ' · ')
      : labelInfo.bankAccount
        ? labelInfo.bankAccount.replace(/\n/g, ' · ')
        : ''
    if (footerLeft) {
      doc.text(footerLeft, margin, footerTopY, { maxWidth: pageWidth * FOOTER_TEXT_WIDTH_RATIO - margin })
    }

    // ── Row 2 left: software branding logo ────────────────────────────────
    try {
      doc.saveGraphicsState()
      doc.setGState(new GState({ opacity: 0.5 }))
      doc.addImage(
        APP_LOGO,
        'PNG',
        margin - FOOTER_LOGO_LEFT_OFFSET_MM,
        footerBotY - APP_LOGO_FOOTER_SIZE_MM + FOOTER_LOGO_VERTICAL_NUDGE_MM,
        APP_LOGO_FOOTER_SIZE_MM,
        APP_LOGO_FOOTER_SIZE_MM
      )
      doc.restoreGraphicsState()
    } catch (err) {
      console.warn('Failed to render app logo in PDF footer:', err)
    }

    // ── Row 2 center: software branding credit ────────────────────────────
    doc.setTextColor(150, 150, 150)
    doc.text(APP_CREDITS, pageWidth / 2, footerBotY, { align: 'center' })

    // ── Row 2 right: page number "Page X of Y" ────────────────────────────
    // `TOTAL_PAGES_PLACEHOLDER` is replaced by the real page count via
    // `doc.putTotalPages()` at the end of `buildPDF`, ensuring every page
    // shows the correct final total rather than the count at render time.
    doc.text(`Page ${data.pageNumber} of ${TOTAL_PAGES_PLACEHOLDER}`, pageWidth - margin, footerBotY, { align: 'right' })

    doc.setTextColor(0, 0, 0)
  }

  // ── Financial waterfall summary ───────────────────────────────────────────
  // Visualises the revenue flow:
  //   Revenue Buckets → × Split% per bucket (omitted when 100%) → Artist Share
  //   → +Manual Revenue → –Expenses → Net Payout
  const physicalReleasesRevenue = artistData.physicalReleasesRevenue

  // Digital revenue broken into streams / downloads / unclassified.
  // Guard against undefined/NaN coming from older cached data by normalising to 0.
  const safeStreamRevenue = isFinite(artistData.totalStreamRevenue) ? artistData.totalStreamRevenue : 0
  const safeDownloadRevenue = isFinite(artistData.totalDownloadRevenue) ? artistData.totalDownloadRevenue : 0
  const safeDigitalRevenue = isFinite(artistData.totalDigitalRevenue) ? artistData.totalDigitalRevenue : 0

  const digitalOtherRevenue = Math.max(0, safeDigitalRevenue - safeStreamRevenue - safeDownloadRevenue)
  const hasStreamDownloadDetail = safeStreamRevenue > 0 || safeDownloadRevenue > 0

  // ── Per-bucket split application ────────────────────────────────────────────
  const digitalAfterFeeDisplay = safeFinite(artistData.digitalRevenueAfterFee)
  const physRelAfterFeeDisplay = artistData.physicalReleasesRevenueAfterFee
  const darkmerchAfterFeeDisplay = artistData.darkmerchRevenueAfterFee
  const digitalSplitPct = artistData.digitalSplitPercentage
  const believeSplitPct = artistData.believeSplitPercentage
  const bandcampSplitPct = artistData.bandcampSplitPercentage
  const physSplitPct = artistData.physicalSplitPercentage
  const darkmerchSplitPct = artistData.darkmerchSplitPercentage

  const waterfallRows: string[][] = []

  const believeAfterFee = safeFinite(artistData.believeDigitalRevenueAfterFee)
  const bandcampAfterFee = safeFinite(artistData.bandcampDigitalRevenueAfterFee)
  const otherDigitalAfterFee = safeFinite(artistData.otherDigitalRevenueAfterFee)

  // ── Bucket share values (after-fee revenue × per-bucket split percentages) ──
  const digitalShare =
    believeAfterFee * (believeSplitPct / 100) +
    bandcampAfterFee * (bandcampSplitPct / 100) +
    otherDigitalAfterFee * (digitalSplitPct / 100)
  const physRelShare = physRelAfterFeeDisplay * (physSplitPct / 100)
  const darkmerchShare = darkmerchAfterFeeDisplay * (darkmerchSplitPct / 100)
  const artistShare = digitalShare + physRelShare + darkmerchShare

  // ── Digital revenue sub-buckets ──────────────────────────────────────────
  if (hasStreamDownloadDetail) {
    if (safeStreamRevenue > 0) {
      waterfallRows.push(['Streaming Revenue', formatCurrency(safeStreamRevenue)])
    }
    if (safeDownloadRevenue > 0) {
      waterfallRows.push(['Download Revenue', formatCurrency(safeDownloadRevenue)])
    }
    if (digitalOtherRevenue > 0) {
      waterfallRows.push(['Digital Revenue (other)', formatCurrency(digitalOtherRevenue)])
    }
  } else if (safeDigitalRevenue > 0) {
    waterfallRows.push(['Digital Revenue', formatCurrency(safeDigitalRevenue)])
  }

  // Show digital split once after all digital sub-buckets (omit when 100% or no after-fee revenue)
  const digitalSources: DigitalSourceSplit[] = [
    { label: 'Believe', percentage: believeSplitPct, hasRevenue: believeAfterFee > 0 },
    { label: 'Bandcamp', percentage: bandcampSplitPct, hasRevenue: bandcampAfterFee > 0 },
    { label: 'Other', percentage: digitalSplitPct, hasRevenue: otherDigitalAfterFee > 0 },
  ]
  const hasReducedDigitalSplit = digitalSources.some(source => source.hasRevenue && source.percentage < 100)
  if (digitalAfterFeeDisplay > 0 && hasReducedDigitalSplit) {
    waterfallRows.push([buildDigitalSplitLabel(digitalSplitPct, digitalSources), formatCurrency(digitalShare)])
  }

  // ── Physical releases ──────────────────────────────────────────────────────
  if (physicalReleasesRevenue > 0) {
    waterfallRows.push(['Physical Releases', formatCurrency(physicalReleasesRevenue)])
    if (physSplitPct < 100) {
      waterfallRows.push([`× Physical Split (${physSplitPct}%)`, formatCurrency(physRelShare)])
    }
  }

  // ── Darkmerch / Merchandise ────────────────────────────────────────────────
  if (artistData.darkmerchRevenue > 0) {
    waterfallRows.push(['Darkmerch / Merchandise', formatCurrency(artistData.darkmerchRevenue)])
    if (darkmerchSplitPct < 100) {
      waterfallRows.push([`× Merchandise Split (${darkmerchSplitPct}%)`, formatCurrency(darkmerchShare)])
    }
  }

  // ── Artist share total (sum of all bucket splits) ──────────────────────────
  waterfallRows.push(['= Artist Share', formatCurrency(artistShare)])

  // ── Post-split: individual manual revenue entries ──────────────────────────
  for (const entry of artistData.manualRevenueEntries) {
    const entryLabel = entry.description ? `+ Manual: ${entry.description}` : '+ Manual Revenue'
    waterfallRows.push([entryLabel, formatCurrency(entry.amount)])
  }

  // ── Post-split: individual deductible expense entries ─────────────────────
  for (const entry of artistData.expenseEntries) {
    const entryLabel = entry.description ? `– ${entry.description}` : '– Deductible Cost / Advance'
    const dateLabel = entry.date ? ` (${entry.date})` : ''
    waterfallRows.push([`${entryLabel}${dateLabel}`, `- ${formatCurrency(entry.amount)}`])
  }

  const isNegativePayout = artistData.finalPayout < 0
  const payoutRowIndex = waterfallRows.length
  const payoutDisplay = isNegativePayout
    ? `- ${formatCurrency(Math.abs(artistData.finalPayout))}`
    : formatCurrency(artistData.finalPayout)
  waterfallRows.push(['= Period Payout (Artist Share)', payoutDisplay])
  const opening = artistData.openingBalanceEur ?? 0
  if (Math.abs(opening) >= 0.005) {
    waterfallRows.push([
      opening < 0 ? '– Opening balance' : '+ Opening balance',
      formatCurrency(opening),
    ])
    waterfallRows.push(['= Amount due', formatCurrency(artistData.amountDueEur ?? (artistData.finalPayout + opening))])
  }

  autoTable(doc, {
    startY: yPos,
    head: [['Item', 'Amount']],
    body: waterfallRows,
    theme: 'striped',
    styles: { fontSize: 9, cellPadding: 2.5 },
    headStyles: { fillColor: [40, 40, 60], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 245, 250] },
    columnStyles: { 1: { halign: 'right' } },
    margin: { left: margin, right: margin, bottom: FOOTER_RESERVED_MM },
    didParseCell: (data) => {
      if (isNegativePayout && data.section === 'body' && data.row.index === payoutRowIndex) {
        data.cell.styles.textColor = NEGATIVE_PAYOUT_COLOR_RGB
        data.cell.styles.fontStyle = 'bold'
      }
    },
  })
  yPos = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10

  // ── Section heading helper ────────────────────────────────────────────────
  // Renders a small bold label above a breakdown table. When insufficient
  // vertical space remains on the current page, a new page is added first so
  // the heading is never orphaned at the bottom of a page without the table
  // that follows it.
  const renderSectionHeading = (title: string): void => {
    const pageHeight = doc.internal.pageSize.getHeight()
    if (yPos >= pageHeight - MIN_SPACE_FOR_SECTION_HEADING_MM) {
      doc.addPage()
      yPos = margin
    }
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(40, 40, 60)
    doc.text(title, margin, yPos)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(0, 0, 0)
    yPos += 5
  }

  // ── Release breakdown ─────────────────────────────────────────────────────
  if (settings.includeReleaseBreakdown && artistData.releaseBreakdown.length > 0) {
    const allReleaseBreakdown = settings.hideCompilationsInStatement
      ? artistData.releaseBreakdown.filter(rel => !isCompilationRelease(rel, compilationFilters))
      : artistData.releaseBreakdown
    // Filter out entries that have no usable identifier (empty title AND empty
    // UPC/EAN AND empty catalog number).  These are typically physical merch or
    // platform service-fee rows whose revenue is already counted in the totals.
    const releaseBreakdown = allReleaseBreakdown.filter(
      rel => rel.releaseTitle || rel.upcEan || rel.catalogNumber
    )
    if (releaseBreakdown.length > 0) {
      renderSectionHeading('Revenue by Release')
      autoTable(doc, {
        startY: yPos,
        head: [['Release Title', 'Revenue', 'Qty', 'Type']],
        body: releaseBreakdown.slice(0, MAX_BREAKDOWN_ROWS).map(rel => [
          rel.releaseTitle || '-',
          formatCurrency(rel.revenue),
          String(rel.quantity),
          rel.isPhysical ? 'Physical' : 'Digital',
        ]),
        theme: 'striped',
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [40, 40, 60], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [245, 245, 250] },
        columnStyles: {
          1: { halign: 'right' },
          2: { halign: 'right' },
        },
        margin: { left: margin, right: margin, bottom: FOOTER_RESERVED_MM },
      })
      yPos = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10
    }
  }

  // ── Platform breakdown ─────────────────────────────────────────────────────
  // Shows Downloads and Streams as separate columns when the data distinguishes
  // them. Falls back to a single Qty column when type info is not available.
  if (settings.includePlatformBreakdown && artistData.platformBreakdown.length > 0) {
    const hasTypeInfo = artistData.platformBreakdown.some(
      p => p.downloadQuantity !== undefined || p.streamQuantity !== undefined
    )
    renderSectionHeading('Revenue by Platform')
    if (hasTypeInfo) {
      autoTable(doc, {
        startY: yPos,
        head: [['Platform', 'Revenue', 'Downloads', 'Streams']],
        body: artistData.platformBreakdown.slice(0, MAX_BREAKDOWN_ROWS).map(p => [
          p.platform || 'Unknown',
          formatCurrency(p.revenue),
          String(p.downloadQuantity ?? 0),
          String(p.streamQuantity ?? 0),
        ]),
        theme: 'striped',
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [40, 40, 60], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [245, 245, 250] },
        columnStyles: {
          1: { halign: 'right' },
          2: { halign: 'right' },
          3: { halign: 'right' },
        },
        margin: { left: margin, right: margin, bottom: FOOTER_RESERVED_MM },
      })
    } else {
      autoTable(doc, {
        startY: yPos,
        head: [['Platform', 'Revenue', 'Qty']],
        body: artistData.platformBreakdown.slice(0, MAX_BREAKDOWN_ROWS).map(p => [
          p.platform || 'Unknown',
          formatCurrency(p.revenue),
          String(p.quantity),
        ]),
        theme: 'striped',
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [40, 40, 60], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [245, 245, 250] },
        columnStyles: {
          1: { halign: 'right' },
          2: { halign: 'right' },
        },
        margin: { left: margin, right: margin, bottom: FOOTER_RESERVED_MM },
      })
    }
    yPos = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10
  }

  // ── Country breakdown ─────────────────────────────────────────────────────
  if (settings.includeCountryBreakdown && artistData.countryBreakdown.length > 0) {
    renderSectionHeading('Revenue by Country')
    const topN = settings.topCountriesCount ?? 15
    const shownCountries = artistData.countryBreakdown.slice(0, topN)
    const remainingCountries = artistData.countryBreakdown.length - shownCountries.length
    autoTable(doc, {
      startY: yPos,
      head: [['Country', 'Revenue', 'Qty']],
      body: shownCountries.map(c => [
        c.country,
        formatCurrency(c.revenue),
        String(c.quantity),
      ]),
      theme: 'striped',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [40, 40, 60], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 245, 250] },
      columnStyles: {
        1: { halign: 'right' },
        2: { halign: 'right' },
      },
      margin: { left: margin, right: margin, bottom: FOOTER_RESERVED_MM },
    })
    yPos = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5
    if (remainingCountries > 0) {
      doc.setFontSize(FOOTNOTE_FONT_SIZE_PT)
      doc.setFont('helvetica', 'italic')
      doc.setTextColor(...FOOTNOTE_TEXT_COLOR_RGB)
      doc.text(`(+ ${remainingCountries} more ${remainingCountries === 1 ? 'country' : 'countries'} not shown)`, margin, yPos)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(0, 0, 0)
      yPos += 7
    } else {
      yPos += 5
    }
  }

  // ── Monthly breakdown ─────────────────────────────────────────────────────
  if (settings.includeMonthlyBreakdown && artistData.monthlyBreakdown.length > 0) {
    renderSectionHeading('Revenue by Month')
    autoTable(doc, {
      startY: yPos,
      head: [['Month', 'Revenue']],
      body: artistData.monthlyBreakdown.slice(0, MAX_BREAKDOWN_ROWS).map(m => [
        m.month,
        formatCurrency(m.revenue),
      ]),
      theme: 'striped',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [40, 40, 60], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 245, 250] },
      columnStyles: { 1: { halign: 'right' } },
      margin: { left: margin, right: margin, bottom: FOOTER_RESERVED_MM },
    })
    yPos = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10
  }

  // ── Pie chart: revenue category breakdown ─────────────────────────────────
  // Drawn using an HTML canvas (available in the browser context) and embedded
  // in the PDF as a PNG image.  Shows each revenue category's share of the
  // total gross revenue so the artist can see the mix at a glance.
  if (settings.includePieChart) {
    /** Canvas pixel dimensions — high enough for crisp rendering on Retina screens. */
    const PIE_CANVAS_SIZE = 600
    /** Vertical centre of the pie as a fraction of canvas height. */
    const PIE_CENTER_Y_RATIO = 0.44
    /** Pie radius as a fraction of canvas size. */
    const PIE_RADIUS_RATIO = 0.36
    /** Gap in px between pie bottom and legend start. */
    const PIE_LEGEND_GAP_PX = 24
    /** Vertical spacing in px between legend rows. */
    const PIE_LEGEND_ROW_HEIGHT_PX = 28

    const physRevenue = artistData.totalPhysicalRevenue - artistData.darkmerchRevenue
    // Digital (other) = all digital revenue not classified as a download or stream
    const digitalOtherRevenue = Math.max(
      0,
      artistData.totalDigitalRevenue - artistData.totalDownloadRevenue - artistData.totalStreamRevenue
    )
    const segments = [
      { label: 'Streams', value: artistData.totalStreamRevenue, color: '#4f86c6' },
      { label: 'Downloads', value: artistData.totalDownloadRevenue, color: '#6bbf87' },
      { label: 'Digital (other)', value: digitalOtherRevenue, color: '#a78bfa' },
      { label: 'Physical Releases', value: physRevenue, color: '#f59e42' },
      { label: 'Merchandise', value: artistData.darkmerchRevenue, color: '#e07070' },
      { label: 'Manual Revenue', value: artistData.manualRevenue, color: '#9ca3af' },
    ].filter(s => s.value > 0)

    const total = segments.reduce((s, seg) => s + seg.value, 0)

    if (segments.length > 0 && total > 0) {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = PIE_CANVAS_SIZE
        canvas.height = PIE_CANVAS_SIZE
        const ctx = canvas.getContext('2d')
        if (ctx) {
          const cx = PIE_CANVAS_SIZE / 2
          const cy = PIE_CANVAS_SIZE * PIE_CENTER_Y_RATIO
          const radius = PIE_CANVAS_SIZE * PIE_RADIUS_RATIO

          let startAngle = -Math.PI / 2
          for (const seg of segments) {
            const slice = (seg.value / total) * 2 * Math.PI
            ctx.beginPath()
            ctx.moveTo(cx, cy)
            ctx.arc(cx, cy, radius, startAngle, startAngle + slice)
            ctx.closePath()
            ctx.fillStyle = seg.color
            ctx.fill()
            ctx.strokeStyle = '#ffffff'
            ctx.lineWidth = 2
            ctx.stroke()
            startAngle += slice
          }

          // Legend
          const legendStartY = cy + radius + PIE_LEGEND_GAP_PX
          ctx.font = 'bold 20px sans-serif'
          segments.forEach((seg, i) => {
            const lx = 20
            const ly = legendStartY + i * PIE_LEGEND_ROW_HEIGHT_PX
            ctx.fillStyle = seg.color
            ctx.fillRect(lx, ly - 14, 20, 18)
            ctx.fillStyle = '#333333'
            const pct = ((seg.value / total) * 100).toFixed(1)
            ctx.fillText(`${seg.label}: ${pct}%`, lx + 28, ly)
          })

          const imgData = canvas.toDataURL('image/png')
          /** Rendered chart height in PDF mm */
          const chartH = 90
          /** Rendered chart width in PDF mm */
          const chartW = 85
          const pageHeight = doc.internal.pageSize.getHeight()
          if (yPos + chartH > pageHeight - FOOTER_RESERVED_MM) {
            doc.addPage()
            yPos = margin
          }
          renderSectionHeading('Revenue Breakdown')
          const pageWidth = doc.internal.pageSize.getWidth()
          const chartX = (pageWidth - chartW) / 2
          doc.addImage(imgData, 'PNG', chartX, yPos, chartW, chartH)
          yPos += chartH + 8
        }
      } catch (err) {
        // Pie chart rendering failed — log but do not abort PDF generation
        console.warn('Failed to render pie chart in PDF:', err)
      }
    }
  }

  // ── Post-processing: draw footer on every page ────────────────────────────
  // By iterating over all pages here (rather than relying solely on autoTable's
  // `didDrawPage` callback), we guarantee that manually created pages — such as
  // the e-mail cover letter pages produced via `doc.addPage()` — also receive the
  // complete two-row footer with bank info, branding logo, and "Page X of Y".
  const totalPages = doc.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)
    drawPageFooter({ pageNumber: p })
  }

  // Replace all occurrences of the placeholder with the actual final page count.
  // This must be called after every page and table has been generated so jsPDF
  // can substitute the correct total in every footer it drew during the run.
  doc.putTotalPages(TOTAL_PAGES_PLACEHOLDER)

  return doc.output('blob')
}