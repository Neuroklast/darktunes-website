import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { PortalFaqCategory, PortalFaqItem, PortalFaqTree } from '@/types'
import { stripEmojis, stripEmojisFromHtml } from '@/lib/stripEmojis'
import { DEFAULT_ORGANIZATION_ID } from '@/lib/organizations/constants'

type DbClient = SupabaseClient<Database>
type CategoryRow = Database['public']['Tables']['portal_faq_categories']['Row']
type CategoryInsert = Database['public']['Tables']['portal_faq_categories']['Insert']
type CategoryUpdate = Database['public']['Tables']['portal_faq_categories']['Update']
type ItemRow = Database['public']['Tables']['portal_faq_items']['Row']
type ItemInsert = Database['public']['Tables']['portal_faq_items']['Insert']
type ItemUpdate = Database['public']['Tables']['portal_faq_items']['Update']

function sanitizeText(value: string): string {
  return stripEmojis(value.trim())
}

function sanitizeNullableText(value: string | null | undefined): string | null {
  if (value == null) return null
  const trimmed = stripEmojis(value.trim())
  return trimmed.length > 0 ? trimmed : null
}

function sanitizeHtml(value: string): string {
  return stripEmojisFromHtml(value)
}

function rowToCategory(row: CategoryRow): PortalFaqCategory {
  return {
    id: row.id,
    slug: row.slug,
    titleEn: row.title_en,
    titleDe: row.title_de,
    sortOrder: row.sort_order,
    isPublished: row.is_published,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function rowToItem(row: ItemRow): PortalFaqItem {
  return {
    id: row.id,
    categoryId: row.category_id,
    slug: row.slug,
    questionEn: row.question_en,
    questionDe: row.question_de,
    answerHtmlEn: row.answer_html_en,
    answerHtmlDe: row.answer_html_de,
    keywords: row.keywords ?? [],
    portalRoute: row.portal_route,
    sortOrder: row.sort_order,
    isPublished: row.is_published,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function buildTree(categories: PortalFaqCategory[], items: PortalFaqItem[]): PortalFaqTree[] {
  const byCategory = new Map<string, PortalFaqItem[]>()
  for (const item of items) {
    const list = byCategory.get(item.categoryId) ?? []
    list.push(item)
    byCategory.set(item.categoryId, list)
  }

  return categories
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((category) => ({
      category,
      items: (byCategory.get(category.id) ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder),
    }))
    .filter((group) => group.items.length > 0 || !group.category.isPublished)
}

export async function getPublishedPortalFaq(
  db: DbClient,
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<PortalFaqTree[]> {
  const [categoriesRes, itemsRes] = await Promise.all([
    db
      .from('portal_faq_categories')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('is_published', true)
      .order('sort_order', { ascending: true }),
    db
      .from('portal_faq_items')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('is_published', true)
      .order('sort_order', { ascending: true }),
  ])

  if (categoriesRes.error) throw new Error(categoriesRes.error.message)
  if (itemsRes.error) throw new Error(itemsRes.error.message)

  const categories = (categoriesRes.data ?? []).map(rowToCategory)
  const publishedCategoryIds = new Set(categories.map((c) => c.id))
  const items = (itemsRes.data ?? [])
    .map(rowToItem)
    .filter((item) => publishedCategoryIds.has(item.categoryId))

  return buildTree(categories, items)
}

export async function getAllPortalFaqCategories(
  db: DbClient,
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<PortalFaqCategory[]> {
  const { data, error } = await db
    .from('portal_faq_categories')
    .select('*')
    .eq('organization_id', organizationId)
    .order('sort_order', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []).map(rowToCategory)
}

export async function getAllPortalFaqItems(
  db: DbClient,
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<PortalFaqItem[]> {
  const { data, error } = await db
    .from('portal_faq_items')
    .select('*')
    .eq('organization_id', organizationId)
    .order('sort_order', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []).map(rowToItem)
}

export async function getAdminPortalFaq(
  db: DbClient,
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<PortalFaqTree[]> {
  const categories = await getAllPortalFaqCategories(db, organizationId)
  const items = await getAllPortalFaqItems(db, organizationId)
  return buildTree(categories, items)
}

export function sanitizeCategoryWrite(
  input: Partial<CategoryInsert & CategoryUpdate>,
): CategoryInsert | CategoryUpdate {
  const payload: CategoryInsert | CategoryUpdate = { ...input }
  if (typeof payload.title_en === 'string') payload.title_en = sanitizeText(payload.title_en)
  if ('title_de' in payload) payload.title_de = sanitizeNullableText(payload.title_de ?? null)
  if (typeof payload.slug === 'string') payload.slug = sanitizeText(payload.slug).toLowerCase().replace(/\s+/g, '-')
  return payload
}

export function sanitizeItemWrite(
  input: Partial<ItemInsert & ItemUpdate>,
): ItemInsert | ItemUpdate {
  const payload: ItemInsert | ItemUpdate = { ...input }
  if (typeof payload.question_en === 'string') payload.question_en = sanitizeText(payload.question_en)
  if ('question_de' in payload) payload.question_de = sanitizeNullableText(payload.question_de ?? null)
  if (typeof payload.answer_html_en === 'string') payload.answer_html_en = sanitizeHtml(payload.answer_html_en)
  if ('answer_html_de' in payload) {
    const de = payload.answer_html_de
    if (de == null || !de.trim()) {
      payload.answer_html_de = null
    } else {
      payload.answer_html_de = sanitizeHtml(de)
    }
  }
  if (typeof payload.slug === 'string') payload.slug = sanitizeText(payload.slug).toLowerCase().replace(/\s+/g, '-')
  if (Array.isArray(payload.keywords)) {
    payload.keywords = payload.keywords.map((k) => sanitizeText(k)).filter(Boolean)
  }
  if (typeof payload.portal_route === 'string') {
    const route = sanitizeText(payload.portal_route)
    payload.portal_route = route.length > 0 ? route : null
  }
  return payload
}

export async function upsertPortalFaqCategory(
  db: DbClient,
  input: CategoryInsert & { id?: string },
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<PortalFaqCategory> {
  const payload = sanitizeCategoryWrite({
    ...input,
    organization_id: organizationId,
  }) as CategoryInsert
  const { data, error } = await db
    .from('portal_faq_categories')
    .upsert(payload, { onConflict: 'organization_id,slug' })
    .select()
    .single()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('No data returned from upsertPortalFaqCategory')
  return rowToCategory(data)
}

export async function updatePortalFaqCategory(
  db: DbClient,
  id: string,
  input: CategoryUpdate,
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<PortalFaqCategory> {
  const payload = sanitizeCategoryWrite(input) as CategoryUpdate
  // Never allow re-parenting a category to another org via update payload.
  delete (payload as { organization_id?: string }).organization_id
  const { data, error } = await db
    .from('portal_faq_categories')
    .update(payload)
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select()
    .single()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('Category not found')
  return rowToCategory(data)
}

export async function deletePortalFaqCategory(
  db: DbClient,
  id: string,
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<void> {
  const { error } = await db
    .from('portal_faq_categories')
    .delete()
    .eq('id', id)
    .eq('organization_id', organizationId)
  if (error) throw new Error(error.message)
}

export async function upsertPortalFaqItem(
  db: DbClient,
  input: ItemInsert & { id?: string },
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<PortalFaqItem> {
  // Category must belong to the same organization.
  const { data: category, error: catError } = await db
    .from('portal_faq_categories')
    .select('id')
    .eq('id', input.category_id)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (catError) throw new Error(catError.message)
  if (!category) throw new Error('FAQ category not found for this organization')

  const payload = sanitizeItemWrite({
    ...input,
    organization_id: organizationId,
  }) as ItemInsert
  const { data, error } = await db
    .from('portal_faq_items')
    .upsert(payload, { onConflict: 'organization_id,slug' })
    .select()
    .single()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('No data returned from upsertPortalFaqItem')
  return rowToItem(data)
}

export async function updatePortalFaqItem(
  db: DbClient,
  id: string,
  input: ItemUpdate,
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<PortalFaqItem> {
  if (input.category_id) {
    const { data: category, error: catError } = await db
      .from('portal_faq_categories')
      .select('id')
      .eq('id', input.category_id)
      .eq('organization_id', organizationId)
      .maybeSingle()
    if (catError) throw new Error(catError.message)
    if (!category) throw new Error('FAQ category not found for this organization')
  }

  const payload = sanitizeItemWrite(input) as ItemUpdate
  delete (payload as { organization_id?: string }).organization_id
  const { data, error } = await db
    .from('portal_faq_items')
    .update(payload)
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select()
    .single()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('FAQ item not found')
  return rowToItem(data)
}

export async function deletePortalFaqItem(
  db: DbClient,
  id: string,
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<void> {
  const { error } = await db
    .from('portal_faq_items')
    .delete()
    .eq('id', id)
    .eq('organization_id', organizationId)
  if (error) throw new Error(error.message)
}
