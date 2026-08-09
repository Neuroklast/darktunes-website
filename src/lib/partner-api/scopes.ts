import { ApiError } from '@/lib/errors'
import type { PartnerApiAuthContext } from '@/lib/partner-api/auth'

export function requirePartnerScope(ctx: PartnerApiAuthContext, scope: string): void {
  if (ctx.scopes.includes('*') || ctx.scopes.includes(scope)) return
  throw new ApiError(403, `Missing required scope: ${scope}`, 'PARTNER_SCOPE_FORBIDDEN')
}
