'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { useKV } from '@/hooks/useLocalKV'
import { toast } from 'sonner'
import { useMergedAccountingLabels } from '@/lib/i18n/accountingFallbacks'
import { interpolate } from '@/lib/i18n/interpolate'
import { explainSosError } from '@/lib/sos/explainSosError'
import { extractPeriodBounds, uploadBronzeDistributorCsv } from '@/lib/sos/bronzeUpload'
import { formatBytes, formatInteger, type SosParseDoneStats } from '@/lib/sos/ingestProgress'
import { readFileWithProgress } from '@/lib/sos/readFileWithProgress'
import type { FileProcessingState, UploadedFile } from '@/lib/sos/types'

type FileType = 'believe' | 'bandcamp' | 'shopify' | 'printful' | 'darkmerch'

/**
 * Bronze archives run one at a time across every file manager. Concurrent
 * large PUTs fight for the same uplink, which is what made big CSVs fail.
 */
let bronzeArchiveQueue: Promise<unknown> = Promise.resolve()

function enqueueBronzeArchive<T>(task: () => Promise<T>): Promise<T> {
  const run = bronzeArchiveQueue.then(task)
  bronzeArchiveQueue = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

/**
 * Metadata stored in IndexedDB — excludes the raw CSV string to keep storage
 * footprint small. Raw data is held in React state (in-memory only).
 */
type UploadedFileMeta = Omit<UploadedFile, 'data'>

interface FileEventCallbacks {
  onFileAdded?: (file: UploadedFile, rowsParsed: number, rowsSkipped: number, uniqueArtists: number) => void
  onFileRemoved?: (id: string) => void
}

/**
 * Manages CSV file state for one upload zone type.
 * Handles add, remove, and replace with per-file progress tracking.
 *
 * Raw CSV strings are kept in React state (memory only) and are NOT persisted
 * to IndexedDB. Only file metadata (name, size, stats, etc.) is persisted.
 * This avoids storing hundreds of MB of text in the browser's storage.
 */
const FILE_FALLBACK = {
  fileUploadSuccess: '"{filename}" added; parsing and archiving continue',
  filesUploadSuccess: '{count} file(s) added; processing continues',
  filesUploadFailed: '{count} file(s) failed to upload',
  fileProcessFailed: 'Failed to process "{filename}"',
  fileReplaceSuccess: '"{filename}" replaced successfully',
  fileReplaceFailed: 'Failed to replace file',
  fileRemoved: 'File removed',
  xlsxConvertWarning: '"{filename}" could not be converted from XLSX — file may be corrupted or unsupported.',
  ingestReading: 'Reading {read} of {total}…',
  ingestDecoding: 'Decoding text…',
  ingestConverting: 'Converting spreadsheet to CSV…',
  ingestWaitingParser: 'Queued for parser…',
  ingestArchiving: 'Archiving to storage…',
  ingestArchiveNoPeriod:
    'No reporting period detected in the file — archiving skipped. Fix the source dates and re-add the file.',
  ingestArchiveRetryNoData: 'Data not in memory — re-upload the file to archive it.',
  ingestConfirmFailed: 'The source archive could not be verified after upload. Retry the archive to finish confirmation.',
  ingestOperationId: 'Import reference: {id}',
} as const

export function useFileManager(type: FileType, callbacks?: FileEventCallbacks) {
  const t = useMergedAccountingLabels(FILE_FALLBACK)
  // Metadata persisted in IndexedDB (no raw CSV data).
  const [fileMetas, setFileMetas] = useKV<UploadedFileMeta[]>(`${type}-files`, [])
  // Raw CSV strings kept in memory only — lost on page reload, no storage limit issues.
  const [fileDataMap, setFileDataMap] = useState<Record<string, string>>({})
  const [fileStates, setFileStates] = useState<Record<string, FileProcessingState>>({})
  const bronzeStartedRef = useRef(new Set<string>())
  const restoringFileIdsRef = useRef(new Set<string>())
  const restoringBatchIdsRef = useRef(new Set<string>())
  const fileDataRef = useRef<Record<string, string>>({})
  fileDataRef.current = fileDataMap
  const fileMetasRef = useRef(fileMetas)
  fileMetasRef.current = fileMetas

  // Merge metadata with in-memory raw data so consumers see a unified UploadedFile.
  const files = useMemo<UploadedFile[]>(
    () => (fileMetas ?? []).map(meta => ({ ...meta, data: fileDataMap[meta.id] })),
    [fileMetas, fileDataMap]
  )

  const setFileState = useCallback((id: string, state: Partial<FileProcessingState>) => {
    setFileStates((prev) => {
      if (!prev[id] && !(fileMetasRef.current ?? []).some((file) => file.id === id)) {
        return prev
      }
      return {
        ...prev,
        [id]: { ...prev[id], ...state },
      }
    })
  }, [])

  const removeFileState = useCallback((id: string) => {
    setFileStates(prev => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }, [])

  const archiveFile = useCallback(
    async (id: string, periodHint?: { periodStart?: string; periodEnd?: string }) => {
      const data = fileDataRef.current[id]
      const meta = (fileMetasRef.current ?? []).find((file) => file.id === id)
      if (!data || !meta) {
        setFileState(id, {
          bronzeStatus: 'error',
          bronzeError: t.ingestArchiveRetryNoData,
          phase: 'done',
          detail: undefined,
        })
        return
      }
      const bounds = extractPeriodBounds(
        [periodHint?.periodStart ?? meta.periodStart, periodHint?.periodEnd ?? meta.periodEnd].filter(
          (value): value is string => Boolean(value),
        ),
      )
      if (!bounds) {
        setFileState(id, {
          bronzeStatus: 'skipped',
          bronzeError: t.ingestArchiveNoPeriod,
          phase: 'done',
          detail: undefined,
        })
        return
      }
      const operationId = meta.bronzeOperationId ?? crypto.randomUUID()
      if (!meta.bronzeOperationId) {
        setFileMetas((current) =>
          (current ?? []).map((file) =>
            file.id === id ? { ...file, bronzeOperationId: operationId } : file,
          ),
        )
      }
      setFileState(id, {
        bronzeStatus: 'uploading',
        phase: 'archiving',
        detail: t.ingestArchiving,
        operationId,
      })
      const bronze = await enqueueBronzeArchive(async () => {
        // The file may have been removed while it waited in the queue — do not
        // archive a file the admin no longer sees (would leave an orphan batch).
        if (!(fileMetasRef.current ?? []).some((file) => file.id === id)) return null
        return uploadBronzeDistributorCsv({
          operationId,
          distributor: type,
          filename: meta.name,
          uploadBody: data,
          rowCount: meta.rowsParsed ?? 0,
          periodStart: bounds.periodStart,
          periodEnd: bounds.periodEnd,
        })
      })
      if (!bronze) return
      if (bronze.ok) {
        setFileMetas((current) =>
          (current ?? []).map((file) =>
            file.id === id ? { ...file, bronzeBatchId: bronze.batchId } : file,
          ),
        )
        setFileState(id, {
          bronzeStatus: 'done',
          bronzeError: undefined,
          phase: 'done',
          detail: undefined,
          operationId,
        })
      } else {
        setFileState(id, {
          bronzeStatus: 'error',
          bronzeError: bronze.phase === 'confirm' ? t.ingestConfirmFailed : bronze.message,
          phase: 'done',
          detail: undefined,
          operationId,
        })
      }
    },
    [setFileMetas, setFileState, t.ingestArchiving, t.ingestArchiveNoPeriod, t.ingestArchiveRetryNoData, t.ingestConfirmFailed, type],
  )

  const retryArchive = useCallback(
    (id: string) => {
      bronzeStartedRef.current.add(id)
      void archiveFile(id)
    },
    [archiveFile],
  )

  /**
   * Rehydrate an existing file from its completed R2 batch, preserving the
   * persisted file id and archive lineage. Never create a second batch or
   * write another R2 object just because browser memory was cleared.
   */
  const restoreArchivedFile = useCallback(async (id: string): Promise<void> => {
    const meta = (fileMetasRef.current ?? []).find((file) => file.id === id)
    if (!meta?.bronzeBatchId) throw new Error('No saved archive is linked to this file.')
    if (fileDataRef.current[id] || restoringFileIdsRef.current.has(id)) return

    const batchId = meta.bronzeBatchId
    restoringFileIdsRef.current.add(id)
    bronzeStartedRef.current.add(id)
    setFileState(id, {
      status: 'uploading',
      phase: 'archiving',
      progress: 0,
      detail: 'Loading saved file…',
      error: undefined,
      bronzeStatus: 'done',
      bronzeError: undefined,
    })
    try {
      const { downloadBronzeCsvText } = await import('@/lib/sos/bronzeDownload')
      const data = await downloadBronzeCsvText(batchId)
      if (!data) throw new Error('The saved archive is empty.')
      // The operator may remove or replace this card while R2 is responding.
      const current = (fileMetasRef.current ?? []).find((file) => file.id === id)
      if (!current || current.bronzeBatchId !== batchId) return
      setFileDataMap((prev) => ({ ...prev, [id]: data }))
      setFileState(id, {
        status: 'processing',
        phase: 'parsing',
        progress: 0,
        detail: t.ingestWaitingParser,
        error: undefined,
        bronzeStatus: 'done',
      })
    } catch (err) {
      setFileState(id, {
        status: 'error',
        phase: 'error',
        progress: 0,
        detail: undefined,
        error: err instanceof Error ? err.message : 'The saved file could not be loaded.',
      })
      throw err
    } finally {
      restoringFileIdsRef.current.delete(id)
    }
  }, [setFileState, t.ingestWaitingParser])

  /** Restore a workspace-linked archive that has no local file card yet. */
  const restoreArchivedBatch = useCallback(async (batch: {
    id: string
    name: string
    periodStart?: string
    periodEnd?: string
    size?: number
  }): Promise<void> => {
    const existing = (fileMetasRef.current ?? []).find((meta) => meta.bronzeBatchId === batch.id)
    if (existing) return restoreArchivedFile(existing.id)
    if (restoringBatchIdsRef.current.has(batch.id)) return

    restoringBatchIdsRef.current.add(batch.id)
    try {
      const { downloadBronzeCsvText } = await import('@/lib/sos/bronzeDownload')
      const data = await downloadBronzeCsvText(batch.id)
      if (!data) throw new Error('The saved archive is empty.')
      // Recheck after the async download to prevent duplicate file cards.
      const current = (fileMetasRef.current ?? []).find((meta) => meta.bronzeBatchId === batch.id)
      if (current) return restoreArchivedFile(current.id)
      const id = crypto.randomUUID()
      const meta: UploadedFileMeta = {
        id,
        name: batch.name,
        size: batch.size ?? new Blob([data]).size,
        type,
        uploadedAt: new Date().toISOString(),
        bronzeBatchId: batch.id,
        periodStart: batch.periodStart,
        periodEnd: batch.periodEnd,
      }
      bronzeStartedRef.current.add(id)
      setFileMetas((prev) =>
        (prev ?? []).some((file) => file.bronzeBatchId === batch.id) ? prev : [...(prev ?? []), meta],
      )
      setFileDataMap((prev) => ({ ...prev, [id]: data }))
      setFileState(id, {
        status: 'processing',
        phase: 'parsing',
        progress: 0,
        detail: t.ingestWaitingParser,
        bronzeStatus: 'done',
      })
    } finally {
      restoringBatchIdsRef.current.delete(batch.id)
    }
  }, [restoreArchivedFile, setFileMetas, setFileState, t.ingestWaitingParser, type])

  const processAndStore = useCallback(
    async (rawFile: File, id: string): Promise<{ data: string }> => {
      setFileState(id, {
        status: 'uploading',
        phase: 'reading',
        progress: 0,
        bytesRead: 0,
        bytesTotal: rawFile.size,
        detail: interpolate(t.ingestReading, {
          read: formatBytes(0),
          total: formatBytes(rawFile.size),
        }),
      })

      const buffer = await readFileWithProgress(rawFile, (loaded, total) => {
        setFileState(id, {
          status: 'uploading',
          phase: 'reading',
          progress: total > 0 ? Math.round((loaded / total) * 100) : 0,
          bytesRead: loaded,
          bytesTotal: total,
          detail: interpolate(t.ingestReading, {
            read: formatBytes(loaded),
            total: formatBytes(total),
          }),
        })
      })

      setFileState(id, {
        status: 'uploading',
        phase: 'decoding',
        progress: 100,
        detail: t.ingestDecoding,
      })

      const firstBytes = new Uint8Array(buffer, 0, Math.min(2, buffer.byteLength))
      let data: string
      if (firstBytes[0] === 0xFF && firstBytes[1] === 0xFE) {
        data = new TextDecoder('utf-16le').decode(buffer)
      } else if (firstBytes[0] === 0xFE && firstBytes[1] === 0xFF) {
        data = new TextDecoder('utf-16be').decode(buffer)
      } else {
        data = new TextDecoder('utf-8').decode(buffer)
      }

      if (type === 'darkmerch' && rawFile.name.toLowerCase().endsWith('.xlsx')) {
        setFileState(id, {
          status: 'uploading',
          phase: 'decoding',
          detail: t.ingestConverting,
        })
        const { darkmerchXLSXtoCSV } = await import('@/lib/sos/ingest/darkmerch-parser')
        const csvText = await darkmerchXLSXtoCSV(buffer)
        if (csvText) {
          data = csvText
        } else {
          toast.warning(t.xlsxConvertWarning.replace('{filename}', rawFile.name))
        }
      }

      setFileDataMap((prev) => ({ ...prev, [id]: data }))
      setFileState(id, {
        status: 'processing',
        phase: 'parsing',
        progress: 0,
        detail: t.ingestWaitingParser,
      })

      return { data }
    },
    [type, setFileState, t],
  )

  const applyParseResult = useCallback(
    (stats: SosParseDoneStats) => {
      const id = stats.fileId
      if (!(fileMetasRef.current ?? []).some((file) => file.id === id)) return

      setFileMetas((current) =>
        (current ?? []).map((file) =>
          file.id === id
            ? {
                ...file,
                rowsParsed: stats.rowsParsed,
                rowsSkipped: stats.rowsSkipped,
                uniqueArtistsCount: stats.uniqueArtistsCount,
                emptyCurrencyRows: stats.emptyCurrencyRows,
                skipReasons: stats.skipReasons,
                periodStart: stats.periodStart,
                periodEnd: stats.periodEnd,
              }
            : file,
        ),
      )
      setFileState(id, {
        status: 'done',
        phase: 'done',
        progress: 100,
        processedRows: stats.rowsParsed,
        totalRows: stats.rowsParsed + stats.rowsSkipped,
        detail: `${formatInteger(stats.rowsParsed)} rows`,
      })

      if (bronzeStartedRef.current.has(id)) return
      bronzeStartedRef.current.add(id)
      void archiveFile(id, { periodStart: stats.periodStart, periodEnd: stats.periodEnd })
    },
    [archiveFile, setFileMetas, setFileState],
  )

  const addFiles = useCallback(
    async (rawFiles: File[]) => {
      if (rawFiles.length === 0) return

      const ids = rawFiles.map(() => crypto.randomUUID())

      // Optimistically show placeholders while reading/parsing.
      const placeholders: UploadedFileMeta[] = rawFiles.map((f, i) => ({
        id: ids[i],
        bronzeOperationId: crypto.randomUUID(),
        name: f.name,
        size: f.size,
        type,
        uploadedAt: new Date().toISOString(),
      }))

      setFileMetas(current => [...(current ?? []), ...placeholders])

      const results = await Promise.allSettled(
        rawFiles.map(async (rawFile, i) => {
          const id = ids[i]
          try {
            const { data } = await processAndStore(rawFile, id)
            const uploadedFile: UploadedFile = {
              id,
              name: rawFile.name,
              size: rawFile.size,
              type,
              data,
              uploadedAt: new Date().toISOString(),
            }
            callbacks?.onFileAdded?.(uploadedFile, 0, 0, 0)
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to process file'
            setFileState(id, { status: 'error', progress: 0, error: message })
            toast.error(t.fileProcessFailed.replace('{filename}', rawFile.name), {
              description: explainSosError(message, t),
            })
            throw err
          }
        })
      )

      const succeeded = results.filter(r => r.status === 'fulfilled').length
      const failed = results.filter(r => r.status === 'rejected').length

      if (succeeded > 0) {
        toast.success(
          succeeded === 1
            ? t.fileUploadSuccess.replace('{filename}', rawFiles[0].name)
            : t.filesUploadSuccess.replace('{count}', String(succeeded))
        )
      }
      if (failed > 0) {
        toast.error(t.filesUploadFailed.replace('{count}', String(failed)))
      }
    },
    [type, processAndStore, setFileMetas, setFileState, callbacks, t]
  )

  const removeFile = useCallback(
    (id: string) => {
      setFileMetas(current => (current ?? []).filter(f => f.id !== id))
      setFileDataMap(prev => {
        const next = { ...prev }
        delete next[id]
        return next
      })
      removeFileState(id)
      bronzeStartedRef.current.delete(id)
      restoringFileIdsRef.current.delete(id)
      callbacks?.onFileRemoved?.(id)
      toast.info(t.fileRemoved)
    },
    [setFileMetas, removeFileState, callbacks, t.fileRemoved]
  )

  const replaceFile = useCallback(
    async (id: string, rawFile: File) => {
      // Update metadata immediately so the user sees the new name.
      setFileMetas(current =>
        (current ?? []).map(f =>
          f.id === id
          ? {
              ...f,
              name: rawFile.name,
              size: rawFile.size,
              bronzeBatchId: undefined,
              bronzeOperationId: crypto.randomUUID(),
            }
            : f
        )
      )

      try {
        bronzeStartedRef.current.delete(id)
        restoringFileIdsRef.current.delete(id)
        const { data } = await processAndStore(rawFile, id)
        const uploadedFile: UploadedFile = {
          id,
          name: rawFile.name,
          size: rawFile.size,
          type,
          data,
          uploadedAt: new Date().toISOString(),
        }
        callbacks?.onFileAdded?.(uploadedFile, 0, 0, 0)
        toast.success(t.fileReplaceSuccess.replace('{filename}', rawFile.name))
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to process file'
        setFileState(id, { status: 'error', progress: 0, error: message })
        toast.error(t.fileReplaceFailed, { description: explainSosError(message, t) })
      }
    },
    [processAndStore, setFileMetas, setFileState, type, callbacks, t]
  )

  /** Removes every file and clears all in-memory state for this manager. */
  const clearAll = useCallback(() => {
    setFileMetas([])
    setFileDataMap({})
    setFileStates({})
    bronzeStartedRef.current.clear()
    restoringFileIdsRef.current.clear()
    restoringBatchIdsRef.current.clear()
  }, [setFileMetas])

  return {
    files,
    fileStates,
    addFiles,
    removeFile,
    replaceFile,
    retryArchive,
    restoreArchivedFile,
    restoreArchivedBatch,
    clearAll,
    patchFileState: setFileState,
    applyParseResult,
  }
}
