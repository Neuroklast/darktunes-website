/**
 * GET  /api/admin/api-credentials — list credential status (no plaintext)
 * PUT  /api/admin/api-credentials — upsert one credential (encrypt server-side)
 */

import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { withErrorHandler, ApiError } from '@/lib/errors'
import { extractBearerToken, verifyAdmin } from '@/lib/adminAuth'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import { listCredentialStatus, upsertCredential } from '@/lib/api/apiCredentials'
import { isAllowedCredentialKey } from '@/lib/secrets/credentialKeys'
import { invalidateCredentialCache } from '@/lib/secrets/getExternalCredentials'
import { invalidateAiHealthForCredential } from '@/lib/ai/provider/invalidateHealth'

export const GET = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const token = extractBearerToken(req.headers.get('authorization'))
  await verifyAdmin(token)

  const db = await createServiceRoleSupabaseClient()
  const credentials = await listCredentialStatus(db)
  return NextResponse.json({ credentials })
})

export const PUT = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const token = extractBearerToken(req.headers.get('authorization'))
  const userId = await verifyAdmin(token)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    throw new ApiError(400, 'Invalid JSON body')
  }

  const key = (body as Record<string, unknown>)?.key
  const value = (body as Record<string, unknown>)?.value

  if (typeof key !== 'string' || !isAllowedCredentialKey(key)) {
    throw new ApiError(400, 'Invalid or unknown credential key')
  }
  if (typeof value !== 'string') {
    throw new ApiError(400, 'value must be a string')
  }

  const db = await createServiceRoleSupabaseClient()
  await upsertCredential(db, { key, value, updatedBy: userId })
  invalidateCredentialCache()
  await invalidateAiHealthForCredential(db, key)
  // Health dashboard caches known-api configuration; bust so Apify/etc. show as configured.
  revalidateTag('health-snapshot', 'max')

  const credentials = await listCredentialStatus(db)
  return NextResponse.json({ credentials })
})