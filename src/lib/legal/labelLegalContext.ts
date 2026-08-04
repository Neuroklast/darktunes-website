import type { SiteSettings } from '@/types'
import type { LegalTemplateVars } from '@/lib/legal/placeholders'

/** Build placeholder map from CMS site settings (single-tenant-per-deployment model). */
export function getLabelLegalVars(settings: SiteSettings): LegalTemplateVars {
  const company = settings.impressumCompanyName?.trim() || settings.labelName?.trim() || ''
  return {
    labelName: company,
    legalForm: settings.impressumLegalForm?.trim() ?? '',
    representative: settings.impressumRepresentative?.trim() ?? '',
    address: settings.impressumAddress?.trim() ?? '',
    phone: settings.impressumPhone?.trim() ?? '',
    email: settings.impressumEmail?.trim() || settings.contactEmail?.trim() || '',
    vatId: settings.impressumVatId?.trim() ?? '',
    registerCourt: settings.impressumRegisterCourt?.trim() ?? '',
    registerNumber: settings.impressumRegisterNumber?.trim() ?? '',
    privacyUrl: settings.privacyPolicyUrl?.trim() || '/datenschutz',
    termsUrl: settings.termsUrl?.trim() || '/agb',
  }
}
