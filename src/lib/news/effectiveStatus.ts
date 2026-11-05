import type { NewsPost } from '@/types'

/**
 * The stored status never needs to be mutated by a scheduler.
 * Scheduled news becomes effectively published when its UTC timestamp is due.
 * Drafts and archived posts stay hidden regardless of timestamps.
 */
export function effectiveNewsStatus(
  post: Pick<NewsPost, 'status' | 'publishedAt'>,
  nowMs = Date.now(),
): NewsPost['status'] {
  if (post.status !== 'scheduled' && post.status !== 'published') return post.status
  const publishMs = Date.parse(post.publishedAt)
  return Number.isFinite(publishMs) && publishMs <= nowMs ? 'published' : 'scheduled'
}

export function isNewsPublished(
  post: Pick<NewsPost, 'status' | 'publishedAt'>,
  nowMs = Date.now(),
): boolean {
  return effectiveNewsStatus(post, nowMs) === 'published'
}
