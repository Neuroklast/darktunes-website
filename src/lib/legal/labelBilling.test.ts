import { describe, expect, it } from 'vitest'
import { SITE_SETTINGS_DEFAULTS } from '@/lib/api/siteSettings'
import { resolveLabelBillingParty, resolveLabelClientInfo } from '@/lib/portal/labelBilling'
import type { SiteSettings } from '@/types'

function settings(partial: Partial<SiteSettings>): SiteSettings {
  return { ...SITE_SETTINGS_DEFAULTS, ...partial }
}

describe('resolveLabelBillingParty', () => {
  it('uses structured billing address when set', () => {
    const party = resolveLabelBillingParty(
      settings({
        impressumCompanyName: 'Acme Music',
        impressumVatId: 'DE123',
        impressumEmail: 'legal@acme.test',
        labelBillingStreet: 'Main 1',
        labelBillingPostalCode: '10115',
        labelBillingCity: 'Berlin',
        labelBillingCountry: 'Germany',
      }),
    )
    expect(party.name).toBe('Acme Music')
    expect(party.street).toBe('Main 1')
    expect(party.postalCode).toBe('10115')
    expect(party.city).toBe('Berlin')
    expect(party.vatId).toBe('DE123')
    expect(party.email).toBe('legal@acme.test')
  })

  it('falls back to impressum multi-line address', () => {
    const party = resolveLabelBillingParty(
      settings({
        impressumCompanyName: 'Label X',
        impressumAddress: 'Street 9\n69118 Heidelberg\nGermany',
        labelBillingStreet: '',
        labelBillingPostalCode: '',
        labelBillingCity: '',
        labelBillingCountry: '',
      }),
    )
    expect(party.street).toBe('Street 9')
    expect(party.city).toContain('Heidelberg')
  })
})

describe('resolveLabelClientInfo', () => {
  it('builds a single-line client address', () => {
    const info = resolveLabelClientInfo(
      settings({
        impressumCompanyName: 'Acme',
        labelBillingStreet: 'A 1',
        labelBillingPostalCode: '1',
        labelBillingCity: 'B',
        labelBillingCountry: 'DE',
        impressumEmail: 'a@b.c',
      }),
    )
    expect(info.name).toBe('Acme')
    expect(info.email).toBe('a@b.c')
    expect(info.address).toContain('A 1')
  })
})
