import type { Metadata } from 'next'
import { SITE_SETTINGS_DEFAULTS } from '@/lib/api/siteSettings'
import { getCachedSiteSettings } from '@/lib/cache/publicQueries'
import { resolveBrandFromSettings, type BrandContext } from '@/lib/brand'
import {
  buildDefaultOgDescription,
  buildDefaultSeoDescription,
} from '@/lib/brand/tenantDefaults'
import { getRequestOrganizationId } from '@/lib/organizations/requestContext'
import type { SiteSettings } from '@/types'

export type MetadataContext = {
  settings: SiteSettings
  brand: BrandContext
}

export async function getMetadataContext(): Promise<MetadataContext> {
  const organizationId = await getRequestOrganizationId().catch(() => undefined)
  const settings =
    (await getCachedSiteSettings(organizationId).catch(() => null)) ?? SITE_SETTINGS_DEFAULTS
  return { settings, brand: resolveBrandFromSettings(settings) }
}

export async function getMetadataBrand(): Promise<BrandContext> {
  const { brand } = await getMetadataContext()
  return brand
}

/** All label-level social/profile URLs from site_settings (incl. custom CMS links). */
export function collectLabelSocialUrls(
  settings: Pick<
    SiteSettings,
    'instagramUrl' | 'youtubeUrl' | 'spotifyUrl' | 'customSocialLinks'
  >,
): string[] {
  return [
    settings.instagramUrl,
    settings.youtubeUrl,
    settings.spotifyUrl,
    ...(settings.customSocialLinks ?? []).map((link) => link.url),
  ].filter((url): url is string => typeof url === 'string' && url.trim().length > 0)
}

function getFaviconMimeType(url: string): string {
  if (url.endsWith('.svg')) return 'image/svg+xml'
  if (url.endsWith('.ico')) return 'image/x-icon'
  if (url.endsWith('.webp')) return 'image/webp'
  return 'image/png'
}

/** "Page — Label Name" */
export function pageTitle(page: string, labelName: string): string {
  return `${page} — ${labelName}`
}

/** "Page | Label Name" */
export function pageTitlePipe(page: string, labelName: string): string {
  return `${page} | ${labelName}`
}

/** "Entity — Context | Label" */
export function entityTitle(
  entity: string,
  context: string,
  labelName: string,
): string {
  return `${entity} — ${context} | ${labelName}`
}

export function portalPageTitle(page: string, labelShortName: string): string {
  return pageTitlePipe(page, `${labelShortName} Portal`)
}

export function portalBuilderTitle(page: string, labelShortName: string): string {
  return pageTitlePipe(page, `${labelShortName} Artist Portal`)
}

export function rootMetadataFallbacks(brand: BrandContext): Pick<
  Metadata,
  'title' | 'description' | 'openGraph'
> {
  const title = brand.labelName
  const description = buildDefaultSeoDescription(brand.labelName)
  const ogDescription = buildDefaultOgDescription()

  return {
    title,
    description,
    openGraph: {
      title,
      description: ogDescription,
      type: 'website',
    },
  }
}

/** Root layout metadata — reads seo/og fields, logo, and favicon from site_settings. */
export function buildRootLayoutMetadata(settings: SiteSettings): Metadata {
  const brand = resolveBrandFromSettings(settings)
  const fallbacks = rootMetadataFallbacks(brand)
  const title = settings.seoTitle?.trim() || (fallbacks.title as string)
  const description =
    settings.seoDescription?.trim() || (fallbacks.description as string)
  const ogTitle = settings.ogTitle?.trim() || title
  const ogDescription = settings.ogDescription?.trim() || description
  const ogImage = settings.logoUrl?.trim()
  const customFaviconUrl = settings.faviconUrl?.trim() || ''

  return {
    ...(brand.siteUrl ? { metadataBase: new URL(brand.siteUrl) } : {}),
    title,
    description,
    openGraph: {
      title: ogTitle,
      description: ogDescription,
      type: 'website',
      siteName: brand.labelName,
      ...(brand.siteUrl ? { url: brand.siteUrl } : {}),
      ...(ogImage ? { images: [{ url: ogImage, alt: brand.labelName }] } : {}),
    },
    twitter: {
      card: ogImage ? 'summary_large_image' : 'summary',
      title: ogTitle,
      description: ogDescription,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
    icons: {
      icon: customFaviconUrl
        ? [{ url: customFaviconUrl, type: getFaviconMimeType(customFaviconUrl) }]
        : [
            { url: '/favicon.svg', type: 'image/svg+xml' },
            { url: '/favicon.ico', sizes: '32x32' },
          ],
      shortcut: customFaviconUrl || '/favicon.ico',
      apple: {
        url: customFaviconUrl || '/icons/icon-192.png',
        sizes: '192x192',
      },
    },
  }
}