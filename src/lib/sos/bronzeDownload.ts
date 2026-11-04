/**
 * Client helper: restore only a verified completed Bronze import. Legacy
 * uploads without a confirmed hash must not be sent to presign-download,
 * which correctly rejects them with HTTP 409.
 */

interface ArchiveBatchMeta {
  id: string
  status: string
  fileHash?: string | null
}

export class BronzeArchiveUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BronzeArchiveUnavailableError'
  }
}

async function parseApiError(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => null)
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>
    if (typeof record.error === 'string') return record.error
    if (typeof record.detail === 'string') return record.detail
  }
  return response.statusText || `HTTP ${response.status}`
}

export async function downloadBronzeCsvText(batchId: string): Promise<string> {
  // Preflight metadata instead of probing an unfinished archive with a 409 GET.
  const metaRes = await fetch(`/api/admin/sos/import-batches/${batchId}`)
  if (!metaRes.ok) throw new Error(await parseApiError(metaRes))
  const metadata = (await metaRes.json()) as { batch?: ArchiveBatchMeta }
  if (metadata.batch?.id !== batchId) {
    throw new BronzeArchiveUnavailableError('The saved archive could not be found.')
  }
  if (metadata.batch.status !== 'completed' || !metadata.batch.fileHash) {
    throw new BronzeArchiveUnavailableError(
      'This import was never fully archived. Select the original CSV file to upload it again.',
    )
  }

  const presignRes = await fetch(`/api/admin/sos/import-batches/${batchId}/presign-download`)
  if (!presignRes.ok) {
    if (presignRes.status === 409) {
      throw new BronzeArchiveUnavailableError(
        'The archive is not confirmed. Select the original CSV file to upload it again.',
      )
    }
    throw new Error(await parseApiError(presignRes))
  }
  const { downloadUrl } = (await presignRes.json()) as { downloadUrl?: string }
  if (!downloadUrl) throw new Error('The archive download link is missing.')

  const csvRes = await fetch(downloadUrl)
  if (!csvRes.ok) throw new Error(`Archive download failed (${csvRes.status}).`)
  return csvRes.text()
}
