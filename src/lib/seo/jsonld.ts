/**
 * src/lib/seo/jsonld.ts — JSON-LD structured-data builder functions
 *
 * Each function returns a plain schema.org object that can be embedded in a
 * Next.js RSC page via:
 *
 *   <script
 *     type="application/ld+json"
 *     dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }}
 *   />
 *
 * Use `serializeJsonLd` (exported below) instead of bare `JSON.stringify`.
 * It replaces `<`, `>`, and `&` with their Unicode escape sequences so that a
 * `</script>` inside a string value cannot prematurely close the script tag.
 *
 * All URLs must be absolute; pass NEXT_PUBLIC_SITE_URL as the `siteUrl` arg.
 */

import type { Artist, Release, NewsPost, SiteSettings } from '@/types'

/** Canonical site origin, e.g. "https://darktunes.com" (no trailing slash). */
export const SITE_URL =
  (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://darktunes.com').replace(/\/$/, '')

/**
 * Serialize a JSON-LD schema object to a string that is safe to embed inside a
 * `<script type="application/ld+json">` tag.
 *
 * Standard `JSON.stringify` does NOT escape `<`, `>`, or `&`, so a crafted
 * value like `"</script><script>alert(1)</script>"` could break out of the
 * enclosing script element.  Replacing those three chars with their Unicode
 * escape sequences prevents this while keeping the output valid JSON.
 */
export function serializeJsonLd(schema: unknown): string {
  return JSON.stringify(schema)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
}

/** Filter out undefined/null/empty-string values from a list. */
function compact(items: (string | undefined | null)[]): string[] {
  return items.filter((x): x is string => typeof x === 'string' && x.length > 0)
}

// ---------------------------------------------------------------------------
// Organization
// ---------------------------------------------------------------------------

export interface OrganizationSchemaInput {
  siteSettings: Pick<SiteSettings, 'labelName' | 'contactEmail'> &
    Partial<Pick<SiteSettings, 'instagramUrl' | 'youtubeUrl' | 'spotifyUrl'>> & {
      logoUrl?: string
    }
}

export function buildOrganizationSchema({ siteSettings }: OrganizationSchemaInput) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: siteSettings.labelName || 'darkTunes Music Group',
    url: SITE_URL,
    ...(siteSettings.logoUrl
      ? {
          logo: {
            '@type': 'ImageObject',
            url: siteSettings.logoUrl,
          },
        }
      : {}),
    sameAs: compact([
      siteSettings.instagramUrl,
      siteSettings.youtubeUrl,
      siteSettings.spotifyUrl,
    ]),
    contactPoint: siteSettings.contactEmail
      ? {
          '@type': 'ContactPoint',
          email: siteSettings.contactEmail,
          contactType: 'customer support',
        }
      : undefined,
  }
}

// ---------------------------------------------------------------------------
// WebSite
// ---------------------------------------------------------------------------

export function buildWebSiteSchema(labelName: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: labelName || 'darkTunes Music Group',
    url: SITE_URL,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_URL}/artists?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  }
}

// ---------------------------------------------------------------------------
// MusicGroup (artist profile)
// ---------------------------------------------------------------------------

export interface MusicGroupSchemaInput {
  artist: Pick<
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
  >
  releases: Pick<Release, 'id' | 'title' | 'releaseDate'>[]
  /** Approved short bio plain text; overrides artist.bio when set. */
  description?: string
}

export function buildMusicGroupSchema({ artist, releases, description }: MusicGroupSchemaInput) {
  const resolvedDescription = description?.trim() || artist.bio || undefined
  return {
    '@context': 'https://schema.org',
    '@type': 'MusicGroup',
    name: artist.name,
    description: resolvedDescription,
    image: artist.imageUrl || undefined,
    genre: artist.genres?.length ? artist.genres : undefined,
    url: `${SITE_URL}/artists/${artist.slug}`,
    ...(artist.country
      ? {
          foundingLocation: {
            '@type': 'Place',
            name: artist.country,
          },
        }
      : {}),
    ...(artist.foundedYear ? { foundingDate: String(artist.foundedYear) } : {}),
    sameAs: compact([
      artist.spotifyUrl,
      artist.appleMusicUrl,
      artist.instagramUrl,
      artist.youtubeUrl,
      artist.facebookUrl,
      artist.twitterUrl,
      artist.bandcampUrl,
      artist.websiteUrl,
    ]),
    album: releases.map((r) => ({
      '@type': 'MusicAlbum',
      name: r.title,
      datePublished: r.releaseDate,
      url: `${SITE_URL}/releases/${r.id}`,
    })),
  }
}

// ---------------------------------------------------------------------------
// MusicAlbum (release detail)
// ---------------------------------------------------------------------------

export interface MusicAlbumSchemaInput {
  release: Pick<
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
  >
  /** Slug of the artist, used to build the artist URL. Optional — omit if unknown. */
  artistSlug?: string
}

export function buildMusicAlbumSchema({ release, artistSlug }: MusicAlbumSchemaInput) {
  return {
    '@context': 'https://schema.org',
    '@type': 'MusicAlbum',
    name: release.title,
    byArtist: {
      '@type': 'MusicGroup',
      name: release.artistName,
      ...(artistSlug ? { url: `${SITE_URL}/artists/${artistSlug}` } : {}),
    },
    image: release.coverArt || undefined,
    datePublished: release.releaseDate,
    url: `${SITE_URL}/releases/${release.id}`,
    ...(release.type === 'ep'
      ? { albumProductionType: 'EPRelease' }
      : release.type === 'single'
        ? { albumProductionType: 'SingleRelease' }
        : {}),
    sameAs: compact([release.spotifyUrl, release.appleMusicUrl, release.youtubeUrl]),
  }
}

// ---------------------------------------------------------------------------
// NewsArticle
// ---------------------------------------------------------------------------

export interface NewsArticleSchemaInput {
  post: Pick<NewsPost, 'title' | 'excerpt' | 'imageUrl' | 'publishedAt' | 'slug'>
  publisherLogoUrl?: string
}

export function buildNewsArticleSchema({ post, publisherLogoUrl }: NewsArticleSchemaInput) {
  return {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: post.title,
    description: post.excerpt || undefined,
    image: post.imageUrl || undefined,
    datePublished: post.publishedAt,
    dateModified: post.publishedAt,
    url: `${SITE_URL}/news/${post.slug}`,
    publisher: {
      '@type': 'Organization',
      name: 'darkTunes Music Group',
      url: SITE_URL,
      ...(publisherLogoUrl
        ? {
            logo: {
              '@type': 'ImageObject',
              url: publisherLogoUrl,
            },
          }
        : {}),
    },
  }
}

// ---------------------------------------------------------------------------
// Article (press release)
// ---------------------------------------------------------------------------

export interface PressArticleSchemaInput {
  post: Pick<NewsPost, 'title' | 'publishedAt' | 'slug'>
}

export function buildPressArticleSchema({ post }: PressArticleSchemaInput) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    datePublished: post.publishedAt,
    url: `${SITE_URL}/press/releases/${post.slug}`,
    publisher: {
      '@type': 'Organization',
      name: 'darkTunes Music Group',
      url: SITE_URL,
    },
  }
}

// ---------------------------------------------------------------------------
// Press EPK (artist press kit page)
// ---------------------------------------------------------------------------

export interface PressEpkSchemaInput {
  artist: Pick<Artist, 'name' | 'slug' | 'imageUrl' | 'genres'>
  description?: string
  pressQuote?: string
}

export function buildPressEpkSchema({ artist, description, pressQuote }: PressEpkSchemaInput) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: `${artist.name} — Press Kit`,
    description: description?.trim() || undefined,
    url: `${SITE_URL}/press/artists/${artist.slug}`,
    about: {
      '@type': 'MusicGroup',
      name: artist.name,
      genre: artist.genres?.length ? artist.genres : undefined,
      image: artist.imageUrl || undefined,
      description: description?.trim() || undefined,
      url: `${SITE_URL}/artists/${artist.slug}`,
    },
    ...(pressQuote?.trim()
      ? {
          citation: {
            '@type': 'Quotation',
            text: pressQuote.trim(),
          },
        }
      : {}),
    isPartOf: {
      '@type': 'WebSite',
      name: 'darkTunes Press Portal',
      url: `${SITE_URL}/press`,
    },
    publisher: {
      '@type': 'Organization',
      name: 'darkTunes Music Group',
      url: SITE_URL,
    },
  }
}
