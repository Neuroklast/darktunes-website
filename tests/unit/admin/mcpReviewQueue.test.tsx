import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { McpReviewQueue, type McpReviewLabels, type McpReviewRow } from '../../../app/admin/mcp-approvals/McpReviewQueue'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

const labels: McpReviewLabels = {
  pending: 'Pending', review: 'Review', empty: 'No proposals',
  history: 'History', completed: 'Completed',
  back: 'Back', skip: 'Skip', accept: 'Accept', decline: 'Decline',
  details: 'Details', before: 'Before', after: 'After', saving: 'Saving',
  refresh: 'Refresh', reviewFailed: 'Could not save decision.',
  retryReview: 'Review again', fields: 'Fields', allReviewed: 'All reviewed',
  noChanges: 'No changes', rejected: 'Declined', changes: 'Changes',
  openHistory: 'Recent decisions', preparing: 'Review full values in Details.',
}

function approval(id: string, title: string): McpReviewRow {
  return {
    id, user_id: '00000000-0000-4000-8000-000000000010',
    action: 'create_cms_news_draft',
    payload: { title, slug: title.toLowerCase().replaceAll(' ', '-'), excerpt: '', content: 'Some valid news content for review.' },
    created_at: '2026-11-04T18:00:00Z', expires_at: null,
    used_at: null, result: null,
  }
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('shared GPT approval slider', () => {
  it('advances immediately, keeps writing asynchronously, and confirms only after the server succeeds', async () => {
    let resolveRequest: ((response: Response) => void) | undefined
    const fetchMock = vi.fn((_url: string, _options: RequestInit) =>
      new Promise<Response>(resolve => { resolveRequest = resolve }))
    vi.stubGlobal('fetch', fetchMock)
    render(<McpReviewQueue
      initialPending={[approval('00000000-0000-4000-8000-000000000001', 'Proposal A'),
        approval('00000000-0000-4000-8000-000000000002', 'Proposal B')]}
      recentHistory={[]} labels={labels} locale="en"
    />)

    fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
    expect(screen.getByRole('heading', { name: 'Proposal B' })).toBeTruthy()
    expect(screen.getByText(/Saving 1/)).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toMatchObject({
      token: '00000000-0000-4000-8000-000000000001', decision: 'approve',
    })

    await act(async () => {
      resolveRequest?.(new Response(JSON.stringify({ ok: true }), { status: 201 }))
      await Promise.resolve()
    })
    expect(refresh).toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Proposal B' })).toBeTruthy()
  })

  it('restores a failed decision with an explicit review action', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ detail: 'Another administrator already processed this proposal.' }),
      { status: 409, headers: { 'Content-Type': 'application/problem+json' } },
    )))
    render(<McpReviewQueue
      initialPending={[approval('00000000-0000-4000-8000-000000000003', 'Review me')]}
      recentHistory={[]} labels={labels} locale="en"
    />)
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }))
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Review me' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Review again' })).toBeTruthy()
    })
    expect(refresh).toHaveBeenCalled()
  })

  it('navigates without deciding when Back and Skip are used', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    render(<McpReviewQueue
      initialPending={[approval('00000000-0000-4000-8000-000000000001', 'First'),
        approval('00000000-0000-4000-8000-000000000002', 'Second')]}
      recentHistory={[]} labels={labels} locale="en"
    />)
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
    expect(screen.getByRole('heading', { name: 'Second' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByRole('heading', { name: 'First' })).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
