import { NextRequest, NextResponse } from 'next/server'
import { batchDeleteAssets } from '@/lib/api/assets'
import { deleteFolder, getFolders, moveFolder, renameFolder } from '@/lib/api/assetFolders'
import { requireAdminOrEditorFromRequest } from '@/lib/adminAuth'
import { ApiError, withErrorHandler } from '@/lib/errors'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { collectDescendantFolderIds, deleteR2Objects, getAssetsInFolders } from '../../_utils'

interface PatchFolderBody {
  name?: string
  parentId?: string | null
}

function extractId(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split('/')
  return segments[segments.length - 1]
}

function isDescendant(targetId: string, folderId: string, folders: Awaited<ReturnType<typeof getFolders>>): boolean {
  let currentId: string | null = targetId
  while (currentId) {
    if (currentId === folderId) return true
    currentId = folders.find((folder) => folder.id === currentId)?.parentId ?? null
  }
  return false
}

export const PATCH = withErrorHandler(async (request: NextRequest): Promise<NextResponse> => {
  const { organizationId } = await requireAdminOrEditorFromRequest(request)

  const id = extractId(request)
  if (!id) throw new ApiError(400, 'Missing folder id')

  const body = (await request.json()) as PatchFolderBody
  const supabase = await createServerSupabaseClient()

  let folder = null
  if (typeof body.name === 'string') {
    const name = body.name.trim()
    if (!name) throw new ApiError(400, 'Folder name is required')
    folder = await renameFolder(supabase, id, name)
  }

  if ('parentId' in body) {
    if (body.parentId === id) throw new ApiError(400, 'Folder cannot be moved into itself')
    if (body.parentId) {
      const folders = await getFolders(supabase, organizationId)
      if (isDescendant(body.parentId, id, folders)) {
        throw new ApiError(400, 'Folder cannot be moved into one of its descendants')
      }
    }
    folder = await moveFolder(supabase, id, body.parentId ?? null)
  }

  if (!folder) throw new ApiError(400, 'No folder changes provided')

  return NextResponse.json({ folder })
})

export const DELETE = withErrorHandler(async (request: NextRequest): Promise<NextResponse> => {
  await requireAdminOrEditorFromRequest(request)

  const id = extractId(request)
  if (!id) throw new ApiError(400, 'Missing folder id')

  const supabase = await createServerSupabaseClient()
  const folderIds = await collectDescendantFolderIds(supabase, id)
  const assets = await getAssetsInFolders(supabase, folderIds)

  await deleteR2Objects(assets)
  await batchDeleteAssets(supabase, assets.map((asset) => asset.id))
  await deleteFolder(supabase, id)

  return NextResponse.json({ success: true, deletedAssets: assets.length, deletedFolders: folderIds.length })
})
