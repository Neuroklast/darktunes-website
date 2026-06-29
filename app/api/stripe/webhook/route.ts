import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandler, ApiError } from '@/lib/errors'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import { getStripeClient, getStripeWebhookSecret } from '@/lib/stripe/client'
import { writeOrganizationAuditLog } from '@/lib/api/organizationAuditLog'

export const POST = withErrorHandler(async (req: NextRequest) => {
  const stripe = getStripeClient()
  const webhookSecret = getStripeWebhookSecret()
  if (!stripe || !webhookSecret) {
    throw new ApiError(503, 'Stripe is not configured')
  }

  const signature = req.headers.get('stripe-signature')
  if (!signature) throw new ApiError(400, 'Missing stripe-signature header')

  const rawBody = await req.text()
  const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
  const db = await createServiceRoleSupabaseClient()

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object
      const organizationId = session.metadata?.organization_id
      const planId = session.metadata?.plan_id
      if (!organizationId || !planId) break

      await db.from('subscriptions').upsert({
        organization_id: organizationId,
        plan_id: planId,
        stripe_customer_id: typeof session.customer === 'string' ? session.customer : null,
        stripe_subscription_id:
          typeof session.subscription === 'string' ? session.subscription : null,
        status: 'active',
        billing_interval: session.metadata?.billing_interval ?? 'month',
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      })

      await db.from('organizations').update({ status: 'active' }).eq('id', organizationId)

      await writeOrganizationAuditLog(db, {
        organizationId,
        action: 'subscription.activated',
        targetType: 'plan',
        targetId: planId,
        metadata: { stripeSessionId: session.id },
      })
      break
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object
      const stripeSubId = sub.id
      await db
        .from('subscriptions')
        .update({ status: 'canceled' })
        .eq('stripe_subscription_id', stripeSubId)
      break
    }
    default:
      break
  }

  return NextResponse.json({ received: true })
})