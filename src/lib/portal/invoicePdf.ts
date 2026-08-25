type JsPdfTextOptions = { align?: 'left' | 'center' | 'right' }
type AutoTableTextAlignment = 'left' | 'center' | 'right'

type AutoTableOptions = {
  startY: number
  theme: 'plain'
  head: string[][]
  body: string[][]
  margin: { left: number; right: number }
  headStyles: {
    fillColor: [number, number, number]
    textColor: [number, number, number]
    fontStyle: 'bold' | 'normal'
    fontSize: number
  }
  bodyStyles: {
    fillColor: [number, number, number]
    textColor: [number, number, number]
    fontSize: number
    lineColor: [number, number, number]
    lineWidth: number
  }
  columnStyles: Record<number, { cellWidth: number; halign?: AutoTableTextAlignment }>
}

type JsPdfDocument = {
  setFillColor: (color: string) => void
  rect: (x: number, y: number, width: number, height: number, style: string) => void
  setFont: (font: string, style: 'bold' | 'normal') => void
  setFontSize: (size: number) => void
  setTextColor: (color: string) => void
  text: (text: string, x: number, y: number, options?: JsPdfTextOptions) => void
  setDrawColor: (color: string) => void
  setLineWidth: (width: number) => void
  line: (x1: number, y1: number, x2: number, y2: number) => void
  output: (type: 'arraybuffer') => ArrayBuffer
  lastAutoTable?: { finalY: number }
}

type JsPdfConstructor = new (options: {
  orientation: 'portrait'
  unit: 'mm'
  format: 'a4'
}) => JsPdfDocument

export interface InvoiceLineItem {
  description: string
  qty: number
  unitPriceCents: number
}

export interface BillingParty {
  name: string
  street: string
  postalCode: string
  city: string
  country: string
  taxNumber?: string
  vatId?: string
  email?: string
}

export type InvoiceTaxStatus = 'standard' | 'small_business' | 'reverse_charge'

export interface InvoicePdfOptions {
  invoiceNumber: string
  issuedDate: string
  dueDate?: string
  artist: BillingParty
  label: BillingParty
  /** Shown in PDF header under RECHNUNG (tenant brand). */
  labelDisplayName?: string
  sosReference?: string
  sosPeriod?: string
  lineItems: InvoiceLineItem[]
  currency: string
  taxRatePct: number
  /** @deprecated use taxStatus */
  isSmallBusiness?: boolean
  taxStatus?: InvoiceTaxStatus
  notes?: string
  /** Optional ECB reference rate footnote when currency ≠ EUR. */
  fxNote?: string
}

function formatCurrency(cents: number, currency: string): string {
  return (cents / 100).toLocaleString('de-DE', { style: 'currency', currency })
}

function formatDate(date: string | undefined): string {
  if (!date) return '—'
  return new Intl.DateTimeFormat('de-DE').format(new Date(date))
}

function buildPartyLines(party: BillingParty): string[] {
  const lines = [
    party.name,
    party.street,
    `${party.postalCode} ${party.city}`.trim(),
    party.country,
  ].filter((line) => line.trim().length > 0)

  if (party.taxNumber?.trim()) {
    lines.push(`Steuernummer: ${party.taxNumber.trim()}`)
  }

  if (party.vatId?.trim()) {
    lines.push(`USt-IdNr.: ${party.vatId.trim()}`)
  }

  if (party.email?.trim()) {
    lines.push(party.email.trim())
  }

  return lines
}

function drawTextLines(
  doc: JsPdfDocument,
  lines: string[],
  startX: number,
  startY: number,
  color: string,
): number {
  doc.setTextColor(color)
  let y = startY

  for (const line of lines) {
    doc.text(line, startX, y)
    y += 5
  }

  return y
}

export async function generateInvoicePdf(options: InvoicePdfOptions): Promise<Uint8Array> {
  // Dynamic imports avoid CJS require() while keeping the function usable in
  // both Route Handlers and Server Actions (both are async Node.js contexts).
  // jspdf-autotable v5 does not patch the jsPDF prototype in Node.js (no
  // window), so we use the standalone autoTable(doc, …) function.
  const { jsPDF } = await import('jspdf') as unknown as { jsPDF: JsPdfConstructor }
  const { autoTable: autoTableFn } = await import('jspdf-autotable') as unknown as {
    autoTable: (doc: JsPdfDocument, options: AutoTableOptions) => void
  }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const pageWidth = 210
  const pageHeight = 297
  const margin = 18
  const bg = '#101010'
  const fg = '#FFFFFF'
  const muted = '#A0A0A0'
  const line = '#383838'

  doc.setFillColor(bg)
  doc.rect(0, 0, pageWidth, pageHeight, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.setTextColor(fg)
  doc.text('RECHNUNG', margin, 24)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(muted)
  const headerBrand =
    options.labelDisplayName?.trim() ||
    options.label.name?.trim() ||
    'Artist Portal'
  doc.text(`${headerBrand} — Artist Portal`, margin, 30)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(fg)
  doc.text(options.invoiceNumber, pageWidth - margin, 24, { align: 'right' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(muted)
  doc.text(`Rechnungsdatum: ${formatDate(options.issuedDate)}`, pageWidth - margin, 30, { align: 'right' })
  doc.text(`Fällig am: ${formatDate(options.dueDate)}`, pageWidth - margin, 35, { align: 'right' })

  doc.setDrawColor(line)
  doc.setLineWidth(0.35)
  doc.line(margin, 40, pageWidth - margin, 40)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(muted)
  doc.text('VON', margin, 49)
  doc.text('AN', 112, 49)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  const fromBottom = drawTextLines(doc, buildPartyLines(options.artist), margin, 56, fg)
  const toBottom = drawTextLines(doc, buildPartyLines(options.label), 112, 56, fg)
  let cursorY = Math.max(fromBottom, toBottom) + 6

  if (options.sosReference?.trim()) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(fg)
    doc.text('Leistungsbeschreibung', margin, cursorY)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(muted)
    doc.text(
      `Musikalische Dienstleistungen gemäß Statement of Sales ${options.sosReference.trim()}`,
      margin,
      cursorY + 6,
    )

    if (options.sosPeriod?.trim()) {
      doc.text(`Abrechnungszeitraum: ${options.sosPeriod.trim()}`, margin, cursorY + 11)
      cursorY += 17
    } else {
      cursorY += 12
    }
  }

  const subtotalCents = options.lineItems.reduce((sum, item) => sum + item.qty * item.unitPriceCents, 0)
  const taxCents = Math.round(subtotalCents * (options.taxRatePct / 100))
  const totalCents = subtotalCents + taxCents

  autoTableFn(doc, {
    startY: cursorY,
    theme: 'plain',
    head: [['Beschreibung', 'Menge', 'Einzelpreis', 'Gesamt']],
    body: options.lineItems.map((item) => [
      item.description,
      String(item.qty),
      formatCurrency(item.unitPriceCents, options.currency),
      formatCurrency(item.qty * item.unitPriceCents, options.currency),
    ]),
    margin: { left: margin, right: margin },
    headStyles: {
      fillColor: [41, 41, 41],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9,
    },
    bodyStyles: {
      fillColor: [16, 16, 16],
      textColor: [240, 240, 240],
      fontSize: 9,
      lineColor: [56, 56, 56],
      lineWidth: 0.1,
    },
    columnStyles: {
      0: { cellWidth: 90 },
      1: { cellWidth: 20, halign: 'center' },
      2: { cellWidth: 35, halign: 'right' },
      3: { cellWidth: 35, halign: 'right' },
    },
  })

  const tableBottom = (doc.lastAutoTable?.finalY ?? cursorY) + 8
  const totalsLabelX = pageWidth - margin - 60
  const totalsValueX = pageWidth - margin

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(muted)
  doc.text('Nettobetrag', totalsLabelX, tableBottom)
  doc.setTextColor(fg)
  doc.text(formatCurrency(subtotalCents, options.currency), totalsValueX, tableBottom, { align: 'right' })

  const taxStatus: InvoiceTaxStatus =
    options.taxStatus ??
    (options.isSmallBusiness ? 'small_business' : 'standard')
  const showVatLine = taxStatus === 'standard'

  let totalsY = tableBottom
  if (showVatLine) {
    doc.setTextColor(muted)
    doc.text(`Umsatzsteuer (${options.taxRatePct.toFixed(2)}%)`, totalsLabelX, totalsY + 6)
    doc.setTextColor(fg)
    doc.text(formatCurrency(taxCents, options.currency), totalsValueX, totalsY + 6, { align: 'right' })
    totalsY += 6
  }

  doc.setDrawColor(line)
  doc.line(totalsLabelX, totalsY + 3, totalsValueX, totalsY + 3)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(fg)
  doc.text('Gesamtbetrag', totalsLabelX, totalsY + 9)
  doc.text(formatCurrency(totalCents, options.currency), totalsValueX, totalsY + 9, { align: 'right' })

  let footerY = totalsY + 22

  if (options.notes?.trim()) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(fg)
    doc.text('Notizen', margin, footerY)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(muted)
    doc.text(options.notes.trim(), margin, footerY + 6)
    footerY += 16
  }

  if (taxStatus === 'small_business') {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(muted)
    doc.text('Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.', margin, footerY)
    footerY += 6
  } else if (taxStatus === 'reverse_charge') {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(muted)
    doc.text(
      'Steuerschuldnerschaft des Leistungsempfängers (Reverse Charge).',
      margin,
      footerY,
    )
    footerY += 6
    const labelVatId = options.label.vatId?.trim()
    if (labelVatId) {
      doc.text(`USt-IdNr. des Leistungsempfängers: ${labelVatId}`, margin, footerY)
      footerY += 6
    }
  }

  if (options.fxNote?.trim()) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(muted)
    doc.text(options.fxNote.trim(), margin, footerY)
    footerY += 6
  }

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(muted)
  doc.text('Vielen Dank für die Zusammenarbeit.', margin, Math.min(footerY + 6, pageHeight - 14))
  doc.text(options.invoiceNumber, pageWidth - margin, pageHeight - 12, { align: 'right' })

  return new Uint8Array(doc.output('arraybuffer'))
}
