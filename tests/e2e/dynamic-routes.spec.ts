import { test, expect } from '@playwright/test'
import { getVisibleArtists, getVisibleReleases } from '../helpers/supabase'

test.describe('Dynamic routes', () => {
  test('visible artist slugs resolve on /artists/[slug]', async ({ request }) => {
    const artists = await getVisibleArtists(20)
    if (artists.length === 0) {
      test.skip(true, 'No visible artists found for dynamic route validation')
      return
    }

    for (const artist of artists) {
      const response = await request.get(`/artists/${artist.slug}`)
      expect(response.status(), `Artist slug route should return 200: ${artist.slug}`).toBe(200)
    }
  })

  test('visible release ids resolve on /releases/[id]', async ({ request }) => {
    const releases = await getVisibleReleases(20)
    if (releases.length === 0) {
      test.skip(true, 'No visible releases found for dynamic route validation')
      return
    }

    for (const release of releases) {
      const response = await request.get(`/releases/${release.id}`)
      expect(response.status(), `Release route should return 200: ${release.id}`).toBe(200)
    }
  })
})
