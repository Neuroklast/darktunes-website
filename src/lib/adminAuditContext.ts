/**
 * src/lib/adminAuditContext.ts
 *
 * Request-scoped bridge between admin auth and the error handler so that admin
 * mutations are audited automatically without touching every route.
 *
 * `adminAuth.verifyAdminRequest` records the resolved actor on the NextRequest;
 * `withErrorHandler` reads it after the handler runs and writes `admin_audit_log`.
 * Server-only. Uses a WeakMap so nothing leaks between requests.
 */

import type { NextRequest } from 'next/server'

export interface AdminAuditActor {
  userId: string
  role: string
}

const actors = new WeakMap<object, AdminAuditActor>()
const audited = new WeakSet<object>()

export function setAdminAuditActor(req: NextRequest, actor: AdminAuditActor): void {
  actors.set(req, actor)
}

export function getAdminAuditActor(req: NextRequest): AdminAuditActor | undefined {
  return actors.get(req)
}

/** Marks the request as explicitly audited so the automatic fallback skips it. */
export function markAdminRequestAudited(req: NextRequest): void {
  audited.add(req)
}

export function wasAdminRequestAudited(req: NextRequest): boolean {
  return audited.has(req)
}

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export function isMutatingMethod(method: string): boolean {
  return MUTATING_METHODS.has(method.toUpperCase())
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface AdminAuditMeta {
  action: string
  resource: string
  resourceId: string | null
}

/**
 * Derives a stable, searchable audit action from an admin API path.
 *
 *   PATCH /api/admin/users/3f2…  → action "admin.patch./users/:id",
 *                                   resource "users", resourceId "3f2…"
 *   POST  /api/admin/users/3f2…/resend-invite
 *                                → action "admin.post./users/:id/resend-invite"
 */
export function deriveAdminAuditMeta(req: NextRequest): AdminAuditMeta {
  const pathname = (() => {
    try {
      return new URL(req.url).pathname
    } catch {
      return req.url
    }
  })()

  const relative = pathname.replace(/^\/api\/admin\/?/, '')
  const segments = relative.split('/').filter(Boolean)

  const ids: string[] = []
  const normalized = segments.map((segment) => {
    if (uuidPattern.test(segment) || /^\d+$/.test(segment)) {
      ids.push(segment)
      return ':id'
    }
    return segment
  })

  const method = req.method.toLowerCase()
  const resource = normalized[0] ?? 'admin'
  const action = `admin.${method}.${normalized.length ? `/${normalized.join('/')}` : '/root'}`

  return { action, resource, resourceId: ids[0] ?? null }
}
