import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

function collectKeys(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return prefix ? [prefix] : []
  }
  return Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) =>
    collectKeys(nested, prefix ? `${prefix}.${key}` : key),
  )
}

const messagesDir = path.join(import.meta.dirname, 'messages')

const LOCALES = ['en', 'de', 'fr'] as const

describe('i18n message parity', () => {
  it('all locales expose the same namespaces', () => {
    const enNamespaces = readdirSync(path.join(messagesDir, 'en'))
      .filter((file) => file.endsWith('.json'))
      .sort()
    for (const locale of LOCALES) {
      if (locale === 'en') continue
      const other = readdirSync(path.join(messagesDir, locale))
        .filter((file) => file.endsWith('.json'))
        .sort()
      expect(other, `${locale} namespaces`).toEqual(enNamespaces)
    }
  })

  it('all locales expose the same key paths per namespace', () => {
    const enNamespaces = readdirSync(path.join(messagesDir, 'en')).filter((file) =>
      file.endsWith('.json'),
    )

    for (const namespaceFile of enNamespaces) {
      const en = JSON.parse(readFileSync(path.join(messagesDir, 'en', namespaceFile), 'utf8'))
      const enKeys = collectKeys(en).sort()
      for (const locale of LOCALES) {
        if (locale === 'en') continue
        const other = JSON.parse(
          readFileSync(path.join(messagesDir, locale, namespaceFile), 'utf8'),
        )
        expect(collectKeys(other).sort(), `${locale}/${namespaceFile}`).toEqual(enKeys)
      }
    }
  })
})