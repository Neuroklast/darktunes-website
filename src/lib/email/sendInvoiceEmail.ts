/**
 * src/lib/email/sendInvoiceEmail.ts
 *
 * Sends an invoice email to the booker/client with a PDF download link.
 * Non-throwing: errors are returned as { success: false, error: '...' }.
 */

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

function buildInvoiceEmailHtml(
  artistName: string,
  invoiceNumber: string,
  clientName: string,
  pdfUrl: string,
  labelName: string,
): string {
  const brand = escapeHtml(labelName)
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Invoice from ${escapeHtml(artistName)}</title>
</head>
<body style="margin:0;padding:0;background-color:#0e0e0e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#e5e5e5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0e0e0e;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#1a1a1a;border-radius:8px;overflow:hidden;border:1px solid #2a2a2a;">
          <tr>
            <td style="background-color:#000000;padding:24px 32px;border-bottom:1px solid #ffffff;">
              <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:0.05em;">${brand}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#ffffff;">Invoice ${escapeHtml(invoiceNumber)}</h1>
              <p style="margin:0 0 16px;font-size:15px;color:#b0b0b0;line-height:1.6;">Hi ${escapeHtml(clientName)},</p>
              <p style="margin:0 0 24px;font-size:15px;color:#b0b0b0;line-height:1.6;">
                Please find your invoice from <strong style="color:#ffffff;">${escapeHtml(artistName)}</strong> attached below.
              </p>
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="border-radius:4px;background-color:#ffffff;">
                    <a href="${escapeHtml(pdfUrl)}" target="_blank"
                       style="display:inline-block;padding:12px 28px;font-size:15px;font-weight:600;color:#000000;text-decoration:none;border-radius:4px;">
                      Download Invoice PDF
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #2a2a2a;">
              <p style="margin:0;font-size:12px;color:#666666;line-height:1.6;">
                This invoice was generated via the ${brand} Artist Portal.<br />
                If you have any questions please reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export interface SendInvoiceEmailDeps {
  resendApiKey: string
  resendFromEmail: string
  fetch: typeof globalThis.fetch
}

export interface InvoiceEmailData {
  artistName: string
  invoiceNumber: string
  clientEmail: string
  clientName: string
  pdfUrl: string
  /** Multi-tenant label brand for From-prefix and footer. */
  labelName?: string
}

export async function sendInvoiceEmail(
  data: InvoiceEmailData,
  deps: SendInvoiceEmailDeps,
): Promise<{ success: boolean; error?: string }> {
  if (!deps.resendApiKey) {
    console.warn('[sendInvoiceEmail] RESEND_API_KEY not configured — skipping email')
    return { success: false, error: 'RESEND_API_KEY not configured' }
  }

  const labelName = data.labelName?.trim() || 'Music Label'
  const html = buildInvoiceEmailHtml(
    data.artistName,
    data.invoiceNumber,
    data.clientName,
    data.pdfUrl,
    labelName,
  )

  let res: Response
  try {
    const authHeader = ['Bearer', deps.resendApiKey].join(' ')
    res = await deps.fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({
        from: `${data.artistName} via ${labelName} <${deps.resendFromEmail}>`,
        to: [data.clientEmail],
        subject: `Invoice ${data.invoiceNumber} from ${data.artistName}`,
        html,
      }),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, error: msg }
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => `HTTP ${res.status}`)
    return { success: false, error: txt }
  }

  return { success: true }
}
