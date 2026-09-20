/**
 * POST /api/admin/users/:id/resend-invite
 *
 * Re-issues a durable invite (new link) for a user who has not signed in yet.
 * Security: admin only + rate limit + audit log.
 */

import { NextRequest, NextResponse } from 'next/server'
import { resendUserInvite } from '@/lib/auth/requestUserInvite'
import {
  assertUuid,
  enforceAdminInviteRateLimit,
  throwIfInviteFailed,
} from '@/lib/auth/inviteAdmin'
import { requireAdminWithServiceClient } from '@/lib/adminAuth'
import { logAdminActionForRequest } from '@/lib/adminAuditLog'
import { withErrorHandler } from '@/lib/errors'
import { getClientIp } from '@/lib/ipRateLimit'
import { getEmailCredentials } from '@/lib/secrets/getExternalCredentials'

function extractUserId(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split('/')
  return segments[4] ?? ''
}

export const POST = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const { userId: adminUserId, serviceClient: adminClient } = await requireAdminWithServiceClient(req)
  await enforceAdminInviteRateLimit(req, adminUserId)

  const targetUserId = assertUuid(extractUserId(req), 'user id')

  const { resendApiKey, resendFromEmail } = await getEmailCredentials(adminClient)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://darktunes.com'

  const result = await resendUserInvite(
    adminClient,
    { userId: targetUserId, grantedBy: adminUserId },
    {
      resendApiKey,
      resendFromEmail: resendFromEmail ?? 'noreply@darktunes.com',
      siteUrl,
      fetch,
    },
  )

  throwIfInviteFailed(result)

  await logAdminActionForRequest(req, adminClient, {
    actorId: adminUserId,
    action: 'user.resend_invite',
    resource: 'users',
    resourceId: targetUserId,
    details: { channel: result.channel, expiresAt: result.expiresAt ?? null },
    ipAddress: getClientIp(req),
  })

  return NextResponse.json({
    ok: true,
    channel: result.channel,
    expiresAt: result.expiresAt ?? null,
  })
})
