import { afterEach, describe, expect, it, vi } from 'vitest'
import { compressImage } from './imageResizer'

interface FakeCanvas {
  width: number
  height: number
  drawImage: ReturnType<typeof vi.fn>
  getContext: () => { drawImage: ReturnType<typeof vi.fn> }
  toBlob: (cb: (blob: Blob | null) => void, type: string, quality: number) => void
}

function fakeCanvas(blobSize: (quality: number) => number): FakeCanvas {
  const drawImage = vi.fn()
  return {
    width: 0,
    height: 0,
    drawImage,
    getContext: () => ({ drawImage }),
    toBlob: (cb, type, quality) => cb(new Blob([new Uint8Array(blobSize(quality))], { type })),
  }
}

const MB = 1024 * 1024

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('compressImage last-resort fallback', () => {
  it('downscales from the drawn pixels instead of a cleared canvas', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 2048, height: 2048, close: vi.fn() }))
    // First canvas never fits the budget; the half-size canvas does.
    const main = fakeCanvas(() => 3 * MB)
    const half = fakeCanvas(() => 1 * MB)
    const canvases = [main, half]
    const realCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) =>
      tag === 'canvas' ? canvases.shift() : realCreate(tag)) as typeof document.createElement)

    const input = new File([new Uint8Array(10)], 'photo.jpg', { type: 'image/jpeg' })
    Object.defineProperty(input, 'size', { value: 8 * MB })

    const result = await compressImage(input, { maxSizeBytes: 2 * MB })

    // Source canvas keeps its size (resizing would wipe it) and is the draw source.
    expect(main.width).toBe(2048)
    expect(half.drawImage).toHaveBeenCalledWith(main, 0, 0, 1024, 1024)
    expect(result.size).toBe(1 * MB)
    expect(result.name).toBe('photo.jpg')
  })
})
