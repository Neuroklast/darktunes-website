'use server'

import { createServerSupabaseClient, createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import { getRequestOrganizationId } from '@/lib/organizations/requestContext'
import { isPressApplicationsEnabled } from '@/lib/pressAccess'
import { getEmailCredentials } from '@/lib/secrets/getExternalCredentials'
import { validatePassword } from '@/lib/auth/passwordPolicy'

async function sendPressApplicationNotification(data: {
  name: string
  email: string
  publication: string
}): Promise<void> {
  const serviceDb = await createServiceRoleSupabaseClient()
  const { resendApiKey, resendFromEmail } = await getEmailCredentials(serviceDb)
  const fromEmail = resendFromEmail ?? 'noreply@darktunes.com'
  const adminEmail = process.env.CONTACT_EMAIL ?? 'info@darktunes.com'
  if (!resendApiKey) return

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://darktunes.com'

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + resendApiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: adminEmail,
      subject: 'New Press Application: ' + data.name + ' (' + data.publication + ')',
      html:
        '<p>A new press portal application has been submitted.</p>' +
        '<ul>' +
        '<li><strong>Name:</strong> ' + data.name + '</li>' +
        '<li><strong>Email:</strong> ' + data.email + '</li>' +
        '<li><strong>Publication:</strong> ' + data.publication + '</li>' +
        '</ul>' +
        '<p><a href="' + siteUrl + '/admin/accreditations">Review in Admin →</a></p>',
    }),
  })
}

export async function submitPressApplication(data: {
  name: string
  email: string
  password: string
  publication: string
  website: string
  reason: string
}): Promise<{ status: 'pending' | 'error'; message?: string }> {
  try {
    const policy = validatePassword(data.password)
    if (!policy.ok) {
      return { status: 'error', message: policy.message }
    }

    const supabase = await createServerSupabaseClient()
    const organizationId = await getRequestOrganizationId().catch(() => undefined)
    const applicationsEnabled = await isPressApplicationsEnabled(supabase, organizationId)
    if (!applicationsEnabled) return { status: 'error', message: 'disabled' }

    const { data: authData, error: signUpError } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: {
          full_name: data.name,
        },
      },
    })
    if (signUpError) {
      if (signUpError.message.toLowerCase().includes('already registered')) {
        return { status: 'error', message: 'emailInUse' }
      }
      return { status: 'error', message: signUpError.message }
    }
    if (authData.user) {
      const { error: insertError } = await supabase.from('journalist_applications').insert({
        user_id: authData.user.id,
        email: data.email,
        name: data.name,
        outlet: data.publication,
        website_url: data.website || null,
        reason: data.reason || null,
      })

      if (insertError) {
        // Roll back the auth user to avoid orphaned accounts that can log in
        // but have no application record and will never receive a status.
        try {
          const serviceRole = await createServiceRoleSupabaseClient()
          await serviceRole.auth.admin.deleteUser(authData.user.id)
        } catch (cleanupErr) {
          console.error(
            '[apply] Failed to clean up auth user after failed application insert:',
            cleanupErr,
          )
        }
        return { status: 'error', message: insertError.message }
      }

      // Notify admin via email. Failure is non-critical but must be logged
      // so the label operator is aware when notifications stop working.
      await sendPressApplicationNotification({
        name: data.name,
        email: data.email,
        publication: data.publication,
      }).catch((err: unknown) => {
        console.error('[apply] Failed to send press application notification email:', err)
      })
    }
    return { status: 'pending' }
  } catch {
    return { status: 'error' }
  }
}
