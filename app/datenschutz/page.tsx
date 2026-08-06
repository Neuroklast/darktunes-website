/**
 * app/datenschutz/page.tsx — Privacy Policy (Datenschutzerklärung / Privacy Policy) [RSC]
 *
 * Renders the full privacy policy. The main body text is stored as HTML or
 * Markdown in the CMS (site_settings keys: datenschutz_content for DE,
 * datenschutz_content_en for EN) so the legal team can update it without a
 * deployment. Falls back to a compliant boilerplate if no content is configured.
 */

import type { Metadata } from 'next'
import { unstable_cache } from 'next/cache'
import Link from 'next/link'
import { createPublicSupabaseClient } from '@/lib/supabase/publicClient'
import { getSiteSettings, SITE_SETTINGS_DEFAULTS } from '@/lib/api/siteSettings'
import { getLabelLegalVars } from '@/lib/legal/labelLegalContext'
import { renderLegalTemplate } from '@/lib/legal/placeholders'
import type { SiteSettings } from '@/types'
import { DatenschutzContent } from './_components/DatenschutzContent'
import { getLocale, getTranslations } from 'next-intl/server'

const getCachedSettings = unstable_cache(
  async (): Promise<SiteSettings> => {
    return getSiteSettings(createPublicSupabaseClient())
  },
  ['site-settings'],
  { revalidate: 60, tags: ['site-settings'] },
)

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('datenschutz')
  return {
    title: t('metaTitle'),
    robots: { index: false },
  }
}

function getDefaultContentDe(settings: SiteSettings): string {
  return `
## 1. Datenschutz auf einen Blick

### Allgemeine Hinweise
Die folgenden Hinweise geben einen einfachen Überblick darüber, was mit Ihren personenbezogenen Daten passiert, wenn Sie diese Website besuchen. Personenbezogene Daten sind alle Daten, mit denen Sie persönlich identifiziert werden können.

### Datenerfassung auf dieser Website
**Wer ist verantwortlich für die Datenerfassung auf dieser Website?**
Die Datenverarbeitung auf dieser Website erfolgt durch den Websitebetreiber. Dessen Kontaktdaten können Sie dem [Impressum](/impressum) dieser Website entnehmen.

## 2. Hosting und Infrastruktur

Diese Website wird bei externen Dienstleistern betrieben. Personenbezogene Daten, die auf dieser Website erfasst werden, können auf Servern dieser Anbieter verarbeitet werden (z. B. IP-Adressen, Kontaktanfragen, Meta- und Kommunikationsdaten, Vertragsdaten, Kontaktdaten, Namen, Zugriffsprotokolle).

**Vercel Inc.** (USA) stellt Hosting, Edge- und Serverless-Infrastruktur bereit.
**Cloudflare, Inc.** (USA) wird u. a. für Objektspeicher (Cloudflare R2) und CDN-Dienste genutzt.
**Supabase Inc.** (USA) wird für Datenbank, Authentifizierung und Realtime-Updates eingesetzt. Dabei können WebSocket-Verbindungen Ihre IP-Adresse übertragen.

Soweit eine Übermittlung in Drittländer (insbesondere USA) erfolgt, stützen wir uns — je nach Anbieter und Konfiguration — auf geeignete Garantien (z. B. Standardvertragsklauseln) und unser berechtigtes Interesse an einer sicheren, skalierbaren Bereitstellung des Angebots (Art. 6 Abs. 1 lit. f DSGVO).

## 3. Allgemeine Hinweise und Pflichtinformationen

### Datenschutz
Die Betreiber dieser Seiten nehmen den Schutz Ihrer persönlichen Daten sehr ernst. Wir behandeln Ihre personenbezogenen Daten vertraulich und entsprechend der gesetzlichen Datenschutzvorschriften sowie dieser Datenschutzerklärung.

### Hinweis zur verantwortlichen Stelle
Die verantwortliche Stelle für die Datenverarbeitung auf dieser Website ist:

**${settings.impressumCompanyName}**  
${settings.impressumAddress}  
E-Mail: ${settings.impressumEmail}

Verantwortliche Stelle ist die natürliche oder juristische Person, die allein oder gemeinsam mit anderen über die Zwecke und Mittel der Verarbeitung von personenbezogenen Daten entscheidet.

### Speicherdauer
Soweit innerhalb dieser Datenschutzerklärung keine speziellere Speicherdauer genannt wurde, verbleiben Ihre personenbezogenen Daten bei uns, bis der Zweck für die Datenverarbeitung entfällt.

### Ihre Rechte
Sie haben jederzeit das Recht, unentgeltlich Auskunft über Herkunft, Empfänger und Zweck Ihrer gespeicherten personenbezogenen Daten zu erhalten. Sie haben außerdem ein Recht auf Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit sowie Widerspruch gegen die Verarbeitung, soweit gesetzlich vorgesehen. Ferner besteht ein Beschwerderecht bei einer Datenschutz-Aufsichtsbehörde (in Deutschland z. B. die für uns zuständige Landesbehörde bzw. der Bundesbeauftragte für den Datenschutz und die Informationsfreiheit).

### Server-Logs
Beim Besuch dieser Website können technisch erforderliche Zugriffsdaten (z. B. IP-Adresse, Zeitpunkt, angeforderte Ressource, User-Agent) in Server- oder CDN-Logs verarbeitet werden. Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO (Sicherheit und Stabilität des Betriebs). Logs werden nur so lange aufbewahrt, wie es für diese Zwecke erforderlich ist.

## 4. Cookies, lokale Speicherung und Einwilligungen

Wir setzen technisch notwendige Cookies und vergleichbare Technologien ein, u. a. das Locale-Cookie \`NEXT_LOCALE\` zur Speicherung Ihrer Sprachwahl. Optional speichern wir Einwilligungen zum Laden externer Medien (Consent-Banner) sowie lokale Einstellungen (z. B. Installationshinweis der Progressive Web App) im Local Storage Ihres Browsers.

Soweit eine Progressive Web App (PWA) genutzt wird, kann ein Service Worker Inhalte zwischenspeichern, um Offline-Funktionen und schnellere Ladezeiten zu ermöglichen. Diese Speicherung erfolgt gerätebezogen in Ihrem Browser.

Externe Medien (z. B. Spotify, YouTube) werden erst nach Ihrer Einwilligung geladen. Die Einwilligung können Sie jederzeit widerrufen, indem Sie die Cookie-/Consent-Einstellungen Ihres Browsers zurücksetzen oder uns kontaktieren.

## 5. Externe Medien und Einbettungen

Diese Website kann externe Inhalte von Drittanbietern einbetten (z.B. Spotify, YouTube). Diese Inhalte werden erst nach Ihrer ausdrücklichen Zustimmung geladen. Vor der Zustimmung werden nur Platzhalter angezeigt.

**Spotify**: Bei der Nutzung des Spotify-Einbettungsplayers gelten die Datenschutzbestimmungen der Spotify AB, Regeringsgatan 19, 111 53 Stockholm, Schweden.

**YouTube**: Bei der Nutzung von YouTube-Videos gelten die Datenschutzbestimmungen der Google Ireland Limited, Gordon House, Barrow Street, Dublin 4, Irland.

## 6. Newsletter

Wenn Sie den auf der Website angebotenen Newsletter beziehen möchten, benötigen wir von Ihnen eine E-Mail-Adresse sowie Informationen, welche uns die Überprüfung gestatten, dass Sie der Inhaber der angegebenen E-Mail-Adresse sind und mit dem Empfang des Newsletters einverstanden sind. Rechtsgrundlage: Art. 6 Abs. 1 lit. a DSGVO (Einwilligung).

Sie können Ihre Einwilligung jederzeit widerrufen, indem Sie uns eine E-Mail an ${settings.impressumEmail} senden oder den Abmelde-Link in jeder Newsletter-E-Mail nutzen.

## 7. Kontaktformular und Authentifizierung

Wenn Sie uns über das Kontaktformular oder per E-Mail kontaktieren, speichern wir die von Ihnen mitgeteilten Daten zur Bearbeitung der Anfrage (Art. 6 Abs. 1 lit. b bzw. lit. f DSGVO).

Für Login-Bereiche (Artist Portal, Admin, Presse) nutzen wir Supabase Auth. Dabei werden E-Mail-Adresse, Authentifizierungsmetadaten und Sitzungsdaten verarbeitet, um den Zugang abzusichern (Art. 6 Abs. 1 lit. b und lit. f DSGVO).

## 8. CDN / Bildauslieferung

Diese Website nutzt wsrv.nl (Images.weserv.nl) für die Optimierung von Bildern. Dabei können Ihre IP-Adresse und Anfrage-Metadaten an die Betreiber übermittelt werden. Weitere Informationen: https://images.weserv.nl/privacy

## 9. Presse-Portal

Akkreditierte Journalisten können Pressefotos und Promo-Tracks herunterladen. Wir speichern Download-Statistiken (Zeitpunkt, Datei, Journalist-ID) zu Analysezwecken. Rechtsgrundlage: Berechtigtes Interesse (Art. 6 Abs. 1 lit. f DSGVO).

## 10. Plugins und Tools

### Schriftarten (Google Fonts)
Diese Website verwendet für die einheitliche Darstellung von Schriftarten Web Fonts. Je nach im CMS ausgewählter Theme-Konfiguration können diese Schriftarten von Google Fonts nachgeladen werden. Dabei kann es zu einer Verbindung mit Servern von Google kommen, wobei insbesondere Ihre IP-Adresse und technische Metadaten an Google übermittelt werden können. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an einer konsistenten und ansprechenden Darstellung der Website) beziehungsweise – sofern eine entsprechende Einwilligungslösung eingesetzt wird – Ihre Einwilligung nach Art. 6 Abs. 1 lit. a DSGVO.

## 11. Artist Portal und Abrechnung

Wenn Sie als Künstler unser Artist Portal nutzen, verarbeiten wir zusätzliche personenbezogene Daten, die für die Vertragsabwicklung und die Auszahlung von Tantiemen (SOS Statements) erforderlich sind.

### Welche Daten werden verarbeitet?
Zur Verwaltung Ihres Accounts und zur Durchführung der Abrechnung ("Billing Profile Management") erfassen wir sensible Finanzdaten. Dazu gehören Ihr vollständiger Name, Ihre Anschrift, Steuernummer bzw. USt-IdNr., Bankverbindungen (IBAN/BIC), Ihr Steuerstatus sowie historische Abrechnungsdaten ("settlement ledger").

### Zweck und Rechtsgrundlage
Die Verarbeitung erfolgt zur Erfüllung unserer vertraglichen Pflichten (Art. 6 Abs. 1 lit. b DSGVO) sowie zur Erfüllung gesetzlicher Vorgaben, insbesondere handels- und steuerrechtlicher Aufbewahrungspflichten (Art. 6 Abs. 1 lit. c DSGVO).

### Speicherung und Technologie
Ihre Daten werden in unserer Datenbank (Supabase) gespeichert. Rechnungen und SOS Statements werden als PDF-Dokumente bei Cloudflare R2 revisionssicher abgelegt. Änderungen an Abrechnungsprofilen (z. B. IBAN) werden in Audit-Logs mit Zeitstempel dokumentiert (GoBD-orientierte Nachvollziehbarkeit).

### Speicherdauer und Kontolöschung
Steuer- und abrechnungsrelevante Daten sowie generierte Rechnungen und Statements werden gemäß den gesetzlichen Vorgaben in Deutschland in der Regel **10 Jahre** aufbewahrt — auch nach Löschung des Artist-Kontos. Sonstige Kontodaten können im Rahmen einer Löschanfrage entfernt werden, soweit keine gesetzlichen Aufbewahrungspflichten entgegenstehen.
`.trim()
}

function getDefaultContentEn(settings: SiteSettings): string {
  return `
## 1. Privacy at a Glance

### General Information
The following notes provide a simple overview of what happens to your personal data when you visit this website. Personal data is any data that can be used to identify you personally.

### Data Collection on This Website
**Who is responsible for data collection on this website?**
Data processing on this website is carried out by the website operator. You can find their contact details in the [legal notice (Impressum)](/impressum) of this website.

## 2. Hosting and infrastructure

This website is operated using external service providers. Personal data collected on this website may be processed on their servers (e.g. IP addresses, contact requests, metadata and communication data, contract data, contact details, names, access logs).

**Vercel Inc.** (USA) provides hosting, edge, and serverless infrastructure.
**Cloudflare, Inc.** (USA) is used for object storage (Cloudflare R2) and CDN services, among other things.
**Supabase Inc.** (USA) is used for database, authentication, and real-time updates. WebSocket connections may transmit your IP address.

Where personal data is transferred to third countries (in particular the USA), we rely — depending on the provider and configuration — on appropriate safeguards (e.g. standard contractual clauses) and our legitimate interest in a secure, scalable operation of the service (Art. 6(1)(f) GDPR).

## 3. General Information and Mandatory Disclosures

### Data Protection
The operators of this website take the protection of your personal data very seriously. We treat your personal data confidentially and in accordance with statutory data protection regulations and this privacy policy.

### Information About the Responsible Party
The responsible party for data processing on this website is:

**${settings.impressumCompanyName}**  
${settings.impressumAddress}  
Email: ${settings.impressumEmail}

The responsible party is the natural or legal person who alone or jointly with others decides on the purposes and means of processing personal data.

### Retention Period
Unless a more specific retention period has been stated within this privacy policy, your personal data will remain with us until the purpose for data processing no longer applies.

### Your Rights
You have the right to receive information about the origin, recipient, and purpose of your stored personal data free of charge at any time. You also have the right to request rectification, erasure, restriction of processing, data portability, and to object to processing where provided by law. You may lodge a complaint with a data protection supervisory authority (in Germany, e.g. the competent state authority or the Federal Commissioner for Data Protection and Freedom of Information).

### Server logs
When you visit this website, technically necessary access data (e.g. IP address, timestamp, requested resource, user agent) may be processed in server or CDN logs. Legal basis: Art. 6(1)(f) GDPR (security and stability of operations). Logs are retained only as long as required for these purposes.

## 4. Cookies, local storage, and consent

We use technically necessary cookies and similar technologies, including the \`NEXT_LOCALE\` cookie to store your language preference. We may also store consent for loading external media (consent banner) and local preferences (e.g. Progressive Web App install prompt dismissal) in your browser’s local storage.

If you use the Progressive Web App (PWA), a service worker may cache content to enable offline features and faster loading. This storage is device-local in your browser.

External media (e.g. Spotify, YouTube) is loaded only after your consent. You may withdraw consent at any time by resetting your browser’s cookie/consent settings or by contacting us.

## 5. External Media and Embeds

This website may embed external content from third-party providers (e.g. Spotify, YouTube). This content is only loaded after your explicit consent. Before consent, only placeholders are displayed.

**Spotify**: When using the Spotify embed player, the privacy policy of Spotify AB, Regeringsgatan 19, 111 53 Stockholm, Sweden applies.

**YouTube**: When using YouTube videos, the privacy policy of Google Ireland Limited, Gordon House, Barrow Street, Dublin 4, Ireland applies.

## 6. Newsletter

If you would like to receive the newsletter offered on the website, we require an email address from you as well as information that allows us to verify that you are the owner of the email address provided and that you consent to receiving the newsletter. Legal basis: Art. 6(1)(a) GDPR (consent).

You can revoke your consent at any time by sending us an email to ${settings.impressumEmail} or by using the unsubscribe link included in every newsletter email.

## 7. Contact form and authentication

If you contact us via the contact form or email, we store the data you provide in order to handle your request (Art. 6(1)(b) or (f) GDPR).

Login areas (Artist Portal, Admin, Press) use Supabase Auth. We process email address, authentication metadata, and session data to secure access (Art. 6(1)(b) and (f) GDPR).

## 8. CDN / Image Delivery

This website uses wsrv.nl (Images.weserv.nl) to optimise images. In doing so, your IP address and request metadata may be transmitted to the service operator. More information: https://images.weserv.nl/privacy

## 9. Press Portal

Accredited journalists may download press photos and promo tracks. We store download statistics (timestamp, file, journalist ID) for analytical purposes. Legal basis: Legitimate interest (Art. 6(1)(f) GDPR).

## 10. Plugins and Tools

### Web Fonts
This website uses web fonts for uniform font rendering. Depending on the theme configuration selected in the CMS, fonts may be loaded from Google Fonts. This may result in a connection to Google servers and the transmission of your IP address and technical metadata to Google. The legal basis is Art. 6(1)(f) GDPR (legitimate interest in a consistent and visually appealing presentation of the website) or, if a consent solution is used for this purpose, your consent pursuant to Art. 6(1)(a) GDPR.

## 11. Artist Portal and Settlement

When you use our Artist Portal as an artist, we process additional personal data required for contract performance and royalty payouts (SOS statements).

### What data is processed?
For billing profile management we process sensitive financial data including full legal name, address, tax number or VAT ID, bank details (IBAN/BIC), tax status, and historical settlement ledger data.

### Purpose and legal basis
Processing is necessary to perform our contract with you (Art. 6(1)(b) GDPR) and to meet legal obligations, including commercial and tax retention duties (Art. 6(1)(c) GDPR).

### Storage and technology
Data is stored in our database (Supabase). Invoices and SOS statements are stored as PDFs with Cloudflare R2. Billing profile changes (e.g. IBAN updates) are recorded in timestamped audit logs for GoBD-oriented traceability.

### Retention and account deletion
Tax- and settlement-relevant data as well as generated invoices and statements are retained for **10 years** under German legal requirements, including after you request deletion of your artist account. Other account data may be deleted upon request where no statutory retention duties apply.
`.trim()
}

export default async function DatenschutzPage() {
  const [settings, locale] = await Promise.all([
    getCachedSettings().catch((): SiteSettings => SITE_SETTINGS_DEFAULTS),
    getLocale(),
  ])
  const [tDatenschutz, tPages] = await Promise.all([
    getTranslations('datenschutz'),
    getTranslations('pages'),
  ])

  const isEn = locale === 'en'
  const raw = isEn
    ? (settings.datenschutzContentEn || getDefaultContentEn(settings))
    : (settings.datenschutzContent || getDefaultContentDe(settings))
  const content = renderLegalTemplate(raw, getLabelLegalVars(settings))

  const dateLabel = tDatenschutz('dateLabel')
  const formattedDate = new Date().toLocaleDateString(isEn ? 'en-GB' : 'de-DE', {
    year: 'numeric',
    month: 'long',
  })

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto px-4 lg:px-8 pt-36 pb-24 max-w-3xl">
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:text-accent transition-colors mb-8 inline-block"
        >
          {tPages('backToHome')}
        </Link>

        <h1 className="text-4xl lg:text-5xl font-bold mb-10 tracking-tight uppercase">
          {tDatenschutz('heading')}
        </h1>

        <DatenschutzContent content={content} />

        <p className="text-xs text-muted-foreground border-t border-border pt-6 mt-12">
          {dateLabel} {formattedDate}
        </p>
      </div>
    </div>
  )
}
