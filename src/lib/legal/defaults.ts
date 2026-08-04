/**
 * Default multi-tenant legal copy. Placeholders are filled via renderLegalTemplate.
 * These are engineering templates — not a substitute for legal review.
 */

export const DEFAULT_PORTAL_TERMS_VERSION = '2026-08-01'

export function getDefaultAgbDe(): string {
  return `
## Allgemeine Nutzungs- und Abrechnungsbedingungen für das {{labelName}} Artist Portal

### § 1 Geltungsbereich
Diese Bedingungen regeln die Nutzung des „Artist Portals“ der {{labelName}} (im Folgenden „Label“) durch die unter Vertrag stehenden Künstler (im Folgenden „Artist“). Sie gelten insbesondere für die Verwaltung von Abrechnungsprofilen ("billing profiles") und die automatisierte Erstellung von Rechnungen ("SOS-linked invoice creation").

### § 2 Pflichten des Artists zur Datenpflege
(1) Der Artist ist verpflichtet, sein Abrechnungsprofil (Billing Profile) im Portal stets aktuell und wahrheitsgemäß zu führen.
(2) Für eine rechtskonforme Abrechnung nach § 14 UStG muss der Artist folgende Daten zwingend hinterlegen: Vollständiger Name, Melde-/Geschäftsanschrift, Steuernummer oder Umsatzsteuer-Identifikationsnummer (USt-IdNr.) sowie die korrekte Bankverbindung (IBAN/BIC).
(3) Der Artist muss seinen aktuellen steuerlichen Status im Portal korrekt angeben (z. B. Regelbesteuerung, Kleinunternehmerregelung, oder Reverse-Charge-Verfahren bei Sitz im Ausland).

### § 3 Abrechnung (SOS Statements) und Rechnungsstellung
(1) Das Label stellt dem Artist über das Portal in den vertraglich vereinbarten Intervallen Abrechnungsdokumente (SOS Statements) als PDF-Download zur Verfügung.
(2) Das Portal bietet die Funktion der automatisierten Rechnungserstellung (Self-Billing / Gutschriftsverfahren). Der Artist stimmt zu, dass das Label auf Basis der generierten SOS Statements automatisch Rechnungen im Namen des Artists erstellt.
(3) Unterliegt der Artist der Kleinunternehmerregelung, wird auf den generierten Rechnungen keine Umsatzsteuer ausgewiesen. Im Fall von internationalen Artists greift, sofern zutreffend, das Reverse-Charge-Verfahren.
(4) Die Auszahlung der ausgewiesenen Beträge erfolgt auf das im Portal hinterlegte Bankkonto.

### § 4 Systemintegrität und Haftung
(1) Das Label nutzt zur Speicherung von Dokumenten (Rechnungen, Statements) gesicherte Cloud-Systeme (Cloudflare R2). Erzeugte Dokumente dürfen im Nachhinein nicht manipuliert werden.
(2) Änderungen an sensiblen Zahlungsdaten (z. B. IBAN-Änderungen) werden zur Revisionssicherheit (GoBD) systemseitig mit einem Zeitstempel in Audit-Logs erfasst.

### § 5 Kontakt
{{labelName}}  
{{address}}  
E-Mail: {{email}}  
Telefon: {{phone}}
`.trim()
}

export function getDefaultAgbEn(): string {
  return `
## General Terms of Use and Settlement for the {{labelName}} Artist Portal

### § 1 Scope
These terms govern use of the “Artist Portal” of {{labelName}} (the “Label”) by contracted artists (the “Artist”), in particular billing profile management and automated SOS-linked invoice creation.

### § 2 Artist data maintenance duties
(1) The Artist must keep their billing profile accurate and up to date.
(2) For invoices compliant with German VAT rules (§ 14 UStG), the Artist must provide full legal name, address, tax number or VAT ID, and bank details (IBAN/BIC).
(3) The Artist must correctly declare their tax status (standard VAT, small-business exemption, or reverse charge when applicable).

### § 3 Statements and invoicing
(1) The Label provides SOS statements as PDF downloads on the agreed intervals.
(2) The portal supports self-billing. The Artist agrees that the Label may generate invoices in the Artist’s name based on approved SOS statements.
(3) Small-business Artists: no VAT is shown. International Artists may use reverse charge where applicable.
(4) Payouts are made to the bank account stored in the portal.

### § 4 System integrity
(1) Documents are stored in secured cloud storage (Cloudflare R2) and must not be altered after issuance.
(2) Changes to sensitive payment data are recorded in audit logs with timestamps (GoBD-oriented traceability).

### § 5 Contact
{{labelName}}  
{{address}}  
Email: {{email}}  
Phone: {{phone}}
`.trim()
}

/** Portal / billing section appended to default privacy policy when CMS body is empty or as reference text. */
export function getPortalPrivacySectionDe(): string {
  return `
## Datenverarbeitung im Rahmen des Artist Portals und der Abrechnung

Wenn Sie als Künstler unser Artist Portal nutzen, verarbeiten wir zusätzliche personenbezogene Daten, die für die Vertragsabwicklung und die Auszahlung von Tantiemen (SOS Statements) zwingend erforderlich sind.

### Welche Daten werden verarbeitet?
Zur Verwaltung Ihres Accounts und zur Durchführung der Abrechnung ("Billing Profile Management") erfassen wir sensible Finanzdaten. Dazu gehören Ihr vollständiger Name, Ihre Anschrift, Steuernummer bzw. USt-IdNr., Bankverbindungen (IBAN/BIC), Ihr Steuerstatus sowie historische Abrechnungsdaten ("settlement ledger").

### Zweck und Rechtsgrundlage
Die Verarbeitung erfolgt zur Erfüllung unserer vertraglichen Pflichten Ihnen gegenüber (Art. 6 Abs. 1 lit. b DSGVO) sowie zur Erfüllung gesetzlicher Vorgaben, insbesondere handels- und steuerrechtlicher Aufbewahrungspflichten (Art. 6 Abs. 1 lit. c DSGVO).

### Speicherung und Technologie
Ihre Daten werden sicher in unserer Datenbank (Supabase) gespeichert. Rechnungen und SOS Statements werden als PDF-Dokumente auf Servern unseres Cloud-Storage-Anbieters Cloudflare (Cloudflare R2) revisionssicher abgelegt. Zur Nachvollziehbarkeit und Erfüllung der GoBD werden Änderungen an Abrechnungsprofilen (z. B. Änderung der Bankverbindung) in Form von Audit-Logs mit einem Zeitstempel (Timestamp) dokumentiert.

### Speicherdauer
Ihre steuer- und abrechnungsrelevanten Daten sowie generierte Rechnungen und Statements werden von uns gemäß den gesetzlichen Vorgaben in Deutschland für die Dauer von 10 Jahren aufbewahrt. Dies gilt auch dann, wenn Sie Ihr Artist-Konto bei uns löschen lassen.

Verantwortlich: **{{labelName}}**, {{address}}, E-Mail: {{email}}.
`.trim()
}

export function getPortalPrivacySectionEn(): string {
  return `
## Data processing in the Artist Portal and settlement

When you use our Artist Portal as an artist, we process additional personal data required for contract performance and royalty payouts (SOS statements).

### What data is processed?
For account management and settlement (“billing profile management”) we process sensitive financial data including full legal name, address, tax number or VAT ID, bank details (IBAN/BIC), tax status, and historical settlement ledger data.

### Purpose and legal basis
Processing is necessary to perform our contract with you (Art. 6(1)(b) GDPR) and to meet legal obligations, including commercial and tax retention duties (Art. 6(1)(c) GDPR).

### Storage and technology
Data is stored securely in our database (Supabase). Invoices and SOS statements are stored as PDFs with our cloud storage provider Cloudflare (Cloudflare R2) for auditability. Changes to billing profiles (e.g. IBAN updates) are recorded in timestamped audit logs for GoBD-oriented traceability.

### Retention
Tax- and settlement-relevant data as well as generated invoices and statements are retained for 10 years under German legal requirements, including after you request deletion of your artist account.

Controller: **{{labelName}}**, {{address}}, email: {{email}}.
`.trim()
}
