/**
 * DELETE /api/admin/api-credentials/[key] — remove a stored credential
 */

import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { withErrorHandler, ApiError } from '@/lib/errors'
import { extractBearerToken, verifyAdmin } from '@/lib/adminAuth'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import { deleteCredential } from '@/lib/api/apiCredentials'
import { isAllowedCredentialKey, type CredentialKey } from '@/lib/secrets/credentialKeys'
import { invalidateCredentialCache } from '@/lib/secrets/getExternalCredentials'
import { invalidateAiHealthForCredential } from '@/lib/ai/provider/invalidateHealth'

function extractKey(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split('/')
  return decodeURIComponent(segments[segments.length - 1])
}

export const DELETE = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const token = extractBearerToken(req.headers.get('authorization'))
  await verifyAdmin(token)

  const key = extractKey(req)
  if (!isAllowedCredentialKey(key)) {
    throw new ApiError(400, 'Invalid or unknown credential key')
  }

  const db = await createServiceRoleSupabaseClient()
  await deleteCredential(db, key as CredentialKey)
  invalidateCredentialCache()
  await invalidateAiHealthForCredential(db, key)
  revalidateTag('health-snapshot', 'max')

  return NextResponse.json({ success: true })
})