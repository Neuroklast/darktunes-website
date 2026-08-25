import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withErrorHandler } from '@/lib/errors'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import { requireAdminOrEditorFromRequest } from '@/lib/adminAuth'
import { getAllPortalFaqCategories, upsertPortalFaqCategory } from '@/lib/api/portalFaq'

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  slug: z.string().min(1).max(120),
  title_en: z.string().min(1),
  title_de: z.string().nullable().optional(),
  sort_order: z.number().int().optional(),
  is_published: z.boolean().optional(),
})

export const GET = withErrorHandler(async (req: NextRequest) => {
  const { organizationId } = await requireAdminOrEditorFromRequest(req)
  const supabase = await createServiceRoleSupabaseClient()
  const categories = await getAllPortalFaqCategories(supabase, organizationId)
  return NextResponse.json(categories)
})

export const POST = withErrorHandler(async (req: NextRequest) => {
  const { organizationId } = await requireAdminOrEditorFromRequest(req)
  const supabase = await createServiceRoleSupabaseClient()
  const body = upsertSchema.parse(await req.json())
  const category = await upsertPortalFaqCategory(
    supabase,
    {
      id: body.id,
      slug: body.slug,
      title_en: body.title_en,
      title_de: body.title_de ?? null,
      sort_order: body.sort_order ?? 0,
      is_published: body.is_published ?? true,
    },
    organizationId,
  )
  return NextResponse.json(category)
})
