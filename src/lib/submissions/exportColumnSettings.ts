import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { DEFAULT_ORGANIZATION_ID } from '@/lib/organizations/constants'
import { DEFAULT_EXPORT_COLUMNS } from '@/lib/submissions/submissionExport'

type DbClient = SupabaseClient<Database>

export const RELEASE_SUBMISSIONS_EXPORT_COLUMNS_KEY = 'release_submissions_export_columns'

export function parseExportColumnsJson(raw: string | null | undefined): string[] | null {
  if (!raw || !raw.trim()) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')) {
      return parsed.filter((s) => s.trim().length > 0)
    }
    if (
      parsed
      && typeof parsed === 'object'
      && Array.isArray((parsed as { columns?: unknown }).columns)
    ) {
      const cols = (parsed as { columns: unknown[] }).columns
      if (cols.every((x) => typeof x === 'string')) {
        return cols.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
      }
    }
    return null
  } catch {
    return null
  }
}

export function serializeExportColumns(columns: string[]): string {
  return JSON.stringify({ columns })
}

/**
 * Returns the saved column preference, or defaults when nothing is stored.
 * Callers that have a richer `available` set should re-filter with
 * `resolveExportColumns(saved, available)`.
 */
export async function getReleaseSubmissionExportColumns(
  db: DbClient,
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<string[]> {
  const { data, error } = await db
    .from('site_settings')
    .select('value')
    .eq('organization_id', organizationId)
    .eq('key', RELEASE_SUBMISSIONS_EXPORT_COLUMNS_KEY)
    .maybeSingle()

  if (error) throw new Error(error.message)
  const saved = parseExportColumnsJson(data?.value)
  if (saved && saved.length > 0) return saved
  return [...DEFAULT_EXPORT_COLUMNS]
}

export async function setReleaseSubmissionExportColumns(
  db: DbClient,
  columns: string[],
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<string[]> {
  const cleaned = columns
    .filter((c) => typeof c === 'string' && c.trim().length > 0)
    .map((c) => c.trim())
  const unique: string[] = []
  const seen = new Set<string>()
  for (const c of cleaned) {
    if (seen.has(c)) continue
    unique.push(c)
    seen.add(c)
  }
  if (unique.length === 0) {
    throw new Error('columns must not be empty')
  }

  const value = serializeExportColumns(unique)
  const { error } = await db
    .from('site_settings')
    .upsert(
      {
        organization_id: organizationId,
        key: RELEASE_SUBMISSIONS_EXPORT_COLUMNS_KEY,
        value,
      },
      { onConflict: 'organization_id,key' },
    )
  if (error) throw new Error(error.message)
  return unique
}
