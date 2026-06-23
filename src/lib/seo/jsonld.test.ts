import { describe, it, expect } from 'vitest'
import {
  buildOrganizationSchema,
  buildWebSiteSchema,
  buildMusicGroupSchema,
  buildMusicAlbumSchema,
  buildNewsArticleSchema,
  buildPressArticleSchema,
  buildPressEpkSchema,
  serializeJsonLd,
  SITE_URL,
} from './jsonld'
import type { Artist, Release, NewsPost, SiteSettings } from '@/types'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const siteSettings: Pick<
  SiteSettings,
  'labelName' | 'instagramUrl' | 'youtubeUrl' | 'spotifyUrl' | 'contactEmail'
> & { logoUrl?: string } = {
  labelName: 'darkTunes Music Group',
  instagramUrl: 'https://instagram.com/darktunes',
  youtubeUrl: 'https://youtube.com/@darktunes',
  spotifyUrl: 'https://open.spotify.com/user/darktunes',
  contactEmail: 'info@darktunes.com',
  logoUrl: 'https://darktunes.com/logo.png',
}

const artist: Pick<
  Artist,
  | 'name'
  | 'slug'
  | 'bio'
  | 'imageUrl'
  | 'genres'
  | 'country'
  | 'foundedYear'
  | 'spotifyUrl'
  | 'appleMusicUrl'
  | 'instagramUrl'
  | 'youtubeUrl'
  | 'facebookUrl'
  | 'twitterUrl'
  | 'bandcampUrl'
  | 'websiteUrl'
> = {
  name: 'Test Artist',
  slug: 'test-artist',
  bio: 'A great artist.',
  imageUrl: 'https://example.com/img.jpg',
  genres: ['dark wave', 'synth pop'],
  country: 'Germany',
  foundedYear: 2010,
  spotifyUrl: 'https://open.spotify.com/artist/abc',
  appleMusicUrl: 'https://music.apple.com/artist/abc',
  instagramUrl: 'https://instagram.com/testartist',
  youtubeUrl: 'https://youtube.com/@testartist',
  facebookUrl: undefined,
  twitterUrl: undefined,
  bandcampUrl: undefined,
  websiteUrl: 'https://testartist.com',
}

const releases: Pick<Release, 'id' | 'title' | 'releaseDate'>[] = [
  { id: 'rel-1', title: 'Debut Album', releaseDate: '2020-01-01' },
  { id: 'rel-2', title: 'Second EP', releaseDate: '2022-06-15' },
]

const release: Pick<
  Release,
  | 'id'
  | 'title'
  | 'artistId'
  | 'artistName'
  | 'releaseDate'
  | 'coverArt'
  | 'type'
  | 'spotifyUrl'
  | 'appleMusicUrl'
  | 'youtubeUrl'
> = {
  id: 'rel-1',
  title: 'Debut Album',
  artistId: 'artist-1',
  artistName: 'Test Artist',
  releaseDate: '2020-01-01',
  coverArt: 'https://example.com/cover.jpg',
  type: 'album',
  spotifyUrl: 'https://open.spotify.com/album/abc',
  appleMusicUrl: undefined,
  youtubeUrl: undefined,
}

const newsPost: Pick<NewsPost, 'title' | 'excerpt' | 'imageUrl' | 'publishedAt' | 'slug'> = {
  title: 'Big News',
  excerpt: 'Something happened.',
  imageUrl: 'https://example.com/news.jpg',
  publishedAt: '2024-03-01T12:00:00Z',
  slug: 'big-news',
}

const pressPost: Pick<NewsPost, 'title' | 'publishedAt' | 'slug'> = {
  title: 'Press Release: New Album',
  publishedAt: '2024-04-01T00:00:00Z',
  slug: 'press-new-album',
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SITE_URL', () => {
  it('has no trailing slash', () => {
    expect(SITE_URL).not.toMatch(/\/$/)
  })
})

describe('buildOrganizationSchema', () => {
  it('outputs correct @type and @context', () => {
    const schema = buildOrganizationSchema({ siteSettings })
    expect(schema['@context']).toBe('https://schema.org')
    expect(schema['@type']).toBe('Organization')
  })

  it('sets name and url', () => {
    const schema = buildOrganizationSchema({ siteSettings })
    expect(schema.name).toBe('darkTunes Music Group')
    expect(schema.url).toBe(SITE_URL)
  })

  it('includes logo when logoUrl is provided', () => {
    const schema = buildOrganizationSchema({ siteSettings })
    expect(schema.logo).toEqual({ '@type': 'ImageObject', url: siteSettings.logoUrl })
  })

  it('omits logo when logoUrl is missing', () => {
    const schema = buildOrganizationSchema({ siteSettings: { ...siteSettings, logoUrl: undefined } })
    expect(schema.logo).toBeUndefined()
  })

  it('includes all sameAs social URLs', () => {
    const schema = buildOrganizationSchema({ siteSettings })
    expect(schema.sameAs).toContain(siteSettings.instagramUrl)
    expect(schema.sameAs).toContain(siteSettings.youtubeUrl)
    expect(schema.sameAs).toContain(siteSettings.spotifyUrl)
  })

  it('filters null/undefined sameAs entries', () => {
    const schema = buildOrganizationSchema({
      siteSettings: { ...siteSettings, instagramUrl: undefined, youtubeUrl: undefined },
    })
    expect(schema.sameAs).not.toContain(undefined)
    expect(schema.sameAs.length).toBe(1)
  })

  it('includes contactPoint when contactEmail is provided', () => {
    const schema = buildOrganizationSchema({ siteSettings })
    expect(schema.contactPoint).toMatchObject({
      '@type': 'ContactPoint',
      email: 'info@darktunes.com',
    })
  })
})

describe('buildWebSiteSchema', () => {
  it('outputs correct @type', () => {
    const schema = buildWebSiteSchema('darkTunes Music Group')
    expect(schema['@type']).toBe('WebSite')
  })

  it('has potentialAction SearchAction with urlTemplate', () => {
    const schema = buildWebSiteSchema('darkTunes Music Group')
    expect(schema.potentialAction['@type']).toBe('SearchAction')
    expect(schema.potentialAction.target.urlTemplate).toContain('/artists?q=')
    expect(schema.potentialAction.target.urlTemplate).toContain('{search_term_string}')
  })

  it('uses provided label name', () => {
    const schema = buildWebSiteSchema('My Label')
    expect(schema.name).toBe('My Label')
  })
})

describe('buildMusicGroupSchema', () => {
  it('outputs correct @type', () => {
    const schema = buildMusicGroupSchema({ artist, releases })
    expect(schema['@type']).toBe('MusicGroup')
  })

  it('builds artist URL from slug', () => {
    const schema = buildMusicGroupSchema({ artist, releases })
    expect(schema.url).toBe(`${SITE_URL}/artists/test-artist`)
  })

  it('includes genres array', () => {
    const schema = buildMusicGroupSchema({ artist, releases })
    expect(schema.genre).toEqual(['dark wave', 'synth pop'])
  })

  it('includes foundingLocation when country is set', () => {
    const schema = buildMusicGroupSchema({ artist, releases })
    expect(schema.foundingLocation).toEqual({ '@type': 'Place', name: 'Germany' })
  })

  it('omits foundingLocation when country is missing', () => {
    const schema = buildMusicGroupSchema({ artist: { ...artist, country: undefined }, releases })
    expect(schema.foundingLocation).toBeUndefined()
  })

  it('includes foundingDate when foundedYear is set', () => {
    const schema = buildMusicGroupSchema({ artist, releases })
    expect(schema.foundingDate).toBe('2010')
  })

  it('maps releases to album stubs', () => {
    const schema = buildMusicGroupSchema({ artist, releases })
    expect(schema.album).toHaveLength(2)
    expect(schema.album[0]).toMatchObject({
      '@type': 'MusicAlbum',
      name: 'Debut Album',
      url: `${SITE_URL}/releases/rel-1`,
    })
  })

  it('filters empty sameAs entries', () => {
    const schema = buildMusicGroupSchema({ artist, releases })
    expect(schema.sameAs).not.toContain(undefined)
    expect(schema.sameAs.every((u) => typeof u === 'string' && u.length > 0)).toBe(true)
  })

  it('prefers explicit description over artist.bio', () => {
    const schema = buildMusicGroupSchema({
      artist,
      releases,
      description: 'Approved short bio from EPK.',
    })
    expect(schema.description).toBe('Approved short bio from EPK.')
  })
})

describe('buildMusicAlbumSchema', () => {
  it('outputs correct @type', () => {
    const schema = buildMusicAlbumSchema({ release })
    expect(schema['@type']).toBe('MusicAlbum')
  })

  it('includes byArtist with artist name', () => {
    const schema = buildMusicAlbumSchema({ release })
    expect(schema.byArtist).toMatchObject({ '@type': 'MusicGroup', name: 'Test Artist' })
  })

  it('includes artist URL when artistSlug provided', () => {
    const schema = buildMusicAlbumSchema({ release, artistSlug: 'test-artist' })
    expect(schema.byArtist.url).toBe(`${SITE_URL}/artists/test-artist`)
  })

  it('omits artist URL when artistSlug not provided', () => {
    const schema = buildMusicAlbumSchema({ release })
    expect((schema.byArtist as Record<string, unknown>).url).toBeUndefined()
  })

  it('sets albumProductionType for EP', () => {
    const schema = buildMusicAlbumSchema({ release: { ...release, type: 'ep' } })
    expect(schema.albumProductionType).toBe('EPRelease')
  })

  it('sets albumProductionType for single', () => {
    const schema = buildMusicAlbumSchema({ release: { ...release, type: 'single' } })
    expect(schema.albumProductionType).toBe('SingleRelease')
  })

  it('omits albumProductionType for album', () => {
    const schema = buildMusicAlbumSchema({ release })
    expect(schema.albumProductionType).toBeUndefined()
  })

  it('builds release URL from id', () => {
    const schema = buildMusicAlbumSchema({ release })
    expect(schema.url).toBe(`${SITE_URL}/releases/rel-1`)
  })

  it('filters null sameAs entries', () => {
    const schema = buildMusicAlbumSchema({ release })
    expect(schema.sameAs).not.toContain(undefined)
    expect(schema.sameAs).not.toContain(null)
  })
})

describe('buildNewsArticleSchema', () => {
  it('outputs correct @type', () => {
    const schema = buildNewsArticleSchema({ post: newsPost })
    expect(schema['@type']).toBe('NewsArticle')
  })

  it('sets headline and description', () => {
    const schema = buildNewsArticleSchema({ post: newsPost })
    expect(schema.headline).toBe('Big News')
    expect(schema.description).toBe('Something happened.')
  })

  it('builds news URL from slug', () => {
    const schema = buildNewsArticleSchema({ post: newsPost })
    expect(schema.url).toBe(`${SITE_URL}/news/big-news`)
  })

  it('sets datePublished and dateModified', () => {
    const schema = buildNewsArticleSchema({ post: newsPost })
    expect(schema.datePublished).toBe('2024-03-01T12:00:00Z')
    expect(schema.dateModified).toBe('2024-03-01T12:00:00Z')
  })

  it('includes publisher Organization', () => {
    const schema = buildNewsArticleSchema({ post: newsPost })
    expect(schema.publisher).toMatchObject({
      '@type': 'Organization',
      name: 'darkTunes Music Group',
    })
  })

  it('includes publisher logo when provided', () => {
    const schema = buildNewsArticleSchema({
      post: newsPost,
      publisherLogoUrl: 'https://darktunes.com/logo.png',
    })
    expect(schema.publisher.logo).toEqual({
      '@type': 'ImageObject',
      url: 'https://darktunes.com/logo.png',
    })
  })

  it('omits publisher logo when not provided', () => {
    const schema = buildNewsArticleSchema({ post: newsPost })
    expect((schema.publisher as Record<string, unknown>).logo).toBeUndefined()
  })
})

describe('buildPressEpkSchema', () => {
  it('outputs WebPage with press kit URL', () => {
    const schema = buildPressEpkSchema({
      artist: { name: 'Test Artist', slug: 'test-artist', imageUrl: artist.imageUrl, genres: artist.genres },
      description: 'Short bio for press.',
      pressQuote: 'A striking quote.',
    })
    expect(schema['@type']).toBe('WebPage')
    expect(schema.url).toBe(`${SITE_URL}/press/artists/test-artist`)
    expect(schema.about).toMatchObject({ '@type': 'MusicGroup', name: 'Test Artist' })
    expect(schema.citation).toMatchObject({ text: 'A striking quote.' })
  })
})

describe('buildPressArticleSchema', () => {
  it('outputs correct @type', () => {
    const schema = buildPressArticleSchema({ post: pressPost })
    expect(schema['@type']).toBe('Article')
  })

  it('sets headline', () => {
    const schema = buildPressArticleSchema({ post: pressPost })
    expect(schema.headline).toBe('Press Release: New Album')
  })

  it('builds press release URL from slug', () => {
    const schema = buildPressArticleSchema({ post: pressPost })
    expect(schema.url).toBe(`${SITE_URL}/press/releases/press-new-album`)
  })

  it('includes publisher', () => {
    const schema = buildPressArticleSchema({ post: pressPost })
    expect(schema.publisher).toMatchObject({
      '@type': 'Organization',
      name: 'darkTunes Music Group',
    })
  })
})

describe('serializeJsonLd — XSS safety', () => {
  it('escapes angle brackets so </script> cannot break out of the script tag', () => {
    const schema = buildNewsArticleSchema({
      post: { ...newsPost, title: '</script><script>alert(1)</script>' },
    })
    const serialised = serializeJsonLd(schema)
    expect(serialised).not.toContain('</script>')
    expect(serialised).toContain('\\u003c/script\\u003e')
  })

  it('escapes ampersands', () => {
    const schema = buildNewsArticleSchema({
      post: { ...newsPost, title: 'Rock & Roll' },
    })
    const serialised = serializeJsonLd(schema)
    expect(serialised).not.toContain('Rock & Roll')
    expect(serialised).toContain('Rock \\u0026 Roll')
  })

  it('produces valid parseable JSON after escaping', () => {
    const schema = buildNewsArticleSchema({
      post: { ...newsPost, title: '<b>Rock & Roll</b>' },
    })
    const serialised = serializeJsonLd(schema)
    const parsed = JSON.parse(serialised)
    expect(parsed.headline).toBe('<b>Rock & Roll</b>')
  })
})
