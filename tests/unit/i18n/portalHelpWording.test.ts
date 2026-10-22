import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const LOCALES = ['en', 'de', 'fr'] as const

const FORBIDDEN = [
  /feature[-\s]?flag/i,
  /artist\.(analytics|tour_planner|statements|invoices|documents|marketing|epk_builder|fan_page)/i,
  /presigned/i,
  /service[-\s]?worker/i,
  /dexie/i,
  /\b409\b/,
  /\bbronze\b/i,
  /distributor[-\s]?import[-\s]?batch/i,
  /deep[-\s]?link/i,
  /nav[-\s]?hidden/i,
  /\bsupabase\b/i,
  /\bJWT\b/,
  /\bRLS\b/,
  /\bR2\b/,
]

function visibleStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') {
    out.push(value)
  } else if (Array.isArray(value)) {
    // Keyword arrays are search metadata, not rendered help text.
    return out
  } else if (value && typeof value === 'object') {
    for (const child of Object.values(value)) visibleStrings(child, out)
  }
  return out
}

describe('portal help wording', () => {
  for (const locale of LOCALES) {
    it(`keeps developer jargon out of visible ${locale} help text`, () => {
      const file = join(process.cwd(), 'src', 'i18n', 'messages', locale, 'portalHelp.json')
      const messages = JSON.parse(readFileSync(file, 'utf8')) as unknown
      const offenders = visibleStrings(messages).filter((text) =>
        FORBIDDEN.some((pattern) => pattern.test(text)),
      )
      expect(offenders).toEqual([])
    })
  }
})
