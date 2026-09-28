import type { Asset } from '@/types'
import {
  uploadViaServer,
  type ServerUploadTranslator,
} from '@/lib/uploads/adminServerUpload'

export interface UploadedAssetResponse {
  duplicate: boolean
  asset: Asset
  publicUrl: string
  r2Key: string
  filename: string
  mimeType: string
  sizeBytes: number
}

interface UploadOptions {
  files: File[]
  token: string
  folderId: string | null
  artistId?: string | null
  endpoint?: string
  optimize?: boolean
  /** `useTranslations('errors')` — failures reject with a specific, translated message. */
  t: ServerUploadTranslator
  onProgress?: (fileKey: string, progress: number) => void
}

export async function uploadFiles({ files, token, folderId, artistId = null, endpoint = '/api/upload', optimize = true, t, onProgress }: UploadOptions): Promise<UploadedAssetResponse[]> {
  const uploads: UploadedAssetResponse[] = []
  for (const file of files) {
    const result = await uploadViaServer<UploadedAssetResponse>({
      file,
      token,
      t,
      endpoint,
      fields: { optimize: optimize ? '1' : '0', folderId, artistId },
      onProgress: (progress) => onProgress?.(file.name, progress),
    })
    uploads.push(result)
  }
  return uploads
}
