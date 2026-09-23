import { extname } from 'path'
import sharp from 'sharp'

const IMAGE_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])
const SKIP_MIME = new Set(['image/gif', 'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon'])
const MIN_SAVINGS_RATIO = 0.98
const WEBP_QUALITY = 82
const JPEG_QUALITY = 85

export interface OptimizeImageInput {
  buffer: Buffer
  mimeType: string
  filename: string
  pressApproved?: boolean
}

export interface OptimizeImageResult {
  buffer: Buffer
  mimeType: string
  filename: string
  skipped: boolean
  reason?: 'not_image' | 'animated' | 'no_savings' | 'error'
}

export function parseOptimizeFlag(value: FormDataEntryValue | null): boolean {
  if (value == null) return true
  if (typeof value !== 'string') return true
  const normalized = value.trim().toLowerCase()
  return normalized !== '0' && normalized !== 'false' && normalized !== 'off' && normalized !== 'no'
}

function replaceExtension(filename: string, nextExt: string): string {
  const base = filename.replace(/\.[^.]+$/, '')
  return `${base}${nextExt}`
}

function normalizeMime(mimeType: string): string {
  const base = mimeType.split(';')[0]?.trim().toLowerCase() ?? ''
  if (base === 'image/jpg') return 'image/jpeg'
  return base
}

export async function optimizeImage(input: OptimizeImageInput): Promise<OptimizeImageResult> {
  const mimeType = normalizeMime(input.mimeType)
  if (SKIP_MIME.has(mimeType) || !IMAGE_MIME.has(mimeType)) {
    return { buffer: input.buffer, mimeType: input.mimeType, filename: input.filename, skipped: true, reason: 'not_image' }
  }

  try {
    const pipeline = sharp(input.buffer, { failOn: 'none' }).rotate()
    const metadata = await pipeline.metadata()
    if ((metadata.pages ?? 1) > 1) {
      return { buffer: input.buffer, mimeType, filename: input.filename, skipped: true, reason: 'animated' }
    }

    const hasAlpha = metadata.hasAlpha === true
    const keepOriginalFormat = input.pressApproved === true || hasAlpha

    let output: Buffer
    let outputMime: string
    let outputFilename = input.filename
    const encode = pipeline.clone()

    if (keepOriginalFormat) {
      if (mimeType === 'image/png' || hasAlpha) {
        output = await encode.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer()
        outputMime = 'image/png'
      } else if (mimeType === 'image/webp') {
        output = await encode.webp({ quality: WEBP_QUALITY, effort: 4 }).toBuffer()
        outputMime = 'image/webp'
      } else {
        output = await encode.jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer()
        outputMime = 'image/jpeg'
      }
    } else {
      output = await encode.webp({ quality: WEBP_QUALITY, effort: 4 }).toBuffer()
      outputMime = 'image/webp'
      if (extname(input.filename).toLowerCase() !== '.webp') {
        outputFilename = replaceExtension(input.filename, '.webp')
      }
    }

    if (output.length >= Math.floor(input.buffer.length * MIN_SAVINGS_RATIO)) {
      return { buffer: input.buffer, mimeType, filename: input.filename, skipped: true, reason: 'no_savings' }
    }

    return { buffer: output, mimeType: outputMime, filename: outputFilename, skipped: false }
  } catch {
    return { buffer: input.buffer, mimeType, filename: input.filename, skipped: true, reason: 'error' }
  }
}
