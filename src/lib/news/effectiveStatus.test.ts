import { describe, expect, it } from 'vitest'
import { effectiveNewsStatus, isNewsPublished } from './effectiveStatus'

const now = Date.parse('2026-11-05T18:00:00.000Z')
const post = (status: 'draft' | 'published' | 'scheduled' | 'archived', publishedAt: string) =>
  ({ status, publishedAt })

describe('cronless scheduled news state', () => {
  it('does not show scheduled news before its timestamp', () => {
    const news = post('scheduled', '2026-11-05T18:00:00.001Z')
    expect(effectiveNewsStatus(news, now)).toBe('scheduled')
    expect(isNewsPublished(news, now)).toBe(false)
  })

  it('shows scheduled news at the exact UTC boundary without a database update', () => {
    const news = post('scheduled', '2026-11-05T18:00:00.000Z')
    expect(effectiveNewsStatus(news, now - 1)).toBe('scheduled')
    expect(effectiveNewsStatus(news, now)).toBe('published')
    expect(isNewsPublished(news, now)).toBe(true)
    expect(news.status).toBe('scheduled')
  })

  it('does not show future dated manually published posts', () => {
    const news = post('published', '2026-11-06T18:00:00Z')
    expect(effectiveNewsStatus(news, now)).toBe('scheduled')
    expect(isNewsPublished(news, now)).toBe(false)
  })

  it('does not expose drafts or archived posts even after the publish timestamp', () => {
    for (const status of ['draft', 'archived'] as const) {
      expect(isNewsPublished(post(status, '2020-01-01T00:00:00Z'), now)).toBe(false)
    }
  })

  it('does not publish posts with invalid dates', () => {
    expect(isNewsPublished(post('scheduled', 'not-a-date'), now)).toBe(false)
    expect(isNewsPublished(post('published', 'not-a-date'), now)).toBe(false)
  })
})
