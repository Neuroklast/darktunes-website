'use client'
/**
 * Reusable image upload button for admin forms.
 * Uploads the selected file to /api/upload (requires admin/editor auth)
 * and calls onUploaded with the resulting public URL.
 * Shows a real upload-progress bar via XHR.
 * Files above the server-proxy limit (Vercel body cap) are rejected before
 * sending; failures show a specific message (file, cause, next step).
 */

import { useRef, useState } from 'react'
import { useMemo } from 'react'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { UploadSimple, CheckCircle } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import {
  formatMegabytes,
  SERVER_UPLOAD_MAX_BYTES,
  ServerUploadError,
  uploadViaServer,
} from '@/lib/uploads/adminServerUpload'

interface ImageUploadButtonProps {
  /** Called with the R2 public URL once the upload succeeds. */
  onUploaded: (url: string) => void
  /** Additional CSS class names for the button wrapper. */
  className?: string
  /** Accessible label for the button. Defaults to "Upload image". */
  label?: string
  /** Upload endpoint. Defaults to /api/upload (admin). */
  endpoint?: string
  /** When provided, the uploaded asset is automatically assigned to this artist and placed in their folder. */
  artistId?: string
}

export function ImageUploadButton({
  onUploaded,
  className,
  label = 'Upload image',
  endpoint = '/api/upload',
  artistId,
}: ImageUploadButtonProps) {
  const tToast = useTranslations('admin.toast')


  const tErrors = useTranslations('errors')
  const supabase = useMemo(() => createBrowserSupabaseClient(), [])
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)

  const isUploading = uploadProgress !== null && uploadProgress < 100

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {

    const file = e.target.files?.[0]
    if (!file) return

    setUploadProgress(0)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new ServerUploadError(tErrors('AUTH_REQUIRED'))

      const data = await uploadViaServer<{ publicUrl: string }>({
        file,
        token: session.access_token,
        t: tErrors,
        endpoint,
        fields: { artistId },
        onProgress: setUploadProgress,
      })
      setUploadProgress(100)
      onUploaded(data.publicUrl)
      toast.success(tToast('image_uploaded'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      // Keep progress bar visible briefly at 100% then hide
      setTimeout(() => setUploadProgress(null), 800)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className={`flex flex-col gap-1 ${className ?? ''}`}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        aria-hidden="true"
        onChange={handleFileChange}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5 shrink-0"
        disabled={isUploading}
        onClick={() => inputRef.current?.click()}
        title={label}
      >
        {uploadProgress === 100 ? (
          <CheckCircle size={14} className="text-green-500" aria-hidden="true" />
        ) : (
          <UploadSimple size={14} className={isUploading ? 'animate-bounce' : ''} aria-hidden="true" />
        )}
        {isUploading ? `${uploadProgress}%` : label}
      </Button>
      {uploadProgress !== null && (
        <Progress
          value={uploadProgress}
          className="h-1 w-full"
          aria-label="Upload progress"
        />
      )}
      <p className="text-[11px] text-muted-foreground leading-tight">
        Max {formatMegabytes(SERVER_UPLOAD_MAX_BYTES)} per file
      </p>
    </div>
  )
}

