'use client'

import { useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { useMergedAccountingLabels } from '@/lib/i18n/accountingFallbacks'
import { interpolate } from '@/lib/i18n/interpolate'
import {
  generatePDF,
  generateExcel,
  downloadBlob,
  generateZipOfAllStatements,
} from '@/lib/sos/export-utils'
import { createSafeFilename } from '@/lib/sos/utils'
import { isValidArtistId, isValidPeriod } from '@/lib/sos/validation'
import type { ExcelExportSettingsPatch } from '@/lib/sos/excelExportSettings'
import { uploadStatement } from '../../app/portal/statements/_actions/uploadStatement'
import {
  buildLineItemsFromArtistData,
  computeTotalStreamsFromArtistData,
  monthToPeriodDate,
} from '@/lib/sos/lineItemsFromArtistData'
import { persistAnalyticsAfterStatementUpload } from '@/lib/sos/persistAfterStatementUpload'
import type { TerritoryMetricRow } from '@/lib/sos/data-processor'
import type { MerchOrderRow } from '@/lib/sos/merchOrderRows'
import type {
  SafeProcessedArtistData,
  LabelInfo,
  PdfExportSettings,
  AppDefaults,
  LabelArtist,
  EmailConfig,
  CompilationFilter,
  ArtistRevenue,
} from '@/lib/sos/types'

export interface SosExportPersistContext {
  territoryMetrics: TerritoryMetricRow[]
  merchOrderRows: MerchOrderRow[]
  revenues: ArtistRevenue[]
  bronzeBatchIds: string[]
}

/** Converts a Blob to a Base64-encoded string. */
async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  return btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''))
}

function resolveBronzeBatchLineage(bronzeBatchIds: string[] | undefined) {
  const batchIds = bronzeBatchIds ?? []
  return {
    batchIds,
    /** Statement row stores a single primary batch; full lineage lives on period summaries. */
    primaryBatchId: batchIds[0],
  }
}

const exportFallback = {
  exportNoArtistData: 'No data found for artist "{artist}"',
  exportPdfDownloaded: 'PDF for "{artist}" downloaded',
  exportPdfFailed: 'PDF export failed',
  exportExcelDownloaded: 'Excel for "{artist}" downloaded',
  exportExcelFailed: 'Excel export failed',
  exportZipDownloaded: 'ZIP with {count} statements downloaded',
  exportZipFailed: 'ZIP export failed',
  exportPortalDraftSaved:
    'Draft statement saved to portal. Approve in Settlement Center to notify the artist.',
  exportPortalUploadFailed: 'Upload failed: {error}. PDF saved locally instead.',
  exportPortalUploading: 'Uploading statement to portal…',
} as const

function buildUploadPayload(
  artistData: SafeProcessedArtistData,
  periodStart: string,
  periodEnd: string,
) {
  const lineItems = buildLineItemsFromArtistData('pending', artistData).map(
    ({ statementId: _statementId, releaseId, platform, country, streams, revenueEur, quantity }) => ({
      releaseId: releaseId ?? undefined,
      platform: platform ?? undefined,
      country: country ?? undefined,
      streams,
      revenueEur,
      quantity,
    }),
  )
  return {
    periodStart: monthToPeriodDate(periodStart, false),
    periodEnd: monthToPeriodDate(periodEnd || periodStart, true),
    totalStreams: computeTotalStreamsFromArtistData(artistData),
    lineItems,
  }
}

/**
 * Provides PDF, Excel and ZIP export actions with error handling.
 * Uses the safe (no raw-transaction) artist data from the Web Worker.
 */
export function useExports(
  processedData: SafeProcessedArtistData[],
  labelInfo: LabelInfo,
  periodStart: string,
  periodEnd: string,
  pdfSettings?: Partial<PdfExportSettings>,
  appDefaults?: Partial<AppDefaults>,
  labelArtists?: LabelArtist[],
  emailConfig?: Partial<EmailConfig>,
  compilationFilters: CompilationFilter[] = [],
  autoUploadToPortal = false,
  persistContext?: SosExportPersistContext,
) {
  const t = useMergedAccountingLabels(exportFallback)

  const emailOptions = useMemo(
    () =>
      appDefaults
        ? {
            financeEmail: appDefaults.financeEmail ?? '',
            deadlineDate: appDefaults.invoiceDeadlineDate ?? '',
            donationOrg: appDefaults.royaltyDonationOrg ?? '',
          }
        : undefined,
    [appDefaults]
  )

  // Pre-build a O(1) lowercase name → LabelArtist lookup map.
  const artistInfoMap = useMemo(() => {
    const map = new Map<string, LabelArtist>()
    for (const la of labelArtists ?? []) {
      map.set(la.name.toLowerCase(), la)
    }
    return map
  }, [labelArtists])

  const handleDownloadPDF = useCallback(
    async (artist: string) => {
      const artistData = processedData.find(d => d.artist === artist)
      if (!artistData) {
        toast.error(interpolate(t.exportNoArtistData, { artist }))
        return
      }

      const currentYear = new Date().getFullYear()
      const prefix = labelInfo.invoiceNumberPrefix ?? 'SOS'
      const artistSlug = artist.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 4) || '0001'
      const invoiceNumber = `${prefix}-${currentYear}-${artistSlug}`

      const artistInfo = artistInfoMap.get(artist.toLowerCase())

      try {
        const blob = await generatePDF(
          artistData,
          labelInfo,
          periodStart || undefined,
          periodEnd || undefined,
          invoiceNumber,
          pdfSettings,
          emailOptions,
          artistInfo,
          compilationFilters
        )

        // Attempt direct Server Action upload if auto-upload is enabled and artist is linked
        const shouldUpload =
          autoUploadToPortal &&
          artistInfo?.artistId != null &&
          isValidArtistId(artistInfo.artistId)

        if (shouldUpload && artistInfo?.artistId) {
          const period = periodStart || String(new Date().getFullYear())
          const filename = `${createSafeFilename(artist)}_statement.pdf`
          // If period doesn't match expected format (YYYY-MM or Q{N}-YYYY), fall back to current year
          const validPeriod = isValidPeriod(period) ? period : `Q1-${new Date().getFullYear()}`

          toast.loading(t.exportPortalUploading, { id: 'sos-upload' })

          const pdfBase64 = await blobToBase64(blob)
          const analyticsPayload = buildUploadPayload(artistData, periodStart, periodEnd)
          const { batchIds, primaryBatchId } = resolveBronzeBatchLineage(
            persistContext?.bronzeBatchIds,
          )
          const result = await uploadStatement({
            artistId: artistInfo.artistId,
            filename,
            period: validPeriod,
            amountEur: artistData.finalPayout,
            ...analyticsPayload,
            batchId: primaryBatchId,
            pdfBase64,
          })

          if (result.success) {
            if (persistContext && periodStart) {
              void persistAnalyticsAfterStatementUpload({
                artistName: artist,
                periodStart,
                periodEnd: periodEnd || periodStart,
                territoryMetrics: persistContext.territoryMetrics,
                merchOrderRows: persistContext.merchOrderRows,
                labelArtists: labelArtists ?? [],
                revenues: persistContext.revenues,
                bronzeBatchIds: batchIds,
                batchId: primaryBatchId,
              })
            }
            toast.success(t.exportPortalDraftSaved, {
              id: 'sos-upload',
            })
          } else {
            toast.error(
              interpolate(t.exportPortalUploadFailed, {
                error: result.error ?? 'Unknown error',
              }),
              { id: 'sos-upload' },
            )
            downloadBlob(blob, `${createSafeFilename(artist)}_statement.pdf`)
          }
        } else {
          downloadBlob(blob, `${createSafeFilename(artist)}_statement.pdf`)
          toast.success(interpolate(t.exportPdfDownloaded, { artist }))
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        toast.error(t.exportPdfFailed, { description: message })
        console.error('PDF export error:', err)
      }
    },
    [processedData, labelInfo, periodStart, periodEnd, pdfSettings, emailOptions, artistInfoMap, compilationFilters, autoUploadToPortal, persistContext, labelArtists, t]
  )

  const handleDownloadExcel = useCallback(
    async (artist: string, excelSettings?: ExcelExportSettingsPatch) => {
      const artistData = processedData.find(d => d.artist === artist)
      if (!artistData) {
        toast.error(interpolate(t.exportNoArtistData, { artist }))
        return
      }

      try {
        const blob = await generateExcel(
          artistData,
          labelInfo,
          periodStart || undefined,
          periodEnd || undefined,
          compilationFilters,
          excelSettings ?? pdfSettings
        )
        downloadBlob(blob, `${createSafeFilename(artist)}_statement.xlsx`)
        toast.success(interpolate(t.exportExcelDownloaded, { artist }))
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        toast.error(t.exportExcelFailed, { description: message })
        console.error('Excel export error:', err)
      }
    },
    [processedData, labelInfo, periodStart, periodEnd, compilationFilters, pdfSettings, t]
  )

  /**
   * Queued batch export — generates one document at a time so the browser
   * never tries to build hundreds of PDFs simultaneously. Progress is shown
   * via an updating sonner toast so the user sees exactly how far along the
   * export is without the tab freezing.
   */
  const handleDownloadAll = useCallback(async (excelSettings?: ExcelExportSettingsPatch) => {
    if (processedData.length === 0) {
      toast.info('No revenue data to export')
      return
    }

    const total = processedData.length
    const toastId = toast.loading(`Preparing 1 / ${total} statements…`)
    try {
      const blob = await generateZipOfAllStatements(
        processedData,
        labelInfo,
        periodStart || undefined,
        periodEnd || undefined,
        'both',
        (done, tot) => {
          if (done < tot) {
            toast.loading(`Generating ${done + 1} / ${tot} statements…`, { id: toastId })
          }
        },
        pdfSettings,
        emailOptions,
        labelArtists,
        appDefaults,
        emailConfig,
        compilationFilters,
        excelSettings,
      )
      downloadBlob(blob, 'artist_statements.zip')
      toast.success(`All ${total} statements downloaded`, { id: toastId })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      toast.error(t.exportZipFailed, { id: toastId, description: message })
      console.error('ZIP export error:', err)
    }
  }, [processedData, labelInfo, periodStart, periodEnd, pdfSettings, emailOptions, labelArtists, appDefaults, emailConfig, compilationFilters, t])

  /**
   * Queued batch export for a specific subset of artists — same async queue
   * as handleDownloadAll but filters processedData to only the provided names.
   */
  const handleDownloadSelected = useCallback(async (
    selectedArtistNames: string[],
    excelSettings?: ExcelExportSettingsPatch,
  ) => {
    if (selectedArtistNames.length === 0) {
      toast.info('No artists selected for export')
      return
    }

    const subset = processedData.filter(d => selectedArtistNames.includes(d.artist))
    if (subset.length === 0) {
      toast.error('No matching processed data for selected artists')
      return
    }

    const total = subset.length
    const toastId = toast.loading(`Preparing 1 / ${total} statements…`)
    try {
      const blob = await generateZipOfAllStatements(
        subset,
        labelInfo,
        periodStart || undefined,
        periodEnd || undefined,
        'both',
        (done, tot) => {
          if (done < tot) {
            toast.loading(`Generating ${done + 1} / ${tot} statements…`, { id: toastId })
          }
        },
        pdfSettings,
        emailOptions,
        labelArtists,
        appDefaults,
        emailConfig,
        compilationFilters,
        excelSettings,
      )
      downloadBlob(blob, 'selected_artist_statements.zip')
      toast.success(`${total} selected statement${total !== 1 ? 's' : ''} downloaded`, { id: toastId })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      toast.error(t.exportZipFailed, { id: toastId, description: message })
      console.error('ZIP export error:', err)
    }
  }, [processedData, labelInfo, periodStart, periodEnd, pdfSettings, emailOptions, labelArtists, appDefaults, emailConfig, compilationFilters, t])

  const handlePublishToPortal = useCallback(
    async (artist: string) => {
      const artistData = processedData.find(d => d.artist === artist)
      if (!artistData) {
        toast.error(interpolate(t.exportNoArtistData, { artist }))
        return
      }

      const artistInfo = artistInfoMap.get(artist.toLowerCase())

      try {
        if (!artistInfo?.artistId || !isValidArtistId(artistInfo.artistId)) {
          throw new Error(`Artist "${artist}" is not linked to a valid portal artist ID`)
        }

        const currentYear = new Date().getFullYear()
        const prefix = labelInfo.invoiceNumberPrefix ?? 'SOS'
        const artistSlug = artist.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 4) || '0001'
        const invoiceNumber = `${prefix}-${currentYear}-${artistSlug}`

        const blob = await generatePDF(
          artistData,
          labelInfo,
          periodStart || undefined,
          periodEnd || undefined,
          invoiceNumber,
          pdfSettings,
          emailOptions,
          artistInfo,
          compilationFilters
        )

        const filename = `${createSafeFilename(artist)}_statement.pdf`
        const validPeriod = isValidPeriod(periodStart) ? periodStart : `Q1-${currentYear}`
        const pdfBase64 = await blobToBase64(blob)
        const analyticsPayload = buildUploadPayload(artistData, periodStart, periodEnd)
        const { batchIds, primaryBatchId } = resolveBronzeBatchLineage(
          persistContext?.bronzeBatchIds,
        )
        const result = await uploadStatement({
          artistId: artistInfo.artistId,
          filename,
          period: validPeriod,
          amountEur: artistData.finalPayout,
          ...analyticsPayload,
          batchId: primaryBatchId,
          pdfBase64,
        })

        if (!result.success) {
          throw new Error(result.error ?? 'Failed to publish statement to portal')
        }

        if (persistContext && periodStart) {
          await persistAnalyticsAfterStatementUpload({
            artistName: artist,
            periodStart,
            periodEnd: periodEnd || periodStart,
            territoryMetrics: persistContext.territoryMetrics,
            merchOrderRows: persistContext.merchOrderRows,
            labelArtists: labelArtists ?? [],
            revenues: persistContext.revenues,
            bronzeBatchIds: batchIds,
            batchId: primaryBatchId,
          })
        }

        toast.success(t.exportPortalDraftSaved)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        toast.error(message)
      }
    },
    [processedData, artistInfoMap, labelInfo, periodStart, periodEnd, pdfSettings, emailOptions, compilationFilters, persistContext, labelArtists, t]
  )

  const buildCorrectionPdfBase64 = useCallback(
    async (artist: string, amountEur: number): Promise<string | null> => {
      const artistData = processedData.find((d) => d.artist === artist)
      if (!artistData) return null

      const artistInfo = artistInfoMap.get(artist.toLowerCase())

      try {
        const currentYear = new Date().getFullYear()
        const prefix = labelInfo.invoiceNumberPrefix ?? 'SOS'
        const artistSlug = artist.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 4) || '0001'
        const invoiceNumber = `${prefix}-${currentYear}-${artistSlug}`
        const correctedData = { ...artistData, finalPayout: amountEur }
        const blob = await generatePDF(
          correctedData,
          labelInfo,
          periodStart || undefined,
          periodEnd || undefined,
          invoiceNumber,
          pdfSettings,
          emailOptions,
          artistInfo,
          compilationFilters,
        )
        return blobToBase64(blob)
      } catch (err) {
        console.error('Correction PDF generation error:', err)
        return null
      }
    },
    [
      processedData,
      artistInfoMap,
      labelInfo,
      periodStart,
      periodEnd,
      pdfSettings,
      emailOptions,
      compilationFilters,
    ],
  )

  return {
    handleDownloadPDF,
    handleDownloadExcel,
    handleDownloadAll,
    handleDownloadSelected,
    handlePublishToPortal,
    buildCorrectionPdfBase64,
  }
}