/**
 * app/impressum/page.tsx — Legal Notice (Impressum) [RSC]
 *
 * Renders the mandatory German legal notice with CMS-backed content from
 * site_settings. All mandatory fields per § 5 TMG and § 55 RStV are mapped.
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
          {/* § 5 DDG — Angaben gemäß § 5 DDG */}
          <section aria-labelledby="impr-angaben">
            <h2 id="impr-angaben" className="text-lg font-bold uppercase tracking-wider mb-3 text-foreground">
              Angaben gemäß § 5 DDG
            </h2>
            <p className="text-sm text-muted-foreground mb-1">Betreiber der Website</p>
            <p className="font-semibold">{settings.impressumCompanyName}</p>
            {settings.impressumLegalForm && (
              <p className="text-muted-foreground">{settings.impressumLegalForm}</p>
            )}
            {settings.impressumAddress && (
              <p className="whitespace-pre-line mt-1">{settings.impressumAddress}</p>
            )}
          </section>

          {/* Vertreten durch */}
          {settings.impressumRepresentative && (
            <section aria-labelledby="impr-vertreten">
              <h2 id="impr-vertreten" className="text-lg font-bold uppercase tracking-wider mb-3 text-foreground">
                Vertreten durch (Geschäftsführer/Inhaber)
              </h2>
              <p>{settings.impressumRepresentative}</p>
            </section>
          )}

          {/* Kontakt */}
          <section aria-labelledby="impr-kontakt">
            <h2 id="impr-kontakt" className="text-lg font-bold uppercase tracking-wider mb-3 text-foreground">
              Kontakt
            </h2>
            {settings.impressumPhone && (
              <p>
                Telefon:{' '}
                <a
                  href={`tel:${settings.impressumPhone}`}
                  className="hover:text-accent transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                >
                  {settings.impressumPhone}
                </a>
              </p>
            )}
            <p>
              E-Mail:{' '}
              <a
                href={`mailto:${settings.impressumEmail}`}
                className="hover:text-accent transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              >
                {settings.impressumEmail}
              </a>
            </p>
          </section>

          {/* Umsatzsteuer-ID */}
          {settings.impressumVatId && (
            <section aria-labelledby="impr-vat">
              <h2 id="impr-vat" className="text-lg font-bold uppercase tracking-wider mb-3 text-foreground">
                Umsatzsteuer-Identifikationsnummer
              </h2>
              <p>
                Umsatzsteuer-Identifikationsnummer gemäß § 27 a Umsatzsteuergesetz:{' '}
                <span className="font-mono">{settings.impressumVatId}</span>
              </p>
            </section>
          )}

          {/* Handelsregister */}
          {(settings.impressumRegisterCourt || settings.impressumRegisterNumber) && (
            <section aria-labelledby="impr-register">
              <h2 id="impr-register" className="text-lg font-bold uppercase tracking-wider mb-3 text-foreground">
                Handelsregister
              </h2>
              {settings.impressumRegisterCourt && (
                <p>Registergericht: {settings.impressumRegisterCourt}</p>
              )}
              {settings.impressumRegisterNumber && (
                <p>
                  Registernummer: <span className="font-mono">{settings.impressumRegisterNumber}</span>
                </p>
              )}
            </section>
          )}

          {/* Streitschlichtung */}
          <section aria-labelledby="impr-streit">
            <h2 id="impr-streit" className="text-lg font-bold uppercase tracking-wider mb-3 text-foreground">
              Streitschlichtung
            </h2>
            <p className="text-muted-foreground mb-2">
              Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit:{' '}
              <a
                href="https://ec.europa.eu/consumers/odr/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="EU-Plattform zur Online-Streitbeilegung (öffnet in neuem Tab)"
                className="hover:text-accent transition-colors underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              >
                https://ec.europa.eu/consumers/odr/
              </a>
            </p>
            <p className="text-muted-foreground">
              Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer
              Verbraucherschlichtungsstelle teilzunehmen.
            </p>
          </section>

          {/* Haftungsausschluss */}
          <section aria-labelledby="impr-haftung">
            <h2 id="impr-haftung" className="text-lg font-bold uppercase tracking-wider mb-3 text-foreground">
              Haftungsausschluss (Disclaimer)
            </h2>
            <h3 className="font-semibold mb-1">Haftung für Inhalte</h3>
            <p className="text-muted-foreground mb-4">
              Die Inhalte unserer Seiten wurden mit größter Sorgfalt erstellt. Für die Richtigkeit,
              Vollständigkeit und Aktualität der Inhalte können wir jedoch keine Gewähr übernehmen.
              Als Diensteanbieter sind wir gemäß § 7 Abs. 1 DDG für eigene Inhalte auf diesen Seiten
              nach den allgemeinen Gesetzen verantwortlich.
            </p>
            <h3 className="font-semibold mb-1">Haftung für Links</h3>
            <p className="text-muted-foreground">
              Unser Angebot enthält Links zu externen Webseiten Dritter, auf deren Inhalte wir keinen
              Einfluss haben. Deshalb können wir für diese fremden Inhalte auch keine Gewähr
              übernehmen. Für die Inhalte der verlinkten Seiten ist stets der jeweilige Anbieter oder
              Betreiber der Seiten verantwortlich.
            </p>
          </section>

          {/* Urheberrecht */}
          <section aria-labelledby="impr-urheber">
            <h2 id="impr-urheber" className="text-lg font-bold uppercase tracking-wider mb-3 text-foreground">
              Urheberrecht
            </h2>
            <p className="text-muted-foreground">
              Die durch die Seitenbetreiber erstellten Inhalte und Werke auf diesen Seiten
              unterliegen dem deutschen Urheberrecht. Die Vervielfältigung, Bearbeitung, Verbreitung
              und jede Art der Verwertung außerhalb der Grenzen des Urheberrechtes bedürfen der
              schriftlichen Zustimmung des jeweiligen Autors bzw. Erstellers.
            </p>
          </section>

          <p className="text-xs text-muted-foreground border-t border-border pt-6">
            © {new Date().getFullYear()} {settings.impressumCompanyName}. Alle Rechte vorbehalten.
          </p>
        </div>
      </div>
    </div>
  )
}
