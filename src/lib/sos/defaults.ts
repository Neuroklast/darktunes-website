/**
 * Shared default configuration constants.
 *
 * Kept in a dedicated module so they can be imported by both components and
 * hooks without triggering react-refresh fast-reload warnings (which fire when
 * a file mixes component exports with non-component exports).
 */
import type { AppDefaults, PdfExportSettings, EmailConfig, LabelInfo } from './types'

export const DEFAULT_APP_DEFAULTS: AppDefaults = {
  defaultSplitPercentage: 50,
  defaultSplitPercentageDigital: 50,
  defaultSplitPercentagePhysical: 15,
  invoiceDeadlineDays: 25,
  financeEmail: '',
  invoiceDeadlineDate: '',
  royaltyDonationOrg: 'animal shelter',
  distributionFeePercentage: 0,
  sourceSplits: {
    believe: 50,
    bandcamp: 50,
    physical: 65,
    darkmerch: 100,
  },
}

export const DEFAULT_PDF_EXPORT_SETTINGS: PdfExportSettings = {
  includeReleaseBreakdown: true,
  includePlatformBreakdown: true,
  includeCountryBreakdown: true,
  includeMonthlyBreakdown: false,
  includeEmailCoverLetter: false,
  hideCompilationsInStatement: true,
  includePieChart: true,
}

export const DEFAULT_EMAIL_CONFIG: EmailConfig = {
  fromName: '',
  fromEmail: '',
  replyTo: '',
  subjectTemplate: 'Statement of Sales – {period}',
}

/**
 * Pre-filled label branding defaults for Darktunes Music Group.
 * Used as the initial value for the Default SOS preset so new
 * installations have a fully-formed branding profile out of the box.
 * Users can overwrite any field at any time or replace it via workspace import.
 */
export const DEFAULT_LABEL_INFO: LabelInfo = {
  name: 'Darktunes',
  legalForm: 'Darktunes Music Group UG, Raphaël Beck',
  address: 'Friedhofweg 1, 69118 Heidelberg, Germany',
  email: 'info@dark-tunes.com',
  taxId: 'DE269873706',
  vatRate: 19,
  invoiceNumberPrefix: 'DT-2026-',
  bankAccount: 'Not publicly listed in the legal notice. You will need to check internal bank documents or previous invoices.',
  footerText: 'This statement was generated automatically and is valid without a signature.',
  emailTemplate: `Hello {artist},

please find attached your current statement for the period {period}.
The payout amount of {amount} will be transferred to your registered bank account.

Best regards,
{label_name}`,
}
