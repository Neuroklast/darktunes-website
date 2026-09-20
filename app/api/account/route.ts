/**
 * app/api/account/route.ts
 *
 * DELETE /api/account
 * Authenticated users can request soft-deletion of their own account.
 *
 * Behaviour:
 *   - Validates the user is not an admin (admins must be deleted manually)
 *   - Sets profiles.deleted_at = NOW()
 *   - Anonymises the stored email to deleted-{userId}@anonymized.local
 *   - Bans the auth user to prevent further sign-ins (grace period)
 *   - Logs the deletion request in app_logs
 *
 * The actual auth.users row is intentionally kept during the grace period
 * (7 days). A scheduled job or manual admin action removes it afterwards.
 */

import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import { ApiError, withErrorHandler } from '@/lib/errors'
import { softDeleteAccount } from '@/lib/api/users'
import { writeAppLog } from '@/lib/appLog'

export const DELETE = withErrorHandler(async (): Promise<NextResponse> => {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) throw new ApiError(401, 'Unauthorized')

  // 1. Check current role — admins cannot use self-service deletion
  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('role, deleted_at')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) throw new ApiError(404, 'Profile not found')
  if (profile.role === 'admin') {
    throw new ApiError(403, 'Admin accounts cannot be deleted via self-service. Contact your system administrator.')
  }
  if (profile.deleted_at) {
    throw new ApiError(409, 'Account is already scheduled for deletion.')
  }

  // 2. Perform soft-delete (requires service-role to update auth user)
  const adminClient = await createServiceRoleSupabaseClient()
  await softDeleteAccount(adminClient, user.id)

  // 3. Log for compliance auditing
  await writeAppLog({
    source: 'gdpr-deletion',
    level: 'info',
    message: 'User account deletion requested',
    userId: user.id,
    details: { role: profile.role },
  })

  return NextResponse.json({ success: true, message: 'Your account has been scheduled for deletion. You will be signed out shortly.' })
})
