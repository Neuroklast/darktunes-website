import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

type DbClient = SupabaseClient<Database>

export interface Plan {
  id: string
  slug: string
  name: string
  priceMonthlyCents: number
  priceYearlyCents: number
  isActive: boolean
  features: Record<string, string>
}

export async function listActivePlans(db: DbClient): Promise<Plan[]> {
  const { data: plans, error } = await db
    .from('plans')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
  if (error) throw new Error(error.message)

  const planIds = (plans ?? []).map((p) => p.id)
  if (!planIds.length) return []

  const { data: features, error: featError } = await db
    .from('plan_features')
    .select('plan_id, feature_key, value')
    .in('plan_id', planIds)
  if (featError) throw new Error(featError.message)

  const featureMap = new Map<string, Record<string, string>>()
  for (const f of features ?? []) {
    const existing = featureMap.get(f.plan_id) ?? {}
    existing[f.feature_key] = f.value
    featureMap.set(f.plan_id, existing)
  }

  return (plans ?? []).map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    priceMonthlyCents: p.price_monthly_cents,
    priceYearlyCents: p.price_yearly_cents,
    isActive: p.is_active,
    features: featureMap.get(p.id) ?? {},
  }))
}

export async function getPlanBySlug(db: DbClient, slug: string): Promise<Plan | null> {
  const plans = await listActivePlans(db)
  return plans.find((p) => p.slug === slug) ?? null
}