/** First path segment including trailing slash, or `(root)`. */
export function objectPrefix(key: string): string {
  const slash = key.indexOf('/')
  return slash === -1 ? '(root)' : key.slice(0, slash + 1)
}

export function invoiceObjectKey(artistId: string, invoiceId: string): string {
  return `invoices/${artistId}/${invoiceId}.pdf`
}

function stripQuery(value: string): string {
  const q = value.indexOf('?')
  return q === -1 ? value : value.slice(0, q)
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }
}

/**
 * Derive an R2 object key from a stored URL or raw key.
 * Only accepts our CDN host (or a key-shaped path with no scheme).
 */
export function extractR2Key(value: string, publicBase: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  if (!trimmed.includes('://')) {
    const key = stripQuery(trimmed).replace(/^\/+/, '')
    if (!key || key.includes('..')) return null
    return key
  }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return null
  }

  const baseHost = hostnameOf(publicBase)
  const host = parsed.hostname.toLowerCase()
  const allowed =
    (baseHost && host === baseHost) ||
    host.endsWith('.r2.dev') ||
    host.endsWith('.r2.cloudflarestorage.com')
  if (!allowed) return null

  const key = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''))
  if (!key || key.includes('..')) return null
  return key
}

const CDN_URL_RE = /https?:\/\/[^\s"'<>)\\]+/gi

export function extractKeysFromText(text: string, publicBase: string): string[] {
  const keys: string[] = []
  const seen = new Set<string>()
  const add = (raw: string) => {
    const key = extractR2Key(raw, publicBase)
    if (key && !seen.has(key)) {
      seen.add(key)
      keys.push(key)
    }
  }

  add(text)
  for (const match of text.match(CDN_URL_RE) ?? []) {
    add(match)
  }
  return keys
}

export function extractKeysFromUnknown(value: unknown, publicBase: string): string[] {
  const keys: string[] = []
  const seen = new Set<string>()

  const walk = (node: unknown): void => {
    if (node == null) return
    if (typeof node === 'string') {
      for (const key of extractKeysFromText(node, publicBase)) {
        if (!seen.has(key)) {
          seen.add(key)
          keys.push(key)
        }
      }
      return
    }
    if (Array.isArray(node)) {
      for (const item of node) walk(item)
      return
    }
    if (typeof node === 'object') {
      for (const item of Object.values(node)) walk(item)
    }
  }

  walk(value)
  return keys
}

export function isOlderThan(date: Date | null, ageMs: number, now = Date.now()): boolean {
  if (!date) return true
  return now - date.getTime() >= ageMs
}
