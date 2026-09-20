/**
 * POST /api/admin/artists/:id/invite
 *
 * Sends or re-sends a branded portal invite for a roster artist.
 *
 * - No linked user → create invite + link
 * - Linked user who never signed in → resend new link (revokes previous)
 * - Linked user who already signed in → 409
 *
 * Security: admin only + rate limit + audit log.
 */

import { requireAdminWithServiceClient } from '@/lib/adminAuth'
import { logAdminActionForRequest } from '@/lib/adminAuditLog'
import {
  assertUuid,
  enforceAdminInviteRateLimit,
  inviteEmailSchema,
  throwIfInviteFailed,
} from '@/lib/auth/inviteAdmin'
import { inviteOrResendArtist } from '@/lib/auth/requestUserInvite'
import { ApiError, withErrorHandler } from '@/lib/errors'
import { getClientIp } from '@/lib/ipRateLimit'
import { getEmailCredentials } from '@/lib/secrets/getExternalCredentials'
import { NextRequest, NextResponse } from 'next/server'

function extractArtistId(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split('/')
  return segments[4] ?? ''
}

export const POST = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const { userId: currentUserId, serviceClient: adminClient } = await requireAdminWithServiceClient(req)
  await enforceAdminInviteRateLimit(req, currentUserId)

  const artistId = assertUuid(extractArtistId(req), 'artist id')

  let emailOverride: string | null = null
  try {
    const body = (await req.json()) as Record<string, unknown>
    if (typeof body.email === 'string' && body.email.trim()) {
      const parsed = inviteEmailSchema.safeParse(body.email)
      if (!parsed.success) throw new ApiError(400, 'Invalid email address')
      emailOverride = parsed.data
    }
  } catch (err) {
    if (err instanceof ApiError) throw err
    // body optional
  }

  const { resendApiKey, resendFromEmail } = await getEmailCredentials(adminClient)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://darktunes.com'

  const result = await inviteOrResendArtist(
    adminClient,
    {
      artistId,
      grantedBy: currentUserId,
      emailOverride,
    },
    {
      resendApiKey,
      resendFromEmail: resendFromEmail ?? 'noreply@darktunes.com',
      siteUrl,
      fetch,
    },
  )

  if (result.error?.includes('has no email address')) {
    throw new ApiError(400, result.error)
  }

  throwIfInviteFailed(result, { emailForConflict: result.email })

  await logAdminActionForRequest(req, adminClient, {
    actorId: currentUserId,
    action: result.mode === 'resend' ? 'artist.resend_invite' : 'artist.invite',
    resource: 'artists',
    resourceId: artistId,
    details: {
      email: result.email,
      channel: result.channel,
      mode: result.mode,
      expiresAt: result.expiresAt ?? null,
      userId: result.userId ?? null,
    },
    ipAddress: getClientIp(req),
  })

  return NextResponse.json({
    ok: true,
    email: result.email,
    channel: result.channel,
    mode: result.mode ?? 'invite',
    expiresAt: result.expiresAt ?? null,
  })
})
