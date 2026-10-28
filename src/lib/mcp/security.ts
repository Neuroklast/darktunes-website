import { NextRequest } from 'next/server'
import type { AiActor } from '@/lib/ai/auth/requireAiActor'
import { requireAiActor } from '@/lib/ai/auth/requireAiActor'
import { createServerSupabaseClient } from '@/lib/supabase/server'

/** MCP accepts OAuth-issued bearer tokens only, never portal cookies or service keys. */
export async function authenticateMcp(req: NextRequest): Promise<AiActor | null> {
  const header = req.headers.get('authorization')
  const match = /^Bearer ([A-Za-z0-9_\-.]+)$/.exec(header ?? '')
  if (!match) return null
  const token = match[1]
  if (token.length > 8_192 || token.split('.').length !== 3) return null
  try {
    const client = await createServerSupabaseClient()
    const { data: { user }, error } = await client.auth.getUser(token)
    if (error || !user) return null

    // Parse OAuth client_id ONLY after Auth verified the signed JWT.
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')) as Record<string, unknown>
    if (claims.sub !== user.id || typeof claims.client_id !== 'string' || !claims.client_id.trim()) return null

    const actor = await requireAiActor(req, { dashboard: 'admin' })
    if (actor.userId !== user.id || (actor.role !== 'admin' && actor.role !== 'editor')) return null
    return actor
  } catch {
    return null
  }
}

export function isAllowedMcpOrigin(req: Request): boolean {
  const origin = req.headers.get('origin')
  if (!origin) return true // Headless OAuth clients generally do not set Origin.
  try {
    const target = new URL(process.env.NEXT_PUBLIC_SITE_URL || req.url)
    return new URL(origin).origin === target.origin
  } catch {
    return false
  }
}

export function oauthIssuer(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) return null
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') return null
    return parsed.origin + '/auth/v1'
  } catch {
    return null
  }
}
