import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withErrorHandler } from '@/lib/errors'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import { requireAdminOrEditorFromRequest } from '@/lib/adminAuth'
import { getAllPortalFaqItems, upsertPortalFaqItem } from '@/lib/api/portalFaq'

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  category_id: z.string().uuid(),
  slug: z.string().min(1).max(160),
  question_en: z.string().min(1),
  question_de: z.string().nullable().optional(),
  answer_html_en: z.string().min(1),
  answer_html_de: z.string().nullable().optional(),
  keywords: z.array(z.string()).optional(),
  portal_route: z.string().nullable().optional(),
  sort_order: z.number().int().optional(),
  is_published: z.boolean().optional(),
})

export const GET = withErrorHandler(async (req: NextRequest) => {
  const { organizationId } = await requireAdminOrEditorFromRequest(req)
  const supabase = await createServiceRoleSupabaseClient()
  const items = await getAllPortalFaqItems(supabase, organizationId)
  return NextResponse.json(items)
})

export const POST = withErrorHandler(async (req: NextRequest) => {
  const { organizationId } = await requireAdminOrEditorFromRequest(req)
  const supabase = await createServiceRoleSupabaseClient()
  const body = upsertSchema.parse(await req.json())
  const item = await upsertPortalFaqItem(
    supabase,
    {
      id: body.id,
      category_id: body.category_id,
      slug: body.slug,
      question_en: body.question_en,
      question_de: body.question_de ?? null,
      answer_html_en: body.answer_html_en,
      answer_html_de: body.answer_html_de ?? null,
      keywords: body.keywords ?? [],
      portal_route: body.portal_route ?? null,
      sort_order: body.sort_order ?? 0,
      is_published: body.is_published ?? true,
    },
    organizationId,
  )
  return NextResponse.json(item)
})
