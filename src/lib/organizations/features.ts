import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

type DbClient = SupabaseClient<Database>

const PLAN_FEATURE_DEFAULTS: Record<string, Record<string, string>> = {
  starter: { max_artists: '10', epk_builder: 'true', custom_domain: 'false' },
  professional: {
    max_artists: '50',
    epk_builder: 'true',
    advanced_analytics: 'true',
    custom_domain: 'true',
  },
  business: {
    max_artists: 'unlimited',
    epk_builder: 'true',
    advanced_analytics: 'true',
    custom_domain: 'true',
    partner_api: 'true',
  },
}

export async function organizationHasFeature(
  db: DbClient,
  organizationId: string,
  featureKey: string,
): Promise<boolean> {
  const { data: override } = await db
    .from('organization_features')
    .select('enabled')
    .eq('organization_id', organizationId)
    .eq('feature_key', featureKey)
    .maybeSingle()
  if (override) return override.enabled

  const { data: sub } = await db
    .from('subscriptions')
    .select('plan_id, status')
    .eq('organization_id', organizationId)
    .maybeSingle()

  let planSlug = 'starter'
  if (sub?.plan_id) {
    const { data: plan } = await db.from('plans').select('slug').eq('id', sub.plan_id).maybeSingle()
    if (plan?.slug) planSlug = plan.slug
  }

  const planFeatures = PLAN_FEATURE_DEFAULTS[planSlug] ?? PLAN_FEATURE_DEFAULTS.starter
  const value = planFeatures[featureKey]
  return value === 'true' || value === 'unlimited' || (value !== undefined && value !== 'false')
}