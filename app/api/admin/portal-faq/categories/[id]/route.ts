import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withErrorHandler } from '@/lib/errors'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import { requireAdminOrEditorFromRequest } from '@/lib/adminAuth'
import { deletePortalFaqCategory, updatePortalFaqCategory } from '@/lib/api/portalFaq'

const patchSchema = z.object({
  slug: z.string().min(1).max(120).optional(),
  title_en: z.string().min(1).optional(),
  title_de: z.string().nullable().optional(),
  sort_order: z.number().int().optional(),
  is_published: z.boolean().optional(),
})

function extractId(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split('/')
  return segments[segments.length - 1]
}

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const { organizationId } = await requireAdminOrEditorFromRequest(req)
  const supabase = await createServiceRoleSupabaseClient()
  const id = extractId(req)
  const body = patchSchema.parse(await req.json())
  const category = await updatePortalFaqCategory(supabase, id, body, organizationId)
  return NextResponse.json(category)
})

export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const { organizationId } = await requireAdminOrEditorFromRequest(req)
  const supabase = await createServiceRoleSupabaseClient()
  const id = extractId(req)
  await deletePortalFaqCategory(supabase, id, organizationId)
  return NextResponse.json({ deleted: true })
})
