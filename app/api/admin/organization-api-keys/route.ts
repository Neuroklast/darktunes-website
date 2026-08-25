import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withErrorHandler, ApiError } from '@/lib/errors'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import { requireAdminFromRequest } from '@/lib/adminAuth'
import { assertAdminOrganizationAccess } from '@/lib/organizations/assertAdminOrganizationAccess'
import { generatePartnerApiKey } from '@/lib/partner-api/auth'
import { writeOrganizationAuditLog } from '@/lib/api/organizationAuditLog'

const postSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(1).max(80),
})

export const GET = withErrorHandler(async (req: NextRequest) => {
  const { userId } = await requireAdminFromRequest(req)
  const orgId = new URL(req.url).searchParams.get('organizationId')
  if (!orgId) throw new ApiError(400, 'organizationId required')

  const db = await createServiceRoleSupabaseClient()
  await assertAdminOrganizationAccess(db, userId, orgId)

  const { data, error } = await db
    .from('organization_api_keys')
    .select('id, name, key_prefix, scopes, revoked_at, created_at, last_used_at')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return NextResponse.json(data ?? [])
})

export const POST = withErrorHandler(async (req: NextRequest) => {
  const { userId } = await requireAdminFromRequest(req)
  const body = postSchema.parse(await req.json())
  const { rawKey, prefix, hash } = generatePartnerApiKey()

  const db = await createServiceRoleSupabaseClient()
  await assertAdminOrganizationAccess(db, userId, body.organizationId)

  const { data, error } = await db
    .from('organization_api_keys')
    .insert({
      organization_id: body.organizationId,
      name: body.name,
      key_prefix: prefix,
      key_hash: hash,
      scopes: ['read'],
    })
    .select('id, name, key_prefix, created_at')
    .single()

  if (error) throw new Error(error.message)

  await writeOrganizationAuditLog(db, {
    organizationId: body.organizationId,
    userId,
    action: 'api_key.created',
    targetType: 'organization_api_key',
    targetId: data?.id,
  })

  return NextResponse.json({ key: rawKey, metadata: data }, { status: 201 })
})
