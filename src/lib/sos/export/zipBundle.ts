import type { ExcelExportSettingsPatch } from '../excelExportSettings'
import type {
  AppDefaults,
  CompilationFilter,
  EmailConfig,
  LabelArtist,
  LabelInfo,
  PdfExportSettings,
  SafeProcessedArtistData,
} from '../types'
import { generateExcel } from './excelStatement'
import { generatePDF } from './pdfStatement'

/** Downloads a Blob as a file in the browser. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(url), 100)
}

/**
 * Generates a ZIP of PDF and/or Excel statements for all artists.
 * Processes artists sequentially to keep memory bounded and the UI responsive.
 */
export async function generateZipOfAllStatements(
  artistsData: SafeProcessedArtistData[],
  labelInfo: LabelInfo,
  periodStart?: string,
  periodEnd?: string,
  format: 'pdf' | 'excel' | 'both' = 'both',
  onProgress?: (done: number, total: number) => void,
  pdfSettings?: Partial<PdfExportSettings>,
  emailOptions?: { financeEmail: string; deadlineDate: string; donationOrg: string },
  labelArtists?: LabelArtist[],
  appDefaults?: Partial<AppDefaults>,
  emailConfig?: Partial<EmailConfig>,
  compilationFilters: CompilationFilter[] = [],
  excelSettings?: ExcelExportSettingsPatch,
): Promise<Blob> {
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  const total = artistsData.length
  const currentYear = new Date().getFullYear()

  const artistInfoMap = new Map<string, LabelArtist>()
  for (const la of labelArtists ?? []) {
    artistInfoMap.set(la.name.toLowerCase(), la)
  }

  for (let i = 0; i < artistsData.length; i++) {
    const artistData = artistsData[i]

    await new Promise<void>(resolve => setTimeout(resolve, 0))

    const safeArtistName = artistData.artist.replace(/[^a-z0-9]/gi, '_')
    const prefix = labelInfo.invoiceNumberPrefix ?? 'SOS'
    const invoiceNumber = `${prefix}-${currentYear}-${String(i + 1).padStart(4, '0')}`
    const artistInfo = artistInfoMap.get(artistData.artist.toLowerCase())

    let pdfBlob: Blob | undefined
    if (format === 'pdf' || format === 'both') {
      pdfBlob = await generatePDF(
        artistData,
        labelInfo,
        periodStart,
        periodEnd,
        invoiceNumber,
        pdfSettings,
        emailOptions,
        artistInfo,
        compilationFilters,
      )
      zip.file(`${safeArtistName}_statement.pdf`, pdfBlob)
    }

    if (format === 'excel' || format === 'both') {
      const excelBlob = await generateExcel(
        artistData,
        labelInfo,
        periodStart,
        periodEnd,
        compilationFilters,
        excelSettings ?? pdfSettings,
      )
      zip.file(`${safeArtistName}_statement.xlsx`, excelBlob)
    }

    if (artistInfo?.email && labelInfo.emailTemplate && pdfBlob && appDefaults && emailConfig) {
      const { resolveTemplate } = await import('../utils')
      const period = periodStart && periodEnd ? `${periodStart} – ${periodEnd}` : (periodStart ?? periodEnd ?? '')
      const amount = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(artistData.finalPayout)

      const subject = resolveTemplate(
        emailConfig.subjectTemplate ?? 'Statement of Sales – {period}',
        artistData.artist,
        period,
        amount,
        labelInfo,
        appDefaults,
      )
      const body = resolveTemplate(labelInfo.emailTemplate, artistData.artist, period, amount, labelInfo, appDefaults)

      const fromName = emailConfig.fromName || labelInfo.name || 'Label'
      const fromEmail = emailConfig.fromEmail || labelInfo.email || 'noreply@label.com'
      const toEmail = artistInfo.email

      const pdfBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onloadend = () => {
          const result = reader.result as string
          resolve(result.split(',')[1])
        }
        reader.onerror = reject
        reader.readAsDataURL(pdfBlob as Blob)
      })

      const boundary = `----=_NextPart_${Date.now()}_${Math.random().toString(36).substring(2)}`

      const emlContent = [
        `From: "${fromName}" <${fromEmail}>`,
        `To: "${artistData.artist}" <${toEmail}>`,
        emailConfig.replyTo ? `Reply-To: ${emailConfig.replyTo}` : '',
        `Subject: ${subject}`,
        `Date: ${new Date().toUTCString()}`,
        `MIME-Version: 1.0`,
        `Content-Type: multipart/mixed; boundary="${boundary}"`,
        ``,
        `This is a multi-part message in MIME format.`,
        `--${boundary}`,
        `Content-Type: text/plain; charset=UTF-8`,
        `Content-Transfer-Encoding: 8bit`,
        ``,
        body,
        ``,
        `--${boundary}`,
        `Content-Type: application/pdf; name="${safeArtistName}_statement.pdf"`,
        `Content-Disposition: attachment; filename="${safeArtistName}_statement.pdf"`,
        `Content-Transfer-Encoding: base64`,
        ``,
        pdfBase64.match(/.{1,76}/g)?.join('\n') || pdfBase64,
        ``,
        `--${boundary}--`,
      ].filter(l => l !== undefined).join('\r\n')

      zip.file(`${safeArtistName}_email.eml`, new Blob([emlContent], { type: 'message/rfc822' }))
    }

    onProgress?.(i + 1, total)
  }

  return await zip.generateAsync({ type: 'blob' })
}