/**
 * DAL for apify_usage_months — monthly billable URL counter for free tier.
 * Scoped per organization (each label has its own budget counter).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { APIFY_MONTHLY_URL_BUDGET } from '@/lib/analytics/apifySpotifyPlayCountClient'
import { DEFAULT_ORGANIZATION_ID } from '@/lib/organizations/constants'

type DbClient = SupabaseClient<Database>

export interface ApifyUsageMonth {
  yearMonth: string
  urlsCharged: number
  budget: number
  updatedAt: string
  organizationId: string
}

export async function getApifyUsageMonth(
  db: DbClient,
  yearMonth: string,
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<ApifyUsageMonth> {
  const { data, error } = await db
    .from('apify_usage_months')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('year_month', yearMonth)
    .maybeSingle()

  if (error) throw new Error(error.message)

  if (!data) {
    return {
      yearMonth,
      urlsCharged: 0,
      budget: APIFY_MONTHLY_URL_BUDGET,
      updatedAt: new Date(0).toISOString(),
      organizationId,
    }
  }

  return {
    yearMonth: data.year_month,
    urlsCharged: data.urls_charged,
    budget: data.budget,
    updatedAt: data.updated_at,
    organizationId: data.organization_id,
  }
}

/**
 * Atomically increments urls_charged for the month (upsert).
 * Caller must ensure budget was checked beforehand.
 */
export async function incrementApifyUsage(
  db: DbClient,
  yearMonth: string,
  delta: number,
  budget: number = APIFY_MONTHLY_URL_BUDGET,
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<ApifyUsageMonth> {
  if (delta <= 0) return getApifyUsageMonth(db, yearMonth, organizationId)

  const current = await getApifyUsageMonth(db, yearMonth, organizationId)
  const next = current.urlsCharged + delta
  const now = new Date().toISOString()

  const { data, error } = await db
    .from('apify_usage_months')
    .upsert(
      {
        organization_id: organizationId,
        year_month: yearMonth,
        urls_charged: next,
        budget: current.budget || budget,
        updated_at: now,
      },
      { onConflict: 'organization_id,year_month' },
    )
    .select('*')
    .single()

  if (error) throw new Error(error.message)

  return {
    yearMonth: data.year_month,
    urlsCharged: data.urls_charged,
    budget: data.budget,
    updatedAt: data.updated_at,
    organizationId: data.organization_id,
  }
}
