/**
 * supabase/functions/newsletter-confirm/index.ts
 *
 * Supabase Edge Function — Double Opt-In email sender.
 *
 * Triggered by a Supabase Database Webhook on INSERT to the
 * `newsletter_subscribers` table. Sends a GDPR-compliant confirmation
 * email to the new subscriber using the Resend email API.
 *
 * Webhook setup (Supabase Dashboard → Database → Webhooks):
 *   - Table:   newsletter_subscribers
 *   - Events:  INSERT
 *   - URL:     https://<project>.supabase.co/functions/v1/newsletter-confirm
 *   - Method:  POST
 *   - Headers: Authorization: Bearer <SUPABASE_WEBHOOK_SECRET>  (optional)
 *
 * Required Edge Function secrets (Supabase Dashboard → Edge Functions → Secrets):
 *   RESEND_API_KEY          — Resend API key (https://resend.com)
 *   RESEND_FROM_EMAIL       — Verified "From" address (no hard-coded tenant default)
 *   NEXT_PUBLIC_SITE_URL    — Public site URL (or SITE_URL)
 *   TENANT_LABEL_NAME       — Label display name in confirmation email (optional)
 *
 * The function is idempotent — if the record is already 'subscribed' (e.g. due
 * to a webhook replay), it silently exits without re-sending the email.
 *
 * Deno runtime — no Node.js APIs; use Deno/Web Platform APIs only.
 */

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

// ---------------------------------------------------------------------------
// Webhook payload shape (Supabase sends the full row on INSERT)
// ---------------------------------------------------------------------------

interface SubscriberRecord {
  id: string
  email: string
  name: string | null
  status: 'pending' | 'subscribed'
  verification_token: string | null
  unsubscribe_token: string | null
  subscribed_at: string
}

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE'
  table: string
  record: SubscriberRecord
  old_record: SubscriberRecord | null
  schema: string
}

// ---------------------------------------------------------------------------
// Email helpers
// ---------------------------------------------------------------------------

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildConfirmationEmail(
  email: string,
  verificationToken: string,
  unsubscribeToken: string | null,
  siteUrl: string,
  brandName: string,
): { subject: string; html: string; text: string } {
  const confirmUrl = `${siteUrl}/api/newsletter/verify?token=${verificationToken}`
  const unsubscribeUrl = unsubscribeToken
    ? `${siteUrl}/api/newsletter/unsubscribe?token=${unsubscribeToken}`
    : null
  const year = new Date().getFullYear()
  const brand = brandName.trim() || 'Music Label'
  const brandHtml = escapeHtml(brand)

  const subject = `Please confirm your ${brand} newsletter subscription`

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#101010;font-family:system-ui,sans-serif;color:#ffffff;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:40px auto;background:#292929;border-radius:8px;overflow:hidden;">
    <tr>
      <td style="padding:32px 40px;text-align:center;background:#101010;border-bottom:1px solid #383838;">
        <h1 style="margin:0;font-size:24px;letter-spacing:4px;text-transform:uppercase;color:#ffffff;">${brandHtml}</h1>
      </td>
    </tr>
    <tr>
      <td style="padding:40px;">
        <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Confirm your subscription</h2>
        <p style="margin:0 0 24px;color:#aaaaaa;line-height:1.6;">
          Thanks for signing up! To complete your subscription and start receiving
          updates about new releases, tour dates, and exclusive content, please
          click the button below.
        </p>
        <div style="text-align:center;margin:32px 0;">
          <a href="${confirmUrl}"
             style="display:inline-block;padding:14px 32px;background:#493687;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:700;font-size:15px;text-transform:uppercase;letter-spacing:1px;">
            Confirm Subscription
          </a>
        </div>
        <p style="margin:24px 0 0;color:#666666;font-size:13px;line-height:1.6;">
          If the button doesn't work, copy and paste this link into your browser:<br />
          <a href="${confirmUrl}" style="color:#493687;word-break:break-all;">${confirmUrl}</a>
        </p>
        <p style="margin:16px 0 0;color:#666666;font-size:12px;">
          This link expires in 7 days. If you didn't sign up for the ${brandHtml} newsletter, you can safely ignore this email.
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:24px 40px;border-top:1px solid #383838;text-align:center;">
        <p style="margin:0;color:#555555;font-size:12px;">
          &copy; ${year} ${brandHtml}. All rights reserved.
        </p>
        ${unsubscribeUrl ? `<p style="margin:8px 0 0;font-size:11px;color:#444444;">
          <a href="${unsubscribeUrl}" style="color:#444444;">Unsubscribe</a>
        </p>` : ''}
      </td>
    </tr>
  </table>
</body>
</html>`

  const unsubscribeFooter = unsubscribeUrl
    ? `\n\nTo unsubscribe at any time, visit: ${unsubscribeUrl}`
    : ''

  const text = `${brand} Newsletter — Confirm your subscription

Thanks for signing up! Please click the link below to confirm your subscription:

${confirmUrl}

This link expires in 7 days. If you didn't sign up, you can safely ignore this email.${unsubscribeFooter}

— ${brand}`

  return { subject, html, text }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  // Only accept POST requests from Supabase webhooks
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  let payload: WebhookPayload
  try {
    payload = (await req.json()) as WebhookPayload
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  // Only process INSERTs on newsletter_subscribers
  if (payload.type !== 'INSERT' || payload.table !== 'newsletter_subscribers') {
    return new Response('Ignored', { status: 200 })
  }

  const { record } = payload

  // Idempotency: skip already-subscribed rows (e.g. webhook replay)
  if (record.status !== 'pending' || !record.verification_token) {
    return new Response('Skipped', { status: 200 })
  }

  // Read required secrets from environment (SSOT: TENANT_* matches app tenantDefaults)
  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  const fromEmail = Deno.env.get('RESEND_FROM_EMAIL')?.trim()
  const siteUrl = (
    Deno.env.get('NEXT_PUBLIC_SITE_URL') ??
    Deno.env.get('SITE_URL') ??
    ''
  ).replace(/\/$/, '')
  const brandName =
    Deno.env.get('TENANT_LABEL_NAME')?.trim() ||
    Deno.env.get('BRAND_LABEL_NAME')?.trim() ||
    Deno.env.get('LABEL_NAME')?.trim() ||
    'Music Label'

  if (!resendApiKey) {
    console.error('[newsletter-confirm] RESEND_API_KEY is not set')
    return new Response('Email service not configured', { status: 503 })
  }
  if (!fromEmail) {
    console.error('[newsletter-confirm] RESEND_FROM_EMAIL is not set')
    return new Response('From address not configured', { status: 503 })
  }
  if (!siteUrl) {
    console.error('[newsletter-confirm] NEXT_PUBLIC_SITE_URL / SITE_URL is not set')
    return new Response('Site URL not configured', { status: 503 })
  }

  const { subject, html, text } = buildConfirmationEmail(
    record.email,
    record.verification_token,
    record.unsubscribe_token,
    siteUrl,
    brandName,
  )

  // Send via Resend API
  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${resendApiKey}`,
    },
    body: JSON.stringify({
      from: `${brandName} <${fromEmail}>`,
      to: [record.email],
      subject,
      html,
      text,
    }),
  })

  if (!resendRes.ok) {
    const errorText = await resendRes.text()
    console.error(`[newsletter-confirm] Resend error ${resendRes.status}: ${errorText}`)
    return new Response('Email delivery failed', { status: 502 })
  }

  const resendData = await resendRes.json() as { id?: string }
  console.log(`[newsletter-confirm] Confirmation email sent to ${record.email} (id: ${resendData.id ?? 'unknown'})`)

  return new Response(JSON.stringify({ sent: true, emailId: resendData.id }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
