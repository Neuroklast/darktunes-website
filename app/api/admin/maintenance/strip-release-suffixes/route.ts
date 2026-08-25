import { NextRequest, NextResponse } from 'next/server'
import { requireAdminFromRequest } from '@/lib/adminAuth'
import { ApiError, withErrorHandler } from '@/lib/errors'
import { stripReleaseSuffix } from '@/lib/sync/deduplication'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'

export const POST = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const { organizationId } = await requireAdminFromRequest(req)

  const db = await createServiceRoleSupabaseClient()
  const { data, error } = await db
    .from('releases')
    .select('id, title')
    .eq('organization_id', organizationId)

  if (error) throw new ApiError(500, `Failed to load releases: ${error.message}`)

  const titles: Array<{ id: string; before: string; after: string }> = []

  for (const row of data ?? []) {
    const before = row.title
    const after = stripReleaseSuffix(before)
    if (after === before) continue

    const { error: updateError } = await db
      .from('releases')
      .update({ title: after })
      .eq('id', row.id)
      .eq('organization_id', organizationId)
    if (updateError) {
      throw new ApiError(500, `Failed to update release ${row.id}: ${updateError.message}`)
    }

    titles.push({ id: row.id, before, after })
  }

  return NextResponse.json({ fixed: titles.length, titles })
})
