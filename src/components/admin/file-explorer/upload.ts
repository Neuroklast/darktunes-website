import type { Asset } from '@/types'

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
  onProgress?: (fileKey: string, progress: number) => void
}

function uploadSingleFile(
  file: File,
  token: string,
  folderId: string | null,
  artistId: string | null,
  endpoint: string,
  optimize: boolean,
  onProgress?: (progress: number) => void,
): Promise<UploadedAssetResponse> {
  return new Promise((resolve, reject) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('optimize', optimize ? '1' : '0')
    if (folderId) formData.append('folderId', folderId)
    if (artistId) formData.append('artistId', artistId)

    const xhr = new XMLHttpRequest()
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        onProgress?.(Math.round((event.loaded / event.total) * 100))
      }
    })
    xhr.addEventListener('load', () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(xhr.responseText || `HTTP ${xhr.status}`))
        return
      }
      try {
        resolve(JSON.parse(xhr.responseText) as UploadedAssetResponse)
      } catch {
        reject(new Error('Invalid upload response'))
      }
    })
    xhr.addEventListener('error', () => reject(new Error('Network error')))
    xhr.open('POST', endpoint)
    xhr.setRequestHeader('Authorization', 'Bearer ' + token)
    xhr.send(formData)
  })
}

export async function uploadFiles({ files, token, folderId, artistId = null, endpoint = '/api/upload', optimize = true, onProgress }: UploadOptions): Promise<UploadedAssetResponse[]> {
  const uploads: UploadedAssetResponse[] = []
  for (const file of files) {
    const result = await uploadSingleFile(file, token, folderId, artistId, endpoint, optimize, (progress) => onProgress?.(file.name, progress))
    uploads.push(result)
  }
  return uploads
}
