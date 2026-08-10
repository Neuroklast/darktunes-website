/**
 * Single source of truth for the site Content-Security-Policy.
 * Imported by next.config.ts and validated in unit tests.
 *
 * Residual risk: `script-src` / `style-src` include `'unsafe-inline'`.
 * - Scripts: embeds + Next hydration patterns in current stack.
 * - Styles: CMS theme injection (`ThemeStyleInjector`) and Google Fonts.
 * Nonce-based CSP is a follow-up (see SECURITY.md); do not remove without a migration plan.
 */
export const CONTENT_SECURITY_POLICY_DIRECTIVES: Record<string, readonly string[]> = {
  'default-src': ["'self'"],
  'script-src': [
    "'self'",
    "'unsafe-inline'",
    "'wasm-unsafe-eval'",
    'https://open.spotify.com',
    'https://www.youtube.com',
    'https://www.youtube-nocookie.com',
  ],
  'frame-src': [
    "'self'",
    'https://open.spotify.com',
    'https://www.youtube.com',
    'https://www.youtube-nocookie.com',
    'https://darkmerch.com',
    'https://www.openstreetmap.org',
  ],
  'img-src': [
    "'self'",
    'data:',
    'blob:',
    'https://*.r2.dev',
    'https://wsrv.nl',
    'https://i.ytimg.com',
    'https://*.supabase.co',
    'https://*.mzstatic.com',
    'https://*.bcbits.com',
  ],
  'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
  'font-src': ["'self'", 'data:', 'https://fonts.gstatic.com', 'https://cdn.jsdelivr.net'],
  'connect-src': [
    "'self'",
    'data:',
    'blob:',
    'https://*.supabase.co',
    'wss://*.supabase.co',
    'https://*.r2.dev',
    'https://*.r2.cloudflarestorage.com',
    'https://wsrv.nl',
    'https://fonts.googleapis.com',
    'https://fonts.gstatic.com',
    'https://darkmerch.com',
    'https://cdn.jsdelivr.net',
  ],
  'media-src': ["'self'", 'blob:', 'https://*.r2.dev', 'https://*.supabase.co'],
  'worker-src': ["'self'", 'blob:'],
} as const

/** Loopback hosts used by the Supabase CLI's local dev stack (never a real
 * production Supabase project, so allowing them can't weaken prod CSP). */
const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1'])

/** When NEXT_PUBLIC_SUPABASE_URL points at the local Supabase CLI stack
 * (dev / E2E against `supabase start`) rather than a hosted *.supabase.co
 * project, connect-src needs that origin too, or the browser blocks
 * supabase-js's fetch/websocket calls outright. */
function localSupabaseConnectHosts(): string[] {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) return []

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return []
  }

  if (!LOOPBACK_HOSTNAMES.has(parsed.hostname)) return []

  const origin = parsed.origin
  const wsOrigin = `${parsed.protocol === 'https:' ? 'wss:' : 'ws:'}//${parsed.host}`
  return [origin, wsOrigin]
}

export function buildContentSecurityPolicy(): string {
  const localHosts = localSupabaseConnectHosts()
  const directives =
    localHosts.length === 0
      ? CONTENT_SECURITY_POLICY_DIRECTIVES
      : {
          ...CONTENT_SECURITY_POLICY_DIRECTIVES,
          'connect-src': [...CONTENT_SECURITY_POLICY_DIRECTIVES['connect-src'], ...localHosts],
        }

  return Object.entries(directives)
    .map(([directive, sources]) => `${directive} ${sources.join(' ')}`)
    .join('; ')
}

/** Host patterns required for R2 presigned uploads from the browser. */
export const R2_UPLOAD_CONNECT_HOSTS = [
  'https://*.r2.cloudflarestorage.com',
  'https://*.r2.dev',
] as const