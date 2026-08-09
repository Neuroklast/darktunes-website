'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getRequestOrganizationId } from '@/lib/organizations/requestContext'
import { getFeatureFlagsForRole } from '@/lib/api/featureFlags'
import { logServerActionError } from '@/lib/logServerActionError'

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export async function sendPressInquiry(data: {
  subject: string
  body: string
}): Promise<{ success: boolean }> {
  let userId: string | undefined
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { success: false }
    userId = user.id

    const flags = await getFeatureFlagsForRole(supabase, 'journalist', await getRequestOrganizationId().catch(() => undefined)).catch(() => ({} as Record<string, boolean>))
    if (flags['press.contact'] === false) return { success: false }

    const { error } = await supabase.from('app_logs').insert({
      source: 'press_inquiry',
      level: 'info',
      message: `[${data.subject}] ${data.body}`,
      details: {
        body_html: `<p>${escapeHtml(data.body).replace(/\n+/g, '</p><p>')}</p>`,
        subject: data.subject,
        user_email: user.email ?? '',
      },
      user_id: user.id,
    })

    if (error) {
      await logServerActionError('press.sendInquiry', error, userId)
      return { success: false }
    }

    return { success: true }
  } catch (err) {
    await logServerActionError('press.sendInquiry', err, userId)
    return { success: false }
  }
}
