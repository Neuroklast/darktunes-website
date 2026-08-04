import type { SiteSettings } from '@/types'
import type { BillingParty } from '@/lib/portal/invoicePdf'

export interface LabelClientInfo {
  name: string
  email: string
  address: string
  billingParty: BillingParty
}

/**
 * Resolve label (recipient) party for artist invoices from CMS site_settings.
 * Prefer structured label_billing_* fields; fall back to impressum free-text address.
 */
export function resolveLabelBillingParty(settings: SiteSettings): BillingParty {
  const name =
    settings.impressumCompanyName?.trim() ||
    settings.labelName?.trim() ||
    'Music Label'

  const street =
    settings.labelBillingStreet?.trim() ||
    firstNonEmptyLine(settings.impressumAddress) ||
    ''

  const postalCode = settings.labelBillingPostalCode?.trim() || ''
  const city = settings.labelBillingCity?.trim() || remainingAddressHint(settings.impressumAddress)
  const country = settings.labelBillingCountry?.trim() || 'Germany'

  const email =
    settings.impressumEmail?.trim() ||
    settings.contactEmail?.trim() ||
    ''

  return {
    name,
    street,
    postalCode,
    city,
    country,
    vatId: settings.impressumVatId?.trim() || undefined,
    email: email || undefined,
  }
}

export function resolveLabelClientInfo(settings: SiteSettings): LabelClientInfo {
  const billingParty = resolveLabelBillingParty(settings)
  const address = [
    billingParty.street,
    [billingParty.postalCode, billingParty.city].filter(Boolean).join(' ').trim(),
    billingParty.country,
  ]
    .filter((line) => line.trim().length > 0)
    .join(', ')

  return {
    name: billingParty.name,
    email: billingParty.email ?? settings.contactEmail ?? '',
    address,
    billingParty,
  }
}

function firstNonEmptyLine(text: string | undefined): string {
  if (!text) return ''
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim()
    if (t) return t
  }
  return ''
}

/** Second line of free-text impressum address as city fallback. */
function remainingAddressHint(text: string | undefined): string {
  if (!text) return ''
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length >= 2) return lines.slice(1).join(', ')
  return ''
}
