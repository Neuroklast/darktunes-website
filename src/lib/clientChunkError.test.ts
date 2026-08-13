import { describe, expect, it } from 'vitest'
import {
  hasAttemptedChunkReload,
  isChunkLoadError,
  shouldReloadForChunkError,
} from './clientChunkError'

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial }
  return {
    getItem: (key: string) => data[key] ?? null,
    setItem: (key: string, value: string) => {
      data[key] = value
    },
  }
}

describe('clientChunkError', () => {
  it('detects webpack and dynamic-import chunk failures', () => {
    expect(isChunkLoadError({ name: 'ChunkLoadError', message: 'boom' })).toBe(true)
    expect(
      isChunkLoadError({ name: 'Error', message: 'Failed to fetch dynamically imported module' }),
    ).toBe(true)
    expect(isChunkLoadError({ name: 'TypeError', message: 'artists.name' })).toBe(false)
  })

  it('reloads once per fingerprint and then shows the error UI', () => {
    const storage = memoryStorage()
    const error = { name: 'ChunkLoadError', message: 'Loading chunk 42 failed' }
    expect(shouldReloadForChunkError(error, storage)).toBe(true)
    expect(shouldReloadForChunkError(error, storage)).toBe(false)
    expect(
      shouldReloadForChunkError({ name: 'ChunkLoadError', message: 'Loading chunk 99 failed' }, storage),
    ).toBe(true)
    expect(shouldReloadForChunkError(error, null)).toBe(false)
    expect(hasAttemptedChunkReload(error, storage)).toBe(true)
  })
})
