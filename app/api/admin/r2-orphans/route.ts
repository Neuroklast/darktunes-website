/**
 * GET /api/admin/r2-orphans — unreferenced R2 objects from the latest scan
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminOrEditorFromRequest } from '@/lib/adminAuth'
import { withErrorHandler } from '@/lib/errors'
import { R2_ORPHAN_LIST_DEFAULT, R2_ORPHAN_LIST_MAX } from '@/lib/r2/constants'
import { getLatestStorageSnapshot } from '@/lib/r2/storageScan'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export const GET = withErrorHandler(async (request: NextRequest): Promise<NextResponse> => {
  await requireAdminOrEditorFromRequest(request)
  const db = await createServiceRoleSupabaseClient()
  const snapshot = await getLatestStorageSnapshot(db)
  if (!snapshot) {
    return NextResponse.json({ items: [], next_cursor: null, snapshot_id: null })
  }

  const url = new URL(request.url)
  const limitRaw = Number(url.searchParams.get('limit') ?? R2_ORPHAN_LIST_DEFAULT)
  const limit = Number.isFinite(limitRaw)
    ? Math.min(R2_ORPHAN_LIST_MAX, Math.max(1, Math.floor(limitRaw)))
    : R2_ORPHAN_LIST_DEFAULT
  const cursor = url.searchParams.get('cursor')

  let query = db
    .from('r2_orphan_objects')
    .select('object_key, size_bytes, last_modified, prefix')
    .eq('snapshot_id', snapshot.id)
    .order('object_key', { ascending: true })
    .limit(limit)
  if (cursor) query = query.gt('object_key', cursor)

  const { data, error } = await query
  if (error) throw new Error(error.message)
  const items = (data ?? []).map((row) => ({
    object_key: row.object_key,
    size_bytes: row.size_bytes,
    last_modified: row.last_modified,
    prefix: row.prefix,
  }))
  const nextCursor = items.length === limit ? items[items.length - 1]?.object_key ?? null : null

  return NextResponse.json({
    items,
    next_cursor: nextCursor,
    snapshot_id: snapshot.id,
  })
})
