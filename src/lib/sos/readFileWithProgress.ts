/**
 * Read a local File as ArrayBuffer with byte-level progress (FileReader).
 * Local files may jump 0→100% on some browsers; callers still get a reading phase.
 */
export function readFileWithProgress(
  file: File,
  onProgress?: (loaded: number, total: number) => void,
): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onprogress = (event) => {
      const total = event.lengthComputable ? event.total : file.size
      onProgress?.(event.loaded, total || file.size)
    }
    reader.onload = () => {
      const result = reader.result
      if (!(result instanceof ArrayBuffer)) {
        reject(new Error('File could not be read as binary'))
        return
      }
      onProgress?.(result.byteLength, result.byteLength)
      resolve(result)
    }
    reader.onerror = () => {
      reject(reader.error ?? new Error('Failed to read file'))
    }
    reader.readAsArrayBuffer(file)
  })
}
