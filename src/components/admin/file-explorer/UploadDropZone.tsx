'use client'

import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import { UploadSimple } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { uploadFiles } from './upload'

export interface UploadDropZoneRef {
  openPicker: () => void
  uploadToFolder: (files: File[], folderId: string | null) => Promise<void>
}

interface UploadDropZoneProps {
  folderId: string | null
  artistId?: string | null
  token: string | null
  uploadEndpoint?: string
  optimizeImages?: boolean
  onUploadComplete: () => void
  children: ReactNode
}

export const UploadDropZone = forwardRef<UploadDropZoneRef, UploadDropZoneProps>(function UploadDropZone(
  { folderId, artistId = null, token, uploadEndpoint = '/api/upload', optimizeImages = true, onUploadComplete, children },
  ref,
) {
  const tToast = useTranslations('admin.toast')


  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({})

  const handleUpload = async (files: File[], targetFolderId: string | null) => {

    if (!token) {
      toast.error(tToast('sign_in_again_before_upload'))
      return
    }

    try {
      await uploadFiles({
        files,
        token,
        folderId: targetFolderId,
        artistId,
        endpoint: uploadEndpoint,
        optimize: optimizeImages,
        onProgress: (fileKey, progress) => {
          setUploadProgress((previous) => ({ ...previous, [fileKey]: progress }))
        },
      })
      toast.success(`${files.length} file${files.length > 1 ? 's' : ''} uploaded`)
      onUploadComplete()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed')
    } finally {
      setIsDragging(false)
      window.setTimeout(() => setUploadProgress({}), 800)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  useImperativeHandle(ref, () => ({
    openPicker: () => inputRef.current?.click(),
    uploadToFolder: async (files, nextFolderId) => handleUpload(files, nextFolderId),
  }))

  return (
    <div
      className={cn('relative flex flex-1 flex-col overflow-hidden', isDragging && 'ring-2 ring-primary ring-inset')}
      onDragOver={(event) => {
        event.preventDefault()
        setIsDragging(true)
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node)) return
        setIsDragging(false)
      }}
      onDrop={(event) => {
        event.preventDefault()
        const files = Array.from(event.dataTransfer.files)
        void handleUpload(files, folderId)
      }}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? [])
          void handleUpload(files, folderId)
        }}
      />

      {Object.keys(uploadProgress).length > 0 && (
        <div className="border-b border-border bg-card/80 px-4 py-3">
          <div className="space-y-2">
            {Object.entries(uploadProgress).map(([fileName, progress]) => (
              <div key={fileName} className="space-y-1">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate">{fileName}</span>
                  <span className="text-muted-foreground">{progress}%</span>
                </div>
                <Progress value={progress} aria-label={`${fileName} upload progress`} />
              </div>
            ))}
          </div>
        </div>
      )}

      {children}

      {isDragging && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="rounded-xl border border-primary border-dashed bg-card px-6 py-8 text-center">
            <UploadSimple size={28} className="mx-auto mb-2 text-primary" aria-hidden="true" />
            <p className="font-medium">Drop files here to upload</p>
            <p className="text-sm text-muted-foreground">Files will be added to the current folder.</p>
          </div>
        </div>
      )}
    </div>
  )
})
