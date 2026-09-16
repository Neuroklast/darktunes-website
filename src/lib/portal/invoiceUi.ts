/**
 * src/lib/portal/invoiceUi.ts
 *
 * Portal-safe projection of an invoice row. The stored `pdf_url` is a
 * world-readable R2 public URL — never ship it to the browser. Clients use
 * `hasPdf` plus the authenticated download routes instead.
 */

import type { AdminInvoiceListItem, ArtistInvoice } from '@/lib/api/artistInvoices'

export interface PortalInvoiceListItem extends Omit<ArtistInvoice, 'pdfUrl' | 'pdfSha256'> {
  hasPdf: boolean
}

export function toPortalInvoiceListItem(invoice: ArtistInvoice): PortalInvoiceListItem {
  const { pdfUrl, pdfSha256: _pdfSha256, ...rest } = invoice
  return { ...rest, hasPdf: Boolean(pdfUrl) }
}

export interface AdminInvoiceUiItem extends PortalInvoiceListItem {
  artistName: string
}

/** Admin inbox row — same projection; the stored public URL never reaches the browser. */
export function toAdminInvoiceUiItem(invoice: AdminInvoiceListItem): AdminInvoiceUiItem {
  const { pdfUrl, pdfSha256: _pdfSha256, ...rest } = invoice
  return { ...rest, hasPdf: Boolean(pdfUrl) }
}
