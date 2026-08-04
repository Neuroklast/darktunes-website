import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSiteSettings } from '@/lib/api/siteSettings'
import { DEFAULT_PORTAL_TERMS_VERSION } from '@/lib/legal/defaults'
import { ApiError, withErrorHandler } from '@/lib/errors'
import { portalMemberWrite, withPortalMembershipWrite } from '@/lib/portal/withPortalMembership'

const bodySchema = z.object({
  artist_id: z.string().uuid(),
  accepted: z.literal(true),
})

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body: unknown = await req.json()
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    throw new ApiError(400, parsed.error.issues.map((i) => i.message).join('; '))
  }

  const ctx = await withPortalMembershipWrite(req, parsed.data.artist_id)
  const settings = await portalMemberWrite(
    ctx,
    { route: 'POST /api/portal/accept-terms', table: 'site_settings', operation: 'select' },
    (db) => getSiteSettings(db),
  ).then((r) => r.value)

  const version = settings.portalTermsVersion?.trim() || DEFAULT_PORTAL_TERMS_VERSION
  const now = new Date().toISOString()

  await portalMemberWrite(
    ctx,
    { route: 'POST /api/portal/accept-terms', table: 'artists', operation: 'update' },
    async (db) => {
      const { error } = await db
        .from('artists')
        .update({
          portal_terms_version: version,
          portal_terms_accepted_at: now,
          portal_terms_accepted_by: ctx.user.id,
        })
        .eq('id', ctx.artist.id)
      if (error) throw new Error(error.message)
    },
  )

  return NextResponse.json({
    ok: true,
    portalTermsVersion: version,
    portalTermsAcceptedAt: now,
  })
})
