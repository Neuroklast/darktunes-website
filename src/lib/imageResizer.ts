/**
 * src/lib/imageResizer.ts
 *
 * Client-side image compression using the Canvas API.
 * No external dependencies — uses browser-native APIs only.
 *
 * Usage:
 *   const compressed = await compressImage(file, { maxSizeBytes: 5 * 1024 * 1024 })
 *   // compressed is a File ≤ maxSizeBytes, or the original if it was already small enough.
 */

export interface CompressImageOptions {
  /** Target maximum file size in bytes. Defaults to 5 MB. */
  maxSizeBytes?: number
  /** Maximum width/height in pixels. The image is scaled proportionally. Defaults to 2048. */
  maxDimension?: number
  /** Initial JPEG quality (0–1). The compressor iterates downward to meet the size budget. */
  initialQuality?: number
}

/**
 * Compresses an image File to fit within the given byte budget.
 * Returns the original File if it is already within the limit and dimensions.
 * Falls back gracefully — if the canvas API is unavailable (SSR), returns the original file.
 */
export async function compressImage(
  file: File,
  options: CompressImageOptions = {},
): Promise<File> {
  const {
    maxSizeBytes = 5 * 1024 * 1024,
    maxDimension = 2048,
    initialQuality = 0.88,
  } = options

  // Already within budget — no work needed
  if (file.size <= maxSizeBytes) return file

  // Guard against SSR environments (canvas not available)
  if (typeof document === 'undefined') return file

  const bitmap = await createImageBitmap(file)
  const { width: origW, height: origH } = bitmap

  // Scale down if larger than maxDimension
  const scale = Math.min(1, maxDimension / Math.max(origW, origH))
  const targetW = Math.round(origW * scale)
  const targetH = Math.round(origH * scale)

  const canvas = document.createElement('canvas')
  canvas.width = targetW
  canvas.height = targetH

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    return file
  }
  ctx.drawImage(bitmap, 0, 0, targetW, targetH)
  bitmap.close()

  // Determine output format: prefer JPEG for photos, keep PNG only for explicit PNGs
  const isTransparent = file.type === 'image/png' || file.type === 'image/webp'
  const outputType = isTransparent ? 'image/webp' : 'image/jpeg'

  // Iteratively lower quality until the blob fits within maxSizeBytes
  let quality = initialQuality
  let blob: Blob | null = null

  while (quality > 0.1) {
    blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, outputType, quality),
    )
    if (!blob || blob.size <= maxSizeBytes) break
    quality -= 0.1
  }

  if (!blob || blob.size > maxSizeBytes) {
    // Last resort: halve the dimensions once more and try at quality 0.7.
    // Draw into a second canvas — resizing the source canvas would clear its pixels.
    const half = document.createElement('canvas')
    half.width = Math.round(targetW / 2)
    half.height = Math.round(targetH / 2)
    const ctx2 = half.getContext('2d')
    if (ctx2) {
      ctx2.drawImage(canvas, 0, 0, half.width, half.height)
      blob = await new Promise<Blob | null>((resolve) =>
        half.toBlob(resolve, outputType, 0.7),
      )
    }
  }

  if (!blob) return file

  const ext = outputType === 'image/webp' ? '.webp' : '.jpg'
  const baseName = file.name.replace(/\.[^.]+$/, '')
  return new File([blob], `${baseName}${ext}`, { type: outputType })
}

/** Format a byte count as a human-readable string (e.g. "4.8 MB"). */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
