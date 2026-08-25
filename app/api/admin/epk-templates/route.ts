/**
 * app/api/admin/epk-templates/route.ts
 *
 * GET    — list all EPK templates for the host organization (admin)
 * POST   — create template
 * PATCH  — update template
 * DELETE — delete template (?id=)
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withErrorHandler, ApiError } from '@/lib/errors'
import { requireAdminFromRequest } from '@/lib/adminAuth'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import {
  createEpkTemplate,
  deleteEpkTemplate,
  listAllEpkTemplates,
  updateEpkTemplate,
} from '@/lib/api/epkTemplates'
import { epkDocumentV2Schema } from '@/lib/epk/schema/documentV2'

const createSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  document: epkDocumentV2Schema,
  is_published: z.boolean().optional(),
  sort_order: z.number().int().min(0).optional(),
})

const patchSchema = createSchema.partial().extend({
  id: z.string().uuid(),
})

export const GET = withErrorHandler(async (req: NextRequest) => {
  const { organizationId } = await requireAdminFromRequest(req)

  const db = await createServiceRoleSupabaseClient()
  const templates = await listAllEpkTemplates(db, organizationId)
  return NextResponse.json({ templates })
})

export const POST = withErrorHandler(async (req: NextRequest) => {
  const { organizationId } = await requireAdminFromRequest(req)

  const body = createSchema.parse(await req.json())
  const db = await createServiceRoleSupabaseClient()
  const template = await createEpkTemplate(
    db,
    {
      name: body.name,
      description: body.description,
      document: body.document,
      isPublished: body.is_published,
      sortOrder: body.sort_order,
    },
    organizationId,
  )

  return NextResponse.json({ template }, { status: 201 })
})

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const { organizationId } = await requireAdminFromRequest(req)

  const body = patchSchema.parse(await req.json())
  const db = await createServiceRoleSupabaseClient()
  const template = await updateEpkTemplate(
    db,
    body.id,
    {
      name: body.name,
      description: body.description,
      document: body.document,
      isPublished: body.is_published,
      sortOrder: body.sort_order,
    },
    organizationId,
  )

  return NextResponse.json({ template })
})

export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const { organizationId } = await requireAdminFromRequest(req)

  const id = req.nextUrl.searchParams.get('id')
  if (!id) throw new ApiError(400, 'Missing template id')

  const db = await createServiceRoleSupabaseClient()
  await deleteEpkTemplate(db, id, organizationId)
  return NextResponse.json({ success: true })
})
