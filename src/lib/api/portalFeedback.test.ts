import { describe, expect, it } from 'vitest'
import {
  PORTAL_FEEDBACK_CATEGORIES,
  PORTAL_FEEDBACK_MESSAGE_MAX,
  PORTAL_FEEDBACK_MESSAGE_MIN,
  PORTAL_FEEDBACK_STATUSES,
  PORTAL_FEEDBACK_SUBJECT_MAX,
  rowToPortalFeedback,
  sanitizeFeedbackSearch,
  type PortalFeedbackCategory,
  type PortalFeedbackStatus,
} from './portalFeedback'
import type { Database } from '@/types/database'

type FeedbackRow = Database['public']['Tables']['portal_feedback']['Row']

function makeRow(overrides: Partial<FeedbackRow> = {}): FeedbackRow {
  return {
    id: 'fb-1',
    artist_id: 'artist-1',
    user_id: 'user-1',
    category: 'ux',
    rating: 4,
    subject: 'Navigation',
    message: 'The sidebar could be clearer on mobile devices.',
    status: 'new',
    created_at: '2026-08-01T10:00:00.000Z',
    updated_at: '2026-08-01T10:00:00.000Z',
    ...overrides,
  }
}

describe('portalFeedback', () => {
  it('maps row to domain type with camelCase and undefined nullables', () => {
    const mapped = rowToPortalFeedback(
      makeRow({ rating: null, subject: null }),
    )
    expect(mapped).toEqual({
      id: 'fb-1',
      artistId: 'artist-1',
      userId: 'user-1',
      category: 'ux',
      rating: undefined,
      subject: undefined,
      message: 'The sidebar could be clearer on mobile devices.',
      status: 'new',
      createdAt: '2026-08-01T10:00:00.000Z',
      updatedAt: '2026-08-01T10:00:00.000Z',
    })
  })

  it('preserves optional rating and subject when set', () => {
    const mapped = rowToPortalFeedback(makeRow())
    expect(mapped.rating).toBe(4)
    expect(mapped.subject).toBe('Navigation')
  })

  it('exposes stable category and status enums and limits', () => {
    expect(PORTAL_FEEDBACK_CATEGORIES).toContain('bug' satisfies PortalFeedbackCategory)
    expect(PORTAL_FEEDBACK_STATUSES).toContain('reviewed' satisfies PortalFeedbackStatus)
    expect(PORTAL_FEEDBACK_CATEGORIES).toHaveLength(5)
    expect(PORTAL_FEEDBACK_STATUSES).toHaveLength(3)
    expect(PORTAL_FEEDBACK_MESSAGE_MIN).toBe(20)
    expect(PORTAL_FEEDBACK_MESSAGE_MAX).toBe(4000)
    expect(PORTAL_FEEDBACK_SUBJECT_MAX).toBe(120)
  })

  it('sanitizes search input for PostgREST filters', () => {
    expect(sanitizeFeedbackSearch('  hello,world (test)  ')).toBe('hello world test')
    expect(sanitizeFeedbackSearch('100%_done')).toBe('100done')
    expect(sanitizeFeedbackSearch('')).toBe('')
    expect(sanitizeFeedbackSearch('a'.repeat(250)).length).toBe(200)
  })
})
