const RELOAD_FLAG_PREFIX = 'dt-chunk-reload:'

export function isChunkLoadError(error: Pick<Error, 'name' | 'message'>): boolean {
  return (
    error.name === 'ChunkLoadError' ||
    error.message.includes('Loading chunk') ||
    error.message.includes('Failed to fetch dynamically imported module')
  )
}

export function chunkErrorFingerprint(error: Pick<Error, 'name' | 'message'>): string {
  return `${error.name}:${error.message.slice(0, 120)}`
}

export function hasAttemptedChunkReload(
  error: Pick<Error, 'name' | 'message'>,
  storage: Pick<Storage, 'getItem'> | null,
): boolean {
  if (!storage) return false
  return storage.getItem(`${RELOAD_FLAG_PREFIX}${chunkErrorFingerprint(error)}`) === '1'
}

export function markChunkReloadAttempt(
  error: Pick<Error, 'name' | 'message'>,
  storage: Pick<Storage, 'setItem'> | null,
): void {
  if (!storage) return
  storage.setItem(`${RELOAD_FLAG_PREFIX}${chunkErrorFingerprint(error)}`, '1')
}

export function shouldReloadForChunkError(
  error: Pick<Error, 'name' | 'message'>,
  storage: Pick<Storage, 'getItem' | 'setItem'> | null,
): boolean {
  if (!isChunkLoadError(error) || !storage) return false
  if (hasAttemptedChunkReload(error, storage)) return false
  markChunkReloadAttempt(error, storage)
  return true
}
