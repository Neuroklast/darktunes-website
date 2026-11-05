import { beforeEach, describe, expect, it, vi } from 'vitest'

type CacheCallback = () => Promise<unknown>
const recorded = vi.hoisted(() => ({
  callbacks: new Map<string, () => Promise<unknown>>(),
}))

vi.mock('next/cache', () => ({
  unstable_cache: (fn: () => Promise<unknown>, keyParts: string[]) => {
    recorded.callbacks.set(keyParts.join('/'), fn)
    return fn
  },
}))
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  cache: <T,>(fn: T) => fn,
}))
vi.mock('@/lib/supabase/publicClient', () => ({ createPublicSupabaseClient: () => ({}) }))
vi.mock('@/lib/observability/logger', () => ({ logError: vi.fn() }))
vi.mock('@/lib/api/releases', () => ({
  getPublicReleases: vi.fn(),
  getAllVisibleReleasesForCalendar: vi.fn(),
}))
vi.mock('@/lib/api/news', () => ({ getPublicNewsPosts: vi.fn() }))
vi.mock('@/lib/api/videos', () => ({ getPublicVideos: vi.fn() }))
vi.mock('@/lib/api/concerts', () => ({
  getPublicConcerts: vi.fn(),
  getAllVisibleConcertsForCalendar: vi.fn(),
}))
vi.mock('@/lib/api/publicArtist', () => ({ getPublicArtists: vi.fn() }))
vi.mock('@/lib/api/siteSettings', () => ({ getSiteSettings: vi.fn() }))

import { logError } from '@/lib/observability/logger'
import { getPublicReleases } from '@/lib/api/releases'
import { getPublicVideos } from '@/lib/api/videos'
import { getPublicNewsPosts } from '@/lib/api/news'
import { getSiteSettings } from '@/lib/api/siteSettings'
import {
  getCachedPublicReleases,
  getCachedPublicNews,
  getCachedPublicVideos,
  getCachedSiteSettings,
} from './publicQueries'

const boom = new Error('429 rate limited')

function callback(key: string): CacheCallback {
  const cb = recorded.callbacks.get(key)
  if (!cb) throw new Error(`no unstable_cache callback for ${key}`)
  return cb
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('publicQueries: errors are never cached', () => {
  it('releases: cache callback rejects, helper falls back to [] and logs', async () => {
    vi.mocked(getPublicReleases).mockRejectedValue(boom)
    await expect(callback('public-releases')()).rejects.toBe(boom)
    await expect(getCachedPublicReleases()).resolves.toEqual([])
    expect(logError).toHaveBeenCalledWith('public_cache.read_failed', boom, { key: 'public-releases' })
  })

  it('site settings: cache callback rejects, helper falls back to null and logs', async () => {
    vi.mocked(getSiteSettings).mockRejectedValue(boom)
    await expect(callback('public-site-settings')()).rejects.toBe(boom)
    await expect(getCachedSiteSettings()).resolves.toBeNull()
    expect(logError).toHaveBeenCalledWith('public_cache.read_failed', boom, { key: 'public-site-settings' })
  })

  it.each([
    ['public-videos/all', undefined],
    ['public-videos/no-shorts', { excludeShorts: true }],
  ])('videos variant %s rejects in cache and falls back to []', async (key, options) => {
    vi.mocked(getPublicVideos).mockRejectedValue(boom)
    await expect(callback(key)()).rejects.toBe(boom)
    await expect(getCachedPublicVideos(options)).resolves.toEqual([])
    expect(logError).toHaveBeenCalledTimes(1)
  })

  it('does not use cross-request Data Cache for time-sensitive news', async () => {
    const articles = [{ id: 'n1' }] as never
    vi.mocked(getPublicNewsPosts).mockResolvedValue(articles)
    expect(recorded.callbacks.has('public-news')).toBe(false)
    await expect(getCachedPublicNews()).resolves.toBe(articles)
    await expect(getCachedPublicNews()).resolves.toBe(articles)
    expect(getPublicNewsPosts).toHaveBeenCalledTimes(2)
  })

  it('returns fetcher data on success', async () => {
    const releases = [{ id: 'r1' }] as never
    vi.mocked(getPublicReleases).mockResolvedValue(releases)
    await expect(getCachedPublicReleases()).resolves.toBe(releases)
    expect(logError).not.toHaveBeenCalled()
  })
})
