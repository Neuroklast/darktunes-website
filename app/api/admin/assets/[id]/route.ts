import { NextRequest, NextResponse } from 'next/server'
import { deleteAssetRecord, updateAsset } from '@/lib/api/assets'
import { extractBearerToken, requireAdminOrEditorFromRequest, verifyPermission } from '@/lib/adminAuth'
import { ApiError, withErrorHandler } from '@/lib/errors'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { deleteR2Objects, getAssetsForDeletion } from '../_utils'

interface PatchAssetBody {
  folderId?: string | null
  artistId?: string | null
  artistIds?: string[]
  releaseId?: string | null
  tags?: string[]
  originalFilename?: string
  altText?: string | null
  isPressApproved?: boolean
  pressSuggested?: boolean
  pressCategory?: string | null
  pressCaption?: string | null
  photographerCredit?: string | null
  downloadableForPress?: boolean
}

function extractId(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split('/')
  return segments[segments.length - 1]
}

export const PATCH = withErrorHandler(async (request: NextRequest): Promise<NextResponse> => {
  const token = extractBearerToken(request.headers.get('authorization'))
  await verifyPermission(token, 'can_view_admin_panel')

  const id = extractId(request)
  if (!id) throw new ApiError(400, 'Missing asset id')

  const body = (await request.json()) as PatchAssetBody
  const updates: PatchAssetBody = {}
  if ('folderId' in body) updates.folderId = body.folderId ?? null
  if ('artistId' in body) updates.artistId = body.artistId ?? null
  if ('artistIds' in body) updates.artistIds = body.artistIds ?? []
  if ('releaseId' in body) updates.releaseId = body.releaseId ?? null
  if ('tags' in body) updates.tags = body.tags ?? []
  if ('originalFilename' in body) updates.originalFilename = body.originalFilename?.trim() ?? ''
  if ('altText' in body) updates.altText = body.altText ?? null
  if ('isPressApproved' in body) updates.isPressApproved = body.isPressApproved ?? false
  if ('pressSuggested' in body) updates.pressSuggested = body.pressSuggested ?? false
  if ('pressCategory' in body) updates.pressCategory = body.pressCategory ?? null
  if ('pressCaption' in body) updates.pressCaption = body.pressCaption ?? null
  if ('photographerCredit' in body) updates.photographerCredit = body.photographerCredit ?? null
  if ('downloadableForPress' in body) updates.downloadableForPress = body.downloadableForPress ?? true
  if (Object.keys(updates).length === 0) throw new ApiError(400, 'No asset changes provided')

  const supabase = await createServerSupabaseClient()
  const asset = await updateAsset(supabase, id, updates)

  return NextResponse.json({ asset })
})

export const DELETE = withErrorHandler(async (request: NextRequest): Promise<NextResponse> => {
  const { organizationId } = await requireAdminOrEditorFromRequest(request)

  const id = extractId(request)
  if (!id) throw new ApiError(400, 'Missing asset id')

  const supabase = await createServerSupabaseClient()
  const assets = await getAssetsForDeletion(supabase, [id])
  const asset = assets[0]
  if (!asset) throw new ApiError(404, 'Asset not found')

  await deleteR2Objects([asset], organizationId)
  await deleteAssetRecord(supabase, id)

  return NextResponse.json({ success: true })
})
