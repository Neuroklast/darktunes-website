import { describe, expect, it, vi } from 'vitest'
import { listPublishedEpkTemplates } from './epkTemplates'

const sampleDocument = {
  version: 2,
  pageFormat: 'a4',
  orientation: 'portrait',
  pages: [{
    id: 'p1',
    name: 'Cover',
    width: 794,
    height: 1123,
    background: { type: 'color', color: '#101010' },
  }],
  elements: [],
  fonts: [],
  metadata: {},
}

function createMockDb(data: unknown[] = []) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    then: (resolve: (value: { data: unknown[]; error: null }) => void) =>
      Promise.resolve({ data, error: null }).then(resolve),
    catch: (reject: (reason: unknown) => void) =>
      Promise.resolve({ data, error: null }).catch(reject),
    finally: (cb: () => void) => Promise.resolve({ data, error: null }).finally(cb),
  }

  return { from: vi.fn(() => builder), builder }
}

describe('epkTemplates', () => {
  it('lists published templates', async () => {
    const mock = createMockDb([
      {
        organization_id: '00000000-0000-0000-0000-000000000000',
        id: 'tpl-1',
        name: 'Classic Press Kit',
        description: 'Label default',
        document: sampleDocument,
        is_published: true,
        sort_order: 0,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ])

    const templates = await listPublishedEpkTemplates(mock as never)
    expect(templates).toHaveLength(1)
    expect(templates[0].name).toBe('Classic Press Kit')
    expect(templates[0].isPublished).toBe(true)
    expect(mock.builder.eq).toHaveBeenCalledWith(
      'organization_id',
      '00000000-0000-0000-0000-000000000000',
    )
  })
})