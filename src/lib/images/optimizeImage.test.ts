import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { optimizeImage, parseOptimizeFlag } from '@/lib/images/optimizeImage'

describe('parseOptimizeFlag', () => {
  it('defaults to true', () => {
    expect(parseOptimizeFlag(null)).toBe(true)
  })

  it('accepts explicit off values', () => {
    expect(parseOptimizeFlag('0')).toBe(false)
    expect(parseOptimizeFlag('false')).toBe(false)
    expect(parseOptimizeFlag('off')).toBe(false)
  })
})

describe('optimizeImage', () => {
  it('converts a JPEG photo to a smaller WebP without resizing', async () => {
    const buffer = await sharp({
      create: { width: 64, height: 48, channels: 3, background: { r: 12, g: 34, b: 56 } },
    })
      .jpeg({ quality: 100 })
      .toBuffer()

    const result = await optimizeImage({
      buffer,
      mimeType: 'image/jpeg',
      filename: 'photo.jpg',
    })

    expect(result.skipped).toBe(false)
    expect(result.mimeType).toBe('image/webp')
    expect(result.buffer.length).toBeLessThan(buffer.length)
    const meta = await sharp(result.buffer).metadata()
    expect(meta.width).toBe(64)
    expect(meta.height).toBe(48)
  })

  it('keeps transparent PNG as PNG', async () => {
    const buffer = await sharp({
      create: { width: 16, height: 16, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0.4 } },
    })
      .png()
      .toBuffer()

    const result = await optimizeImage({
      buffer,
      mimeType: 'image/png',
      filename: 'logo.png',
    })

    expect(result.mimeType).toBe('image/png')
  })

  it('keeps press-approved JPEG as JPEG', async () => {
    const buffer = await sharp({
      create: { width: 32, height: 32, channels: 3, background: { r: 200, g: 10, b: 10 } },
    })
      .jpeg({ quality: 100 })
      .toBuffer()

    const result = await optimizeImage({
      buffer,
      mimeType: 'image/jpeg',
      filename: 'press.jpg',
      pressApproved: true,
    })

    expect(result.mimeType).toBe('image/jpeg')
  })

  it('skips non-images', async () => {
    const buffer = Buffer.from('not an image')
    const result = await optimizeImage({
      buffer,
      mimeType: 'application/pdf',
      filename: 'doc.pdf',
    })
    expect(result.skipped).toBe(true)
    expect(result.reason).toBe('not_image')
  })
})
