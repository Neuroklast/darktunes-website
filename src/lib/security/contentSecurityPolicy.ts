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

export function buildContentSecurityPolicy(): string {
  return Object.entries(CONTENT_SECURITY_POLICY_DIRECTIVES)
    .map(([directive, sources]) => `${directive} ${sources.join(' ')}`)
    .join('; ')
}

/** Host patterns required for R2 presigned uploads from the browser. */
export const R2_UPLOAD_CONNECT_HOSTS = [
  'https://*.r2.cloudflarestorage.com',
  'https://*.r2.dev',
] as const