/**
 * src/lib/observability/fingerprint.ts
 *
 * Stable, runtime-neutral fingerprint for aggregating repeated errors into a
 * single `app_logs` row (counter + first/last seen). Distinct from
 * `src/lib/zammad/fingerprint.ts`, which deduplicates support tickets.
 *
 * No `node:crypto` — FNV-1a works identically in Node and Edge.
 */

const fingerprintTextMaxLength = 400

/** Stable fingerprint over event, error name, normalized message + first frame. */
export function buildLogFingerprint(input: {
  event: string
  errorName: string
  message: string
  stack: string | null
}): string {
  const normalized = [
    input.event,
    input.errorName,
    normalizeForFingerprint(input.message),
    normalizeForFingerprint(firstStackFrame(input.stack)),
  ].join('|')
  return `fp_${fnv1a64(normalized)}`
}

/** Fingerprint for non-error operational logs (source/level/message/route). */
export function buildSimpleFingerprint(...parts: Array<string | null | undefined>): string {
  return `fp_${fnv1a64(parts.map((part) => normalizeForFingerprint(part ?? '')).join('|'))}`
}

export function firstStackFrame(stack: string | null): string {
  if (!stack) {
    return ''
  }
  const line = stack.split('\n').find((entry) => entry.trim().startsWith('at '))
  return line ? line.trim() : ''
}

/** Collapses volatile identifiers so the same failure maps to one fingerprint. */
export function normalizeForFingerprint(text: string): string {
  return text
    .replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      '<id>',
    )
    .replace(/\bc[a-z0-9]{20,}\b/gi, '<id>')
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '<mail>')
    .replace(/\b\d+\b/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, fingerprintTextMaxLength)
}

function fnv1a64(value: string): string {
  let hash = 0xcbf29ce484222325n
  const prime = 0x100000001b3n
  const mask = 0xffffffffffffffffn
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index))
    hash = (hash * prime) & mask
  }
  return hash.toString(16).padStart(16, '0')
}
