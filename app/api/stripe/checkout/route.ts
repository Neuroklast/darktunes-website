import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withErrorHandler, ApiError } from '@/lib/errors'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import { getStripeClient } from '@/lib/stripe/client'
import { getPlanBySlug } from '@/lib/api/plans'

const bodySchema = z.object({
  organizationId: z.string().uuid(),
  planSlug: z.enum(['starter', 'professional', 'business']),
  billingInterval: z.enum(['month', 'year']).default('month'),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
})

export const POST = withErrorHandler(async (req: NextRequest) => {
  const stripe = getStripeClient()
  if (!stripe) throw new ApiError(503, 'Stripe is not configured')

  const body = bodySchema.parse(await req.json())
  const db = await createServiceRoleSupabaseClient()
  const plan = await getPlanBySlug(db, body.planSlug)
  if (!plan) throw new ApiError(404, 'Plan not found')

  const amountCents =
    body.billingInterval === 'year' ? plan.priceYearlyCents : plan.priceMonthlyCents

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    success_url: body.successUrl,
    cancel_url: body.cancelUrl,
    line_items: [
      {
        price_data: {
          currency: 'eur',
          unit_amount: amountCents,
          recurring: { interval: body.billingInterval },
          product_data: { name: `${plan.name} Plan` },
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