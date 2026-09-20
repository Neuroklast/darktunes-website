/**
 * src/lib/adminAuditLog.ts
 *
 * Append-only audit trail for admin actions (admin_audit_log table).
 * Server-only.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'
import type { Database } from '@/types/database'
import {
  deriveAdminAuditMeta,
  getAdminAuditActor,
  isMutatingMethod,
  markAdminRequestAudited,
  wasAdminRequestAudited,
} from '@/lib/adminAuditContext'

type DbClient = SupabaseClient<Database>

export interface LogAdminActionOptions {
  actorId: string
  action: string
  resource: string
  resourceId?: string | null
  details?: Record<string, unknown>
  ipAddress?: string | null
}

/** Writes one audit row. Returns whether it was persisted. Never throws. */
export async function logAdminAction(
  db: DbClient,
  opts: LogAdminActionOptions,
): Promise<boolean> {
  try {
    // PostgREST does not throw on DB errors — it returns `{ error }`.
    const { error } = await db.from('admin_audit_log').insert({
      actor_id: opts.actorId,
      action: opts.action,
      resource: opts.resource,
      resource_id: opts.resourceId ?? null,
      details: opts.details ?? {},
      ip_address: opts.ipAddress ?? null,
    })
    if (error) {
      console.error('admin audit write failed', error.message)
      return false
    }
    return true
  } catch (error) {
    // Audit failures must not break the primary operation
    console.error('admin audit write failed', error)
    return false
  }
}

/**
 * Explicit, semantic audit entry for a request. On success, marks the request so
 * the automatic `auditAdminMutation` fallback does not write a duplicate row. If
 * the explicit write fails, the fallback still records a generic entry.
 */
export async function logAdminActionForRequest(
  req: NextRequest,
  db: DbClient,
  opts: LogAdminActionOptions,
): Promise<void> {
  const persisted = await logAdminAction(db, opts)
  if (persisted) {
    markAdminRequestAudited(req)
  }
}

/**
 * Transport-only admin endpoints excluded from the automatic audit to avoid
 * flooding `admin_audit_log` (e.g. one presign call per multipart part).
 */
const AUTO_AUDIT_SKIP = /\/(presign-[^/]+|multipart\/[^/]+)$/

/**
 * Automatic audit for admin mutations. Called by `withErrorHandler` after the
 * route runs: if an admin actor was recorded on the request, the action is
 * derived from the path and persisted. Skipped when the route already wrote a
 * richer, explicit audit entry via `logAdminActionForRequest`. Never throws.
 */
export async function auditAdminMutation(
  req: NextRequest,
  status: number,
): Promise<void> {
  try {
    if (!isMutatingMethod(req.method)) return
    if (wasAdminRequestAudited(req)) return

    const pathname = (() => {
      try { return new URL(req.url).pathname } catch { return req.url }
    })()
    // Admin-only: never write non-admin mutations (portal/press/account) here.
    if (!pathname.startsWith('/api/admin/')) return
    if (AUTO_AUDIT_SKIP.test(pathname)) return

    let actor = getAdminAuditActor(req)
    if (!actor) {
      // Routes still using legacy token-only auth don't record the actor — fall
      // back to request-based resolution so coverage stays broad.
      const { extractRouteUserContext } = await import('@/lib/routeUserContext')
      const ctx = await extractRouteUserContext(req)
      if (ctx.userId) {
        actor = { userId: ctx.userId, role: ctx.userRole ?? 'unknown' }
      }
    }
    if (!actor) return

    const meta = deriveAdminAuditMeta(req)
    const { createServiceRoleSupabaseClient } = await import('@/lib/supabase/server')
    const db = await createServiceRoleSupabaseClient()

    await logAdminAction(db, {
      actorId: actor.userId,
      action: meta.action,
      resource: meta.resource,
      resourceId: meta.resourceId,
      details: {
        method: req.method,
        path: pathname,
        status,
        success: status < 400,
        actor_role: actor.role,
      },
    })
  } catch {
    // Audit must never affect the response
  }
}