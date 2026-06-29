import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withErrorHandler } from '@/lib/errors'
import { extractBearerToken, verifyAdminOrEditor } from '@/lib/adminAuth'
import { enqueueOrganizationWebhook } from '@/lib/partner-api/webhooks'

const bodySchema = z.object({
  organizationId: z.string().uuid(),
  event: z.enum(['artist.created']),
  data: z.record(z.string(), z.unknown()),
})

/** Internal admin route to emit partner webhooks from client-side CMS mutations. */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const token = extractBearerToken(req.headers.get('authorization'))
  await verifyAdminOrEditor(token)
  const body = bodySchema.parse(await req.json())

  void enqueueOrganizationWebhook(body.organizationId, body.event, body.data)
  return NextResponse.json({ ok: true })
})