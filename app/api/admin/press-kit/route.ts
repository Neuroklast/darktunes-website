import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { addToPressKit, getPressKitItems } from '@/lib/api/pressKit'
import { requireAdminOrEditorFromRequest } from '@/lib/adminAuth'
import { ApiError, withErrorHandler } from '@/lib/errors'
import { createServerSupabaseClient } from '@/lib/supabase/server'

interface AddPressKitBody {
  assetId?: string
  artistId?: string | null
  displayOrder?: number
}

export const GET = withErrorHandler(async (request: NextRequest): Promise<NextResponse> => {
  const { organizationId } = await requireAdminOrEditorFromRequest(request)

  const supabase = await createServerSupabaseClient()
  const { searchParams } = new URL(request.url)
  const artistIdParam = searchParams.get('artistId')

  const items =
    artistIdParam === 'label'
      ? await getPressKitItems(supabase, null, organizationId)
      : artistIdParam
        ? await getPressKitItems(supabase, artistIdParam, organizationId)
        : await getPressKitItems(supabase, undefined, organizationId)

  return NextResponse.json({ items })
})

export const POST = withErrorHandler(async (request: NextRequest): Promise<NextResponse> => {
  const { organizationId } = await requireAdminOrEditorFromRequest(request)

  const body = (await request.json()) as AddPressKitBody
  if (!body.assetId) throw new ApiError(400, 'assetId is required')

  const artistId = body.artistId === undefined ? null : body.artistId

  const supabase = await createServerSupabaseClient()

  // Asset must belong to this organization
  const { data: asset } = await supabase
    .from('assets')
    .select('id, organization_id')
    .eq('id', body.assetId)
    .maybeSingle()
  if (!asset) throw new ApiError(404, 'Asset not found')
  if (asset.organization_id && asset.organization_id !== organizationId) {
    throw new ApiError(403, 'Asset not in this organization')
  }
  if (artistId) {
    const { data: artist } = await supabase
      .from('artists')
      .select('id, organization_id')
      .eq('id', artistId)
      .maybeSingle()
    if (!artist) throw new ApiError(404, 'Artist not found')
    if (artist.organization_id && artist.organization_id !== organizationId) {
      throw new ApiError(403, 'Artist not in this organization')
    }
  }

  const item = await addToPressKit(supabase, {
    assetId: body.assetId,
    artistId,
    displayOrder: body.displayOrder,
  })

  revalidateTag('press-kit', 'max')

  return NextResponse.json({ item }, { status: 201 })
})