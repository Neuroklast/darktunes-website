import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { getPlanBySlug } from '@/lib/api/plans'

type DbClient = SupabaseClient<Database>

/** Seeds organization_features from plan_features after checkout. */
export async function provisionOrganizationPlanFeatures(
  db: DbClient,
  organizationId: string,
  planId: string,
): Promise<void> {
  const { data: features, error } = await db
    .from('plan_features')
    .select('feature_key, value')
    .eq('plan_id', planId)
  if (error) throw new Error(error.message)

  if (!features?.length) return

  const rows = features.map((f) => ({
    organization_id: organizationId,
    feature_key: f.feature_key,
    enabled: f.value === 'true' || f.value === 'unlimited',
  }))

  const { error: upsertError } = await db
    .from('organization_features')
    .upsert(rows, { onConflict: 'organization_id,feature_key' })
  if (upsertError) throw new Error(upsertError.message)
}

export async function provisionOrganizationFromPlanSlug(
  db: DbClient,
  organizationId: string,
  planSlug: string,
): Promise<void> {
  const plan = await getPlanBySlug(db, planSlug)
  if (!plan) return
  await provisionOrganizationPlanFeatures(db, organizationId, plan.id)
}