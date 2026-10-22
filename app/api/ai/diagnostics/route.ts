/**
 * POST /api/ai/diagnostics — classify a known error for the caller.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { ApiError, withErrorHandler } from '@/lib/errors'
import { requireAiActor } from '@/lib/ai/auth/requireAiActor'
import { classifyError } from '@/lib/ai/diagnostics/classify'
import { projectDiagnosticRecord } from '@/lib/ai/diagnostics/project'

const bodySchema = z.object({
  error_id: z.string().min(3).max(80).optional(),
  fingerprint: z.string().min(3).max(200).optional(),
})

export const POST = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const actor = await requireAiActor(req)
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    throw new ApiError(400, 'Invalid JSON body')
  }
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) throw new ApiError(400, 'Provide error_id or fingerprint', 'VALIDATION_ERROR')
  if (!parsed.data.error_id && !parsed.data.fingerprint) {
    throw new ApiError(400, 'Provide error_id or fingerprint', 'VALIDATION_ERROR')
  }

  let query = actor.serviceDb.from('app_logs').select('*').limit(1)
  if (parsed.data.fingerprint) query = query.eq('fingerprint', parsed.data.fingerprint)
  if (parsed.data.error_id) query = query.ilike('message', `%${parsed.data.error_id}%`)
  if (actor.role === 'artist') query = query.eq('user_id', actor.userId)

  const { data, error } = await query.maybeSingle()
  if (error) throw new ApiError(500, 'The error log could not be read.', 'DB_ERROR')
  if (!data) throw new ApiError(404, 'No matching error was found.', 'NOT_FOUND')

  const classification = classifyError({
    httpStatus: data.http_status,
    message: data.message,
    source: data.source,
  })
  return NextResponse.json({
    classification,
    record: projectDiagnosticRecord({
      ...data,
      error_id: parsed.data.error_id ?? null,
      fingerprint: data.fingerprint,
      route: data.route_path,
      http_status: data.http_status,
      operation: data.operation,
      deployment_id: data.deployment_id,
      occurrences: data.occurrences,
    }),
  })
})
