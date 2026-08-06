/**
 * app/agb/page.tsx — Portal terms (AGB) [RSC]
 *
 * Multi-tenant: CMS template with {{placeholders}} filled from site_settings.
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import { unstable_cache } from 'next/cache'
import { createClient } from '@supabase/supabase-js'
import { getSiteSettings, SITE_SETTINGS_DEFAULTS } from '@/lib/api/siteSettings'
import { getDefaultAgbDe, getDefaultAgbEn } from '@/lib/legal/defaults'
import { getLabelLegalVars } from '@/lib/legal/labelLegalContext'
import { renderLegalTemplate } from '@/lib/legal/placeholders'
import type { SiteSettings } from '@/types'
import type { Database } from '@/types/database'
import { getLocale, getTranslations } from 'next-intl/server'
import { DatenschutzContent } from '../datenschutz/_components/DatenschutzContent'

function createPublicSupabaseClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key',
  )
}

const getCachedSettings = unstable_cache(
  async (): Promise<SiteSettings> => {
    return getSiteSettings(createPublicSupabaseClient())
  },
  ['site-settings'],
  { revalidate: 60, tags: ['site-settings'] },
)

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale()
  const title = locale === 'de' ? 'AGB' : locale === 'fr' ? 'Conditions' : 'Terms'
  return {
    title,
    robots: { index: false },
  }
}

export default async function AgbPage() {
  const [settings, locale, tPages] = await Promise.all([
    getCachedSettings().catch((): SiteSettings => SITE_SETTINGS_DEFAULTS),
    getLocale(),
    getTranslations('pages'),
  ])

  const vars = getLabelLegalVars(settings)
  // CMS has DE + EN only; FR falls back to English templates
  const useGerman = locale === 'de'
  const raw =
    (useGerman
      ? settings.agbContent?.trim()
      : settings.agbContentEn?.trim() || settings.agbContent?.trim()) ||
    (useGerman ? getDefaultAgbDe() : getDefaultAgbEn())

  const content = renderLegalTemplate(raw, vars)
  const heading = locale === 'de' ? 'AGB' : locale === 'fr' ? 'Conditions' : 'Terms'
  const versionLabel = locale === 'de' ? 'Version' : locale === 'fr' ? 'Version' : 'Version'

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto px-4 lg:px-8 pt-36 pb-24 max-w-3xl">
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:text-accent transition-colors mb-8 inline-block focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          {tPages('backToHome')}
        </Link>

        <h1 className="text-4xl lg:text-5xl font-bold mb-4 tracking-tight uppercase">
          {heading}
        </h1>
        <p className="text-xs text-muted-foreground mb-10 font-mono">
          {versionLabel}: {settings.portalTermsVersion}
        </p>

        <DatenschutzContent content={content} />
      </div>
    </div>
  )
}
