/**
 * app/api/admin/genres/route.ts
 *
 * Central genre catalogue management.
 *
 * GET    /api/admin/genres        — list all genres (public, no auth required)
 * POST   /api/admin/genres        — create a genre (admin/editor auth required)
 * DELETE /api/admin/genres?id=<id> — delete a genre (admin/editor auth required)
 *
 * @api-public GET — intentional public catalogue for portal profile genre picker
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withErrorHandler, ApiError } from '@/lib/errors'
import { requireAdminOrEditorFromRequest } from '@/lib/adminAuth'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { listGenres, createGenre, deleteGenre } from '@/lib/api/genres'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { getRequestOrganizationId } from '@/lib/organizations/requestContext'

const createSchema = z.object({
  name: z.string().min(1).max(100),
})

export const GET = withErrorHandler(async () => {
  // Public read — no auth required. Uses cookie-free client for caching safety.
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
  const organizationId = await getRequestOrganizationId()
  const genres = await listGenres(supabase, organizationId)
  return NextResponse.json(genres)
})

export const POST = withErrorHandler(async (req: NextRequest) => {
  const { organizationId } = await requireAdminOrEditorFromRequest(req)

  const body = createSchema.parse(await req.json())
  const supabase = await createServerSupabaseClient()
  const genre = await createGenre(supabase, body.name, organizationId)
  return NextResponse.json(genre, { status: 201 })
})

export const DELETE = withErrorHandler(async (req: NextRequest) => {
  await requireAdminOrEditorFromRequest(req)

  const id = req.nextUrl.searchParams.get('id')
  if (!id) throw new ApiError(400, 'Missing genre id')

  const supabase = await createServerSupabaseClient()
  await deleteGenre(supabase, id)
  return NextResponse.json({ success: true })
})
