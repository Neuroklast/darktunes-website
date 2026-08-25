import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getAllPortalFaqCategories, getPublishedPortalFaq } from '@/lib/api/portalFaq'
import { DEFAULT_ORGANIZATION_ID } from '@/lib/organizations/constants'

const ORG_A = DEFAULT_ORGANIZATION_ID
const ORG_B = '11111111-1111-1111-1111-111111111111'

function mockSelectChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {}
  const self = () => chain
  chain.select = vi.fn(self)
  chain.eq = vi.fn(self)
  chain.order = vi.fn(self)
  chain.then = undefined
  // Terminal: allow await via promise-like return from last method used in Promise.all
  // Callers await the query builder; Supabase clients are thenable via .then on the builder.
  // Provide thenable resolution from order() (last call in our DAL).
  chain.order = vi.fn(() => Promise.resolve({ data: rows, error: null }))
  return chain
}

describe('portalFaq org isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('getAllPortalFaqCategories filters by organization_id', async () => {
    const catChain = mockSelectChain([
      {
        id: 'c1',
        organization_id: ORG_B,
        slug: 'dashboard',
        title_en: 'Dash B',
        title_de: null,
        sort_order: 1,
        is_published: true,
        created_at: '2020-01-01',
        updated_at: '2020-01-01',
      },
    ])
    const from = vi.fn(() => catChain)
    const db = { from } as never

    const rows = await getAllPortalFaqCategories(db, ORG_B)
    expect(from).toHaveBeenCalledWith('portal_faq_categories')
    expect(catChain.eq).toHaveBeenCalledWith('organization_id', ORG_B)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.titleEn).toBe('Dash B')
  })

  it('getPublishedPortalFaq scopes categories and items to the same org', async () => {
    const catChain = mockSelectChain([
      {
        id: 'c1',
        organization_id: ORG_A,
        slug: 'music',
        title_en: 'Music',
        title_de: null,
        sort_order: 10,
        is_published: true,
        created_at: '2020-01-01',
        updated_at: '2020-01-01',
      },
    ])
    const itemChain = mockSelectChain([
      {
        id: 'i1',
        organization_id: ORG_A,
        category_id: 'c1',
        slug: 'q1',
        question_en: 'Q?',
        question_de: null,
        answer_html_en: '<p>A</p>',
        answer_html_de: null,
        keywords: [],
        portal_route: null,
        sort_order: 1,
        is_published: true,
        created_at: '2020-01-01',
        updated_at: '2020-01-01',
      },
    ])
    const from = vi.fn((table: string) =>
      table === 'portal_faq_categories' ? catChain : itemChain,
    )
    const db = { from } as never

    const tree = await getPublishedPortalFaq(db, ORG_A)
    expect(catChain.eq).toHaveBeenCalledWith('organization_id', ORG_A)
    expect(itemChain.eq).toHaveBeenCalledWith('organization_id', ORG_A)
    expect(tree).toHaveLength(1)
    expect(tree[0]?.items).toHaveLength(1)
  })
})
