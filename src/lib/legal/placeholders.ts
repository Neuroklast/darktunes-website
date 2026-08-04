/**
 * Multi-tenant legal template interpolation.
 * Admin CMS stores templates with {{placeholders}}; public pages render filled text.
 */

export type LegalTemplateVars = Record<string, string>

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g

/** Replace `{{key}}` tokens. Unknown keys become empty string. */
export function renderLegalTemplate(template: string, vars: LegalTemplateVars): string {
  return template.replace(PLACEHOLDER_RE, (_, key: string) => vars[key] ?? '')
}

export function listUnresolvedPlaceholders(template: string, vars: LegalTemplateVars): string[] {
  const missing = new Set<string>()
  for (const match of template.matchAll(PLACEHOLDER_RE)) {
    const key = match[1]
    if (!key) continue
    if (!vars[key]?.trim()) missing.add(key)
  }
  return [...missing]
}
