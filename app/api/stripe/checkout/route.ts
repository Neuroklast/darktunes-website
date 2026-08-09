import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withErrorHandler, ApiError } from '@/lib/errors'
import {
  createServerSupabaseClient,
  createServiceRoleSupabaseClient,
} from '@/lib/supabase/server'
import { getStripeClient } from '@/lib/stripe/client'
import { getPlanBySlug } from '@/lib/api/plans'
import { assertBillingOrganizationAccess } from '@/lib/stripe/assertBillingOrganizationAccess'

const bodySchema = z.object({
  organizationId: z.string().uuid(),
  planSlug: z.enum(['starter', 'professional', 'business']),
  billingInterval: z.enum(['month', 'year']).default('month'),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
})

/**
 * Start Stripe Checkout for an existing organization subscription.
 * Requires authenticated caller with platform_admin or organization_users membership.
 * Open registration uses `/api/onboarding/register` instead (creates org + session).
 */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const stripe = getStripeClient()
  if (!stripe) throw new ApiError(503, 'Stripe is not configured')

  const body = bodySchema.parse(await req.json())

  const authClient = await createServerSupabaseClient()
  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser()
  if (authError || !user) throw new ApiError(401, 'Unauthorized')

  const db = await createServiceRoleSupabaseClient()

  const { data: org, error: orgError } = await db
    .from('organizations')
    .select('id, name, status')
    .eq('id', body.organizationId)
    .maybeSingle()
  if (orgError) throw new ApiError(503, 'Failed to load organization')
  if (!org) throw new ApiError(404, 'Organization not found')

  await assertBillingOrganizationAccess(db, user.id, body.organizationId)

  const plan = await getPlanBySlug(db, body.planSlug)
  if (!plan) throw new ApiError(404, 'Plan not found')

  const amountCents =
    body.billingInterval === 'year' ? plan.priceYearlyCents : plan.priceMonthlyCents

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    success_url: body.successUrl,
    cancel_url: body.cancelUrl,
    client_reference_id: body.organizationId,
    line_items: [
      {
        price_data: {
          currency: 'eur',
          unit_amount: amountCents,
          recurring: { interval: body.billingInterval },
          product_data: { name: `${plan.name} Plan — ${org.name}` },
        },
        quantity: 1,
      },
    ],
    metadata: {
      organization_id: body.organizationId,
      plan_id: plan.id,
      billing_interval: body.billingInterval,
    },
  })

  return NextResponse.json({ url: session.url, sessionId: session.id })
})
