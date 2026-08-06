/**
 * app/impressum/page.tsx — Legal Notice (Impressum) [RSC]
 *
 * Renders the mandatory German legal notice with CMS-backed content from
 * site_settings. Labels and boilerplate follow the active locale (DE/EN).
 * Mandatory fields per § 5 DDG are mapped from site settings.
 */

import type { Metadata } from 'next'
import { unstable_cache } from 'next/cache'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import { getSiteSettings, SITE_SETTINGS_DEFAULTS } from '@/lib/api/siteSettings'
import type { SiteSettings } from '@/types'
import type { Database } from '@/types/database'
import { getTranslations } from 'next-intl/server'

// Cookie-free public client — safe inside unstable_cache callbacks where
// Next.js Dynamic APIs (cookies, headers) are unavailable. site_settings has
// a public-read RLS policy (FOR SELECT USING (TRUE)), so the anon key works.
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
  const t = await getTranslations('impressum')
  return {
    title: t('metaTitle'),
    robots: { index: false },
  }
}

export default async function ImpressumPage() {
  const [settings, tImpressum, tPages] = await Promise.all([
    getCachedSettings().catch((): SiteSettings => SITE_SETTINGS_DEFAULTS),
    getTranslations('impressum'),
    getTranslations('pages'),
  ])

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto px-4 lg:px-8 pt-36 pb-24 max-w-3xl">
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:text-accent transition-colors mb-8 inline-block focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          {tPages('backToHome')}
        </Link>

        <h1 className="text-4xl lg:text-5xl font-bold mb-10 tracking-tight uppercase">
          {tImpressum('heading')}
        </h1>

        <div className="space-y-8 text-sm text-foreground/90 leading-relaxed">
          <section aria-labelledby="impr-angaben">
            <h2 id="impr-angaben" className="text-lg font-bold uppercase tracking-wider mb-3 text-foreground">
              {tImpressum('section_provider')}
            </h2>
            <p className="text-sm text-muted-foreground mb-1">{tImpressum('operator_label')}</p>
            <p className="font-semibold">{settings.impressumCompanyName}</p>
            {settings.impressumLegalForm && (
              <p className="text-muted-foreground">{settings.impressumLegalForm}</p>
            )}
            {settings.impressumAddress && (
              <p className="whitespace-pre-line mt-1">{settings.impressumAddress}</p>
            )}
          </section>

          {settings.impressumRepresentative && (
            <section aria-labelledby="impr-vertreten">
              <h2 id="impr-vertreten" className="text-lg font-bold uppercase tracking-wider mb-3 text-foreground">
                {tImpressum('section_representative')}
              </h2>
              <p>{settings.impressumRepresentative}</p>
            </section>
          )}

          <section aria-labelledby="impr-kontakt">
            <h2 id="impr-kontakt" className="text-lg font-bold uppercase tracking-wider mb-3 text-foreground">
              {tImpressum('section_contact')}
            </h2>
            {settings.impressumPhone && (
              <p>
                {tImpressum('phone_label')}:{' '}
                <a
                  href={`tel:${settings.impressumPhone}`}
                  className="hover:text-accent transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                >
                  {settings.impressumPhone}
                </a>
              </p>
            )}
            <p>
              {tImpressum('email_label')}:{' '}
              <a
                href={`mailto:${settings.impressumEmail}`}
                className="hover:text-accent transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              >
                {settings.impressumEmail}
              </a>
            </p>
          </section>

          {settings.impressumVatId && (
            <section aria-labelledby="impr-vat">
              <h2 id="impr-vat" className="text-lg font-bold uppercase tracking-wider mb-3 text-foreground">
                {tImpressum('section_vat')}
              </h2>
              <p>
                {tImpressum('vat_text')}{' '}
                <span className="font-mono">{settings.impressumVatId}</span>
              </p>
            </section>
          )}

          {(settings.impressumRegisterCourt || settings.impressumRegisterNumber) && (
            <section aria-labelledby="impr-register">
              <h2 id="impr-register" className="text-lg font-bold uppercase tracking-wider mb-3 text-foreground">
                {tImpressum('section_register')}
              </h2>
              {settings.impressumRegisterCourt && (
                <p>
                  {tImpressum('register_court_label')}: {settings.impressumRegisterCourt}
                </p>
              )}
              {settings.impressumRegisterNumber && (
                <p>
                  {tImpressum('register_number_label')}:{' '}
                  <span className="font-mono">{settings.impressumRegisterNumber}</span>
                </p>
              )}
            </section>
          )}

          <section aria-labelledby="impr-streit">
            <h2 id="impr-streit" className="text-lg font-bold uppercase tracking-wider mb-3 text-foreground">
              {tImpressum('section_dispute')}
            </h2>
            <p className="text-muted-foreground mb-2">
              {tImpressum('dispute_odr')}{' '}
              <a
                href="https://ec.europa.eu/consumers/odr/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label={tImpressum('dispute_odr_aria')}
                className="hover:text-accent transition-colors underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              >
                https://ec.europa.eu/consumers/odr/
              </a>
            </p>
            <p className="text-muted-foreground">{tImpressum('dispute_refusal')}</p>
          </section>

          <section aria-labelledby="impr-haftung">
            <h2 id="impr-haftung" className="text-lg font-bold uppercase tracking-wider mb-3 text-foreground">
              {tImpressum('section_disclaimer')}
            </h2>
            <h3 className="font-semibold mb-1">{tImpressum('disclaimer_content_heading')}</h3>
            <p className="text-muted-foreground mb-4">{tImpressum('disclaimer_content_body')}</p>
            <h3 className="font-semibold mb-1">{tImpressum('disclaimer_links_heading')}</h3>
            <p className="text-muted-foreground">{tImpressum('disclaimer_links_body')}</p>
          </section>

          <section aria-labelledby="impr-urheber">
            <h2 id="impr-urheber" className="text-lg font-bold uppercase tracking-wider mb-3 text-foreground">
              {tImpressum('section_copyright')}
            </h2>
            <p className="text-muted-foreground">{tImpressum('copyright_body')}</p>
          </section>

          <p className="text-xs text-muted-foreground border-t border-border pt-6">
            © {new Date().getFullYear()} {settings.impressumCompanyName}. {tImpressum('all_rights_reserved')}
          </p>
        </div>
      </div>
    </div>
  )
}
