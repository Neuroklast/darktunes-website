import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHmac } from 'node:crypto'
import { dispatchOrganizationWebhooks } from './webhooks'

function makeWebhookDb(endpoints: unknown[], insertError: unknown = null) {
  const insert = vi.fn().mockResolvedValue({ error: insertError })
  const from = vi.fn((table: string) => {
    if (table === 'organization_webhook_endpoints') {
      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        then: (resolve: (v: unknown) => void) =>
          Promise.resolve({ data: endpoints, error: null }).then(resolve),
      }
      return builder
    }
    if (table === 'organization_webhook_deliveries') {
      return { insert }
    }
    throw new Error(`Unexpected table: ${table}`)
  })
  return { from, insert }
}

describe('dispatchOrganizationWebhooks', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('delivers signed payloads to matching endpoints', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 })
    const db = makeWebhookDb([
      {
        id: 'ep-1',
        url: 'https://partner.example/hook',
        secret: 'secret-abc',
        events: ['release.submitted'],
        enabled: true,
      },
    ])

    await dispatchOrganizationWebhooks(
      db as never,
      'org-1',
      'release.submitted',
      { submissionId: 'sub-1' },
    )

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://partner.example/hook')
    const body = String(init.body)
    const expectedSig = createHmac('sha256', 'secret-abc').update(body, 'utf8').digest('hex')
    expect((init.headers as Record<string, string>)['X-DarkTunes-Signature']).toBe(expectedSig)
    expect(db.insert).toHaveBeenCalled()
  })

  it('skips when no endpoints are configured', async () => {
    const db = makeWebhookDb([])
    await dispatchOrganizationWebhooks(db as never, 'org-1', 'artist.created', { artistId: 'a1' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})