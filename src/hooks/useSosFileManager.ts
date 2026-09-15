'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { useKV } from '@/hooks/useLocalKV'
import { toast } from 'sonner'
import { useMergedAccountingLabels } from '@/lib/i18n/accountingFallbacks'
import { interpolate } from '@/lib/i18n/interpolate'
import { extractPeriodBounds, uploadBronzeDistributorCsv } from '@/lib/sos/bronzeUpload'
import { formatBytes, formatInteger, type SosParseDoneStats } from '@/lib/sos/ingestProgress'
import { readFileWithProgress } from '@/lib/sos/readFileWithProgress'
import type { FileProcessingState, UploadedFile } from '@/lib/sos/types'

type FileType = 'believe' | 'bandcamp' | 'shopify' | 'printful' | 'darkmerch'

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
  fileUploadSuccess: '"{filename}" uploaded successfully',
  filesUploadSuccess: '{count} file(s) uploaded successfully',
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
} as const

export function useFileManager(type: FileType, callbacks?: FileEventCallbacks) {
  const t = useMergedAccountingLabels(FILE_FALLBACK)
  // Metadata persisted in IndexedDB (no raw CSV data).
  const [fileMetas, setFileMetas] = useKV<UploadedFileMeta[]>(`${type}-files`, [])
  // Raw CSV strings kept in memory only — lost on page reload, no storage limit issues.
  const [fileDataMap, setFileDataMap] = useState<Record<string, string>>({})
  const [fileStates, setFileStates] = useState<Record<string, FileProcessingState>>({})
  const bronzeStartedRef = useRef(new Set<string>())
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
      const data = fileDataRef.current[id]
      const meta = (fileMetasRef.current ?? []).find((file) => file.id === id)
      if (!data || !meta) return

      const bounds = extractPeriodBounds(
        [stats.periodStart, stats.periodEnd].filter(Boolean),
      )
      void (async () => {
        setFileState(id, {
          bronzeStatus: 'uploading',
          phase: 'archiving',
          detail: t.ingestArchiving,
        })
        const bronze = await uploadBronzeDistributorCsv({
          distributor: type,
          filename: meta.name,
          uploadBody: data,
          rowCount: stats.rowsParsed,
          periodStart: bounds.periodStart,
          periodEnd: bounds.periodEnd,
        })
        if (bronze.ok) {
          setFileMetas((current) =>
            (current ?? []).map((file) =>
              file.id === id ? { ...file, bronzeBatchId: bronze.batchId } : file,
            ),
          )
          setFileState(id, { bronzeStatus: 'done', bronzeError: undefined, phase: 'done' })
        } else {
          setFileState(id, { bronzeStatus: 'error', bronzeError: bronze.message, phase: 'done' })
        }
      })()
    },
    [setFileMetas, setFileState, t.ingestArchiving, type],
  )

  const addFiles = useCallback(
    async (rawFiles: File[]) => {
      if (rawFiles.length === 0) return

      const ids = rawFiles.map(() => crypto.randomUUID())

      // Optimistically show placeholders while reading/parsing.
      const placeholders: UploadedFileMeta[] = rawFiles.map((f, i) => ({
        id: ids[i],
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
            toast.error(t.fileProcessFailed.replace('{filename}', rawFile.name), { description: message })
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
          f.id === id ? { ...f, name: rawFile.name, size: rawFile.size } : f
        )
      )

      try {
        bronzeStartedRef.current.delete(id)
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
        toast.error(t.fileReplaceFailed, { description: message })
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
  }, [setFileMetas])

  return {
    files,
    fileStates,
    addFiles,
    removeFile,
    replaceFile,
    clearAll,
    patchFileState: setFileState,
    applyParseResult,
  }
}
