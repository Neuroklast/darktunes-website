import { NextRequest, NextResponse } from 'next/server'
import { batchDeleteAssets } from '@/lib/api/assets'
import { requireAdminOrEditorFromRequest } from '@/lib/adminAuth'
import { ApiError, withErrorHandler } from '@/lib/errors'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { deleteR2Objects, getAssetsForDeletion } from '../_utils'

interface BatchDeleteBody {
  ids?: string[]
}

export const DELETE = withErrorHandler(async (request: NextRequest): Promise<NextResponse> => {
  const { organizationId } = await requireAdminOrEditorFromRequest(request)

  const body = (await request.json()) as BatchDeleteBody
  const ids = body.ids?.filter((id): id is string => typeof id === 'string' && id.length > 0) ?? []
  if (ids.length === 0) throw new ApiError(400, 'At least one asset id is required')

  const supabase = await createServerSupabaseClient()
  const assets = await getAssetsForDeletion(supabase, ids)

  await deleteR2Objects(assets, organizationId)
  await batchDeleteAssets(supabase, ids)

  return NextResponse.json({ success: true, deleted: assets.length })
})
