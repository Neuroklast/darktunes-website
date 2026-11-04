import { afterEach, describe, expect, it, vi } from 'vitest'
import { BronzeArchiveUnavailableError, downloadBronzeCsvText } from './bronzeDownload'

const batchId = '1c660619-3329-46d2-8671-957674cc5ba0'
const metadata = (status: string, fileHash?: string) =>
  new Response(JSON.stringify({ batch: { id: batchId, status, fileHash } }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })

describe('downloadBronzeCsvText', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('does not request presign-download for an unfinished historical upload', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => metadata('uploaded'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(downloadBronzeCsvText(batchId)).rejects.toBeInstanceOf(BronzeArchiveUnavailableError)
    await expect(downloadBronzeCsvText(batchId)).rejects.toThrow(/original CSV file/i)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenCalledWith(`/api/admin/sos/import-batches/${batchId}`)
  })

  it('downloads a confirmed archive without creating another import', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(metadata('completed', 'a'.repeat(64)))
      .mockResolvedValueOnce(new Response(JSON.stringify({ downloadUrl: 'https://r2.example/signed' })))
      .mockResolvedValueOnce(new Response('Artist,Sale\\nReaper,1'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(downloadBronzeCsvText(batchId)).resolves.toContain('Reaper')
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock).toHaveBeenNthCalledWith(2, `/api/admin/sos/import-batches/${batchId}/presign-download`)
    expect(fetchMock).toHaveBeenNthCalledWith(3, 'https://r2.example/signed')
  })

  it('shows an actionable error when the database batch is not confirmed', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(metadata('completed', 'b'.repeat(64)))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Not confirmed' }), { status: 409 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(downloadBronzeCsvText(batchId)).rejects.toThrow(/original CSV file/i)
  })

  it('rejects missing batch metadata without asking for a presigned URL', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ batch: null })))
    vi.stubGlobal('fetch', fetchMock)

    await expect(downloadBronzeCsvText(batchId)).rejects.toThrow(/could not be found/i)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
