import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

// #1db954 is Spotify's official brand color — required for Spotify logo icons
const ALLOWED_COLORS = new Set(['#493687', '#7e1e37', '#101010', '#292929', '#383838', '#ffffff', '#1db954'])

/** National flag SVG fills — not product CI palette (see LocaleFlagIcon). */
const EXCLUDED_FILES = new Set([
  path.normalize('src/components/LocaleFlagIcon.tsx'),
])

type Violation = {
  file: string
  line: number
  color: string
}

function listTsxFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name)
    if (entry.isDirectory()) return listTsxFiles(absolutePath)
    return entry.isFile() && entry.name.endsWith('.tsx') ? [absolutePath] : []
  })
}

function findViolations(): Violation[] {
  const files = listTsxFiles(path.join(process.cwd(), 'src/components'))

  const violations: Violation[] = []

  for (const filePath of files) {
    const rel = path.relative(process.cwd(), filePath)
    if (EXCLUDED_FILES.has(path.normalize(rel))) continue

    const content = readFileSync(filePath, 'utf8')
    const lines = content.split(/\r?\n/)

    lines.forEach((line, index) => {
      const matches = [...line.matchAll(/#[0-9a-fA-F]{6}/g)]
      for (const match of matches) {
        const color = match[0].toLowerCase()
        if (!ALLOWED_COLORS.has(color)) {
          violations.push({
            file: rel,
            line: index + 1,
            color,
          })
        }
      }
    })
  }

  return violations
}

describe('Corporate Identity colors', () => {
  it('allows only approved CI hex colors in src/components/**/*.tsx', () => {
    const violations = findViolations()
    const report = violations
      .map((violation) => `${violation.file}:${violation.line} → ${violation.color}`)
      .join('\n')

    expect(violations, report || 'No CI color violations found').toEqual([])
  })
})
