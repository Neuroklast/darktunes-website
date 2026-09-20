/**
 * POST /api/admin/users/invite
 * Security: admin only (Bearer or cookie dual auth) + rate limit + audit log.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requestUserInvite } from '@/lib/auth/requestUserInvite'
import {
  enforceAdminInviteRateLimit,
  inviteEmailSchema,
  parseInvitableRole,
  throwIfInviteFailed,
} from '@/lib/auth/inviteAdmin'
import { requireAdminWithServiceClient } from '@/lib/adminAuth'
import { logAdminActionForRequest } from '@/lib/adminAuditLog'
import { ApiError, withErrorHandler } from '@/lib/errors'
import { getClientIp } from '@/lib/ipRateLimit'
import { getEmailCredentials } from '@/lib/secrets/getExternalCredentials'

export const POST = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const { userId, serviceClient: adminClient } = await requireAdminWithServiceClient(req)
  await enforceAdminInviteRateLimit(req, userId)

  let body: Record<string, unknown> = {}
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    throw new ApiError(400, 'Invalid JSON body')
  }

  const emailParsed = inviteEmailSchema.safeParse(body.email)
  if (!emailParsed.success) {
    throw new ApiError(400, emailParsed.error.issues[0]?.message ?? 'email is required')
  }
  const email = emailParsed.data

  const roleRaw = typeof body.role === 'string' ? body.role.trim() : ''
  if (!roleRaw) throw new ApiError(400, 'role is required')
  const role = parseInvitableRole(roleRaw)

  const { resendApiKey, resendFromEmail } = await getEmailCredentials(adminClient)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://darktunes.com'

  const result = await requestUserInvite(
    adminClient,
    {
      email,
      role,
      grantedBy: userId,
    },
    {
      resendApiKey,
      resendFromEmail: resendFromEmail ?? 'noreply@darktunes.com',
      siteUrl,
      fetch,
    },
  )

  throwIfInviteFailed(result, { emailForConflict: email })

  await logAdminActionForRequest(req, adminClient, {
    actorId: userId,
    action: 'user.invite',
    resource: 'users',
    resourceId: result.userId ?? null,
    details: { email, role, channel: result.channel, expiresAt: result.expiresAt ?? null },
    ipAddress: getClientIp(req),
  })

  return NextResponse.json({
    ok: true,
    email,
    channel: result.channel,
    expiresAt: result.expiresAt ?? null,
  })
})
