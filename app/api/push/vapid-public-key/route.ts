/**
 * GET /api/push/vapid-public-key
 * Public VAPID key for browser PushManager.subscribe (safe to expose).
 */

import { NextResponse } from 'next/server'
import { withErrorHandler } from '@/lib/errors'
import { getVapidPublicKey, isWebPushConfigured } from '@/lib/push/vapid'

export const GET = withErrorHandler(async (): Promise<NextResponse> => {
  const configured = isWebPushConfigured()
  return NextResponse.json({
    configured,
    publicKey: configured ? getVapidPublicKey() : null,
  })
})
