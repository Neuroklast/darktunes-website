/**
 * Stripe Billing webhook side-effects (idempotent per event id).
 * Signature verification stays in the route; this module is unit-testable.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'
import type { Database, Json } from '@/types/database'
import { writeOrganizationAuditLog } from '@/lib/api/organizationAuditLog'
import { provisionOrganizationPlanFeatures } from '@/lib/organizations/provisionPlanFeatures'

type DbClient = SupabaseClient<Database>

export type ProcessStripeWebhookResult =
  | { status: 'duplicate' }
  | { status: 'processed'; eventType: string }

export async function processStripeWebhookEvent(
  db: DbClient,
  event: Stripe.Event,
): Promise<ProcessStripeWebhookResult> {
  const { data: existing } = await db
    .from('stripe_webhook_events')
    .select('id')
    .eq('id', event.id)
    .maybeSingle()
  if (existing) {
    return { status: 'duplicate' }
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const organizationId = session.metadata?.organization_id
      const planId = session.metadata?.plan_id
      if (organizationId && planId) {
        await db.from('subscriptions').upsert(
          {
            organization_id: organizationId,
            plan_id: planId,
            stripe_customer_id: typeof session.customer === 'string' ? session.customer : null,
            stripe_subscription_id:
              typeof session.subscription === 'string' ? session.subscription : null,
            status: 'active',
            billing_interval: session.metadata?.billing_interval ?? 'month',
            current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          },
          { onConflict: 'organization_id' },
        )

        await db.from('organizations').update({ status: 'active' }).eq('id', organizationId)
        await provisionOrganizationPlanFeatures(db, organizationId, planId)

        await writeOrganizationAuditLog(db, {
          organizationId,
          action: 'subscription.activated',
          targetType: 'plan',
          targetId: planId,
          metadata: { stripeSessionId: session.id },
        })
      }
      break
    }
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription & {
        current_period_end?: number | null
      }
      const periodEnd =
        typeof sub.current_period_end === 'number'
          ? new Date(sub.current_period_end * 1000).toISOString()
          : null
      await db
        .from('subscriptions')
        .update({
          status:
            sub.status === 'active'
              ? 'active'
              : sub.status === 'trialing'
                ? 'trialing'
                : 'past_due',
          current_period_end: periodEnd,
        })
        .eq('stripe_subscription_id', sub.id)

      if (sub.status === 'past_due' || sub.status === 'unpaid') {
        const { data: row } = await db
          .from('subscriptions')
          .select('organization_id')
          .eq('stripe_subscription_id', sub.id)
          .maybeSingle()
        if (row?.organization_id) {
          await db
            .from('organizations')
            .update({ status: 'suspended' })
            .eq('id', row.organization_id)
        }
      }
      break
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      const stripeSubId = sub.id
      const { data: row } = await db
        .from('subscriptions')
        .select('organization_id')
        .eq('stripe_subscription_id', stripeSubId)
        .maybeSingle()
      await db
        .from('subscriptions')
        .update({ status: 'canceled' })
        .eq('stripe_subscription_id', stripeSubId)
      if (row?.organization_id) {
        await db.from('organizations').update({ status: 'suspended' }).eq('id', row.organization_id)
      }
      break
    }
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice & {
        subscription?: string | { id: string } | null
      }
      const stripeSubId =
        typeof invoice.subscription === 'string'
          ? invoice.subscription
          : invoice.subscription && typeof invoice.subscription === 'object'
            ? invoice.subscription.id
            : null
      if (stripeSubId) {
        await db
          .from('subscriptions')
          .update({ status: 'past_due' })
          .eq('stripe_subscription_id', stripeSubId)
      }
      break
    }
    default:
      break
  }

  await db.from('stripe_webhook_events').insert({
    id: event.id,
    type: event.type,
    payload: JSON.parse(JSON.stringify(event)) as Json,
  })

  return { status: 'processed', eventType: event.type }
}
