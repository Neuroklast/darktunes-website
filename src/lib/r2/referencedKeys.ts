import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { extractKeysFromUnknown, extractR2Key, invoiceObjectKey } from '@/lib/r2/keys'

type ServiceDb = SupabaseClient<Database>
const PAGE_SIZE = 1000

async function paginateRows(
  query: {
    range: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>
  },
): Promise<unknown[]> {
  const rows: unknown[] = []
  let from = 0
  for (;;) {
    const { data, error } = await query.range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    const page = data ?? []
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return rows
}

function addKey(set: Set<string>, key: string | null | undefined): void {
  if (key) set.add(key)
}

function addFromValue(set: Set<string>, value: unknown, publicBase: string): void {
  for (const key of extractKeysFromUnknown(value, publicBase)) set.add(key)
}

export async function collectReferencedKeys(db: ServiceDb, publicBase: string): Promise<Set<string>> {
  const keys = new Set<string>()

  const r2KeyTables = [
    'assets',
    'epk_fonts',
    'sales_statements',
    'distributor_import_batches',
    'promo_tracks',
    'artist_assets',
    'press_photos',
    'media_files',
  ] as const

  for (const table of r2KeyTables) {
    const built = db.from(table).select('r2_key').order('id', { ascending: true })
    const rows = await paginateRows(built)
    for (const row of rows) {
      const record = row as { r2_key?: string | null }
      addKey(keys, record.r2_key)
    }
  }

  {
    const built = db.from('promo_log_entries').select('proof_r2_key, proof_url').order('id', { ascending: true })
    const rows = await paginateRows(built)
    for (const row of rows) {
      const record = row as { proof_r2_key?: string | null; proof_url?: string | null }
      addKey(keys, record.proof_r2_key)
      addFromValue(keys, record.proof_url, publicBase)
    }
  }

  {
    const built = db.from('artists').select('image_url, logo_url').order('id', { ascending: true })
    const rows = await paginateRows(built)
    for (const row of rows) {
      const record = row as { image_url?: string | null; logo_url?: string | null }
      addFromValue(keys, record.image_url, publicBase)
      addFromValue(keys, record.logo_url, publicBase)
    }
  }

  {
    const built = db.from('releases').select('cover_art').order('id', { ascending: true })
    const rows = await paginateRows(built)
    for (const row of rows) {
      addFromValue(keys, (row as { cover_art?: string | null }).cover_art, publicBase)
    }
  }

  {
    const built = db.from('news_posts').select('image_url, hero_bg_url, content').order('id', { ascending: true })
    const rows = await paginateRows(built)
    for (const row of rows) {
      const record = row as { image_url?: string | null; hero_bg_url?: string | null; content?: string | null }
      addFromValue(keys, record.image_url, publicBase)
      addFromValue(keys, record.hero_bg_url, publicBase)
      addFromValue(keys, record.content, publicBase)
    }
  }

  {
    const built = db.from('videos').select('thumbnail_url').order('id', { ascending: true })
    const rows = await paginateRows(built)
    for (const row of rows) {
      addFromValue(keys, (row as { thumbnail_url?: string | null }).thumbnail_url, publicBase)
    }
  }

  {
    const built = db
      .from('artist_epks')
      .select(
        'epk_gallery_photos, epk_bg_image_url, rider_stage_plot_url, rider_technical_url, rider_hospitality_url, epk_document',
      )
      .order('id', { ascending: true })
    const rows = await paginateRows(built)
    for (const row of rows) {
      addFromValue(keys, row, publicBase)
    }
  }

  {
    const built = db.from('epk_versions').select('document').order('id', { ascending: true })
    const rows = await paginateRows(built)
    for (const row of rows) {
      addFromValue(keys, (row as { document?: unknown }).document, publicBase)
    }
  }

  {
    const built = db.from('artist_landing_pages').select('document').order('id', { ascending: true })
    const rows = await paginateRows(built)
    for (const row of rows) {
      addFromValue(keys, (row as { document?: unknown }).document, publicBase)
    }
  }

  {
    const built = db.from('artist_documents').select('file_path').order('id', { ascending: true })
    const rows = await paginateRows(built)
    for (const row of rows) {
      const path = (row as { file_path?: string | null }).file_path
      addKey(keys, path ? extractR2Key(path, publicBase) : null)
    }
  }

  {
    const built = db.from('artist_invoices').select('id, artist_id, pdf_url, pdf_sha256').order('id', { ascending: true })
    const rows = await paginateRows(built)
    for (const row of rows) {
      const record = row as {
        id: string
        artist_id: string
        pdf_url?: string | null
        pdf_sha256?: string | null
      }
      addFromValue(keys, record.pdf_url, publicBase)
      if (record.pdf_url || record.pdf_sha256) {
        addKey(keys, invoiceObjectKey(record.artist_id, record.id))
      }
    }
  }

  {
    const built = db.from('portal_message_attachments').select('file_url').order('id', { ascending: true })
    const rows = await paginateRows(built)
    for (const row of rows) {
      addFromValue(keys, (row as { file_url?: string | null }).file_url, publicBase)
    }
  }

  {
    const built = db.from('message_attachments').select('url').order('id', { ascending: true })
    const rows = await paginateRows(built)
    for (const row of rows) {
      addFromValue(keys, (row as { url?: string | null }).url, publicBase)
    }
  }

  {
    const built = db.from('site_settings').select('value').order('key', { ascending: true })
    const rows = await paginateRows(built)
    for (const row of rows) {
      addFromValue(keys, (row as { value?: string | null }).value, publicBase)
    }
  }

  {
    const built = db.from('assets').select('public_url').order('id', { ascending: true })
    const rows = await paginateRows(built)
    for (const row of rows) {
      addFromValue(keys, (row as { public_url?: string | null }).public_url, publicBase)
    }
  }

  return keys
}
