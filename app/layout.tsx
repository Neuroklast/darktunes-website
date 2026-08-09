import type { Metadata, Viewport } from 'next'
import type { CSSProperties } from 'react'
import { Providers } from './_components/Providers'
import { NavHidingWrapper } from './_components/ConditionalSiteHeader'
import { SiteHeader } from './_components/SiteHeader'
import { SiteFooter } from './_components/SiteFooter'
import { VisualEffectsOverlay } from '@/components/VisualEffectsOverlay'
import { ThemeStyleInjector } from './_components/ThemeStyleInjector'
import { ThemeEffectsClient } from './_components/ThemeEffectsClient'
import { OrganizationBrandingInjector } from './_components/OrganizationBrandingInjector'
import { getCachedSiteSettings } from '@/lib/cache/publicQueries'
import { SITE_SETTINGS_DEFAULTS } from '@/lib/api/siteSettings'
import { resolveBrandFromSettings } from '@/lib/brand'
import { buildRootLayoutMetadata } from '@/lib/seo/metadata'
import { createPublicSupabaseClient } from '@/lib/supabase/publicClient'
import { getOrganizationBranding } from '@/lib/api/organizationBranding'
import { getRequestOrganizationId } from '@/lib/organizations/requestContext'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'
import type { Locale } from '@/i18n/types'
import { WebVitals } from './web-vitals'
import './globals.css'

const fontVariables: CSSProperties = {
  ['--font-sans' as string]: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  ['--font-mono' as string]: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
}

export async function generateMetadata(): Promise<Metadata> {
  const organizationId = await getRequestOrganizationId().catch(() => null)
  const settings =
    (await getCachedSiteSettings(organizationId ?? undefined).catch(() => null))
    ?? SITE_SETTINGS_DEFAULTS
  return buildRootLayoutMetadata(settings)
}

/**
 * Viewport export — ensures correct mobile rendering on all devices.
 * Next.js App Router does not inject a viewport meta tag by default, so we
 * must export it explicitly.  `width=device-width, initial-scale=1` is the
 * standard mobile-web baseline; `interactive-widget=resizes-visual` prevents
 * the layout from resizing when the virtual keyboard opens on mobile.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  interactiveWidget: 'resizes-visual',
  themeColor: '#101010',
}

/**
 * Root Server Component layout — no "use client" here.
 * Providers wraps the tree with client-only concerns (Lenis, Toaster, ErrorBoundary).
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = (await getLocale()) as Locale
  const messages = await getMessages()

  let organizationId: string | null = null
  let organizationBranding = null
  try {
    organizationId = await getRequestOrganizationId()
    organizationBranding = await getOrganizationBranding(
      createPublicSupabaseClient(),
      organizationId,
    )
  } catch {
    organizationBranding = null
  }

  const settings = await getCachedSiteSettings(organizationId ?? undefined).catch(() => null)
  const { labelShortName } = resolveBrandFromSettings(settings ?? SITE_SETTINGS_DEFAULTS)

  return (
    <html
      lang={locale}
      style={fontVariables}
      suppressHydrationWarning
      data-animation-preset={settings?.themeConfig?.animation?.preset ?? 'slide-up'}
      data-organization-id={organizationId ?? undefined}
    >
      <head>
        {/* PWA meta — prevents white flash and styles the status bar */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content={labelShortName} />
        <link rel="apple-touch-icon" href={settings?.faviconUrl || '/icons/icon-192.png'} />
        {/* Software platform identity — readable by crawlers and Wappalyzer */}
        <meta name="generator" content="Neuroklast & Seifried.dev" />
        <OrganizationBrandingInjector branding={organizationBranding} />
        {/* Inject admin-configured color token overrides before first paint */}
        <ThemeStyleInjector
          themePrimary={settings?.themePrimary}
          themeSecondary={settings?.themeSecondary}
          themeBackground={settings?.themeBackground}
          themeForeground={settings?.themeForeground}
          themeCard={settings?.themeCard}
          themeMuted={settings?.themeMuted}
          themeAccent={settings?.themeAccent}
          themeBorder={settings?.themeBorder}
          themeGradientHeroFrom={settings?.themeGradientHeroFrom}
          themeGradientHeroTo={settings?.themeGradientHeroTo}
          themeGradientHeroDir={settings?.themeGradientHeroDir}
          themeGradientAccentFrom={settings?.themeGradientAccentFrom}
          themeGradientAccentTo={settings?.themeGradientAccentTo}
          themeGradientAccentDir={settings?.themeGradientAccentDir}
          themeConfig={settings?.themeConfig}
        />
      </head>
      <body className="bg-background text-foreground antialiased" suppressHydrationWarning>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[9999] focus:bg-background focus:text-foreground focus:px-4 focus:py-2 focus:rounded-md focus:border focus:border-accent focus:outline-none"
        >
          Skip to main content
        </a>
        {/* Visual effects and interactive CSS data-attributes are suppressed on
            admin / portal / press / editor routes so the dashboard UI is not
            obscured by noise, vignettes, scanlines, or hover animations. */}
        <NavHidingWrapper>
          <VisualEffectsOverlay
            noiseOpacity={settings?.noiseOpacity ?? 0.03}
            crtScanlinesEnabled={settings?.crtScanlinesEnabled ?? true}
            vignetteIntensity={settings?.vignetteIntensity ?? 0.5}
            effects={settings?.themeConfig?.effects}
          />
          <ThemeEffectsClient effects={settings?.themeConfig?.effects} />
        </NavHidingWrapper>
        {process.env.NODE_ENV === 'production' ? <WebVitals /> : null}
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers brand={resolveBrandFromSettings(settings ?? SITE_SETTINGS_DEFAULTS)}>
            <NavHidingWrapper><SiteHeader /></NavHidingWrapper>
            {children}
            <NavHidingWrapper><SiteFooter /></NavHidingWrapper>
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
