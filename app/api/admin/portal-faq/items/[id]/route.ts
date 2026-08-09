import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withErrorHandler } from '@/lib/errors'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import { requireAdminOrEditorFromRequest } from '@/lib/adminAuth'
import { deletePortalFaqItem, updatePortalFaqItem } from '@/lib/api/portalFaq'

const patchSchema = z.object({
  category_id: z.string().uuid().optional(),
  slug: z.string().min(1).max(160).optional(),
  question_en: z.string().min(1).optional(),
  question_de: z.string().nullable().optional(),
  answer_html_en: z.string().min(1).optional(),
  answer_html_de: z.string().nullable().optional(),
  keywords: z.array(z.string()).optional(),
  portal_route: z.string().nullable().optional(),
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
  const item = await updatePortalFaqItem(supabase, id, body, organizationId)
  return NextResponse.json(item)
})

export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const { organizationId } = await requireAdminOrEditorFromRequest(req)
  const supabase = await createServiceRoleSupabaseClient()
  const id = extractId(req)
  await deletePortalFaqItem(supabase, id, organizationId)
  return NextResponse.json({ deleted: true })
})
