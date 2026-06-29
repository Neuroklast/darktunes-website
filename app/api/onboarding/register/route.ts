import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withErrorHandler, ApiError } from '@/lib/errors'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import { createOrganization } from '@/lib/api/organizations'
import { getPlanBySlug } from '@/lib/api/plans'
import { getStripeClient } from '@/lib/stripe/client'

const bodySchema = z.object({
  name: z.string().min(2).max(120),
  slug: z
    .string()
    .min(2)
    .max(48)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  planSlug: z.enum(['starter', 'professional', 'business']).default('starter'),
  billingInterval: z.enum(['month', 'year']).default('month'),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
})

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = bodySchema.parse(await req.json())
  const db = await createServiceRoleSupabaseClient()

  const existing = await db.from('organizations').select('id').eq('slug', body.slug).maybeSingle()
  if (existing.data) throw new ApiError(409, 'Organization slug already taken')

  const org = await createOrganization(db, {
    name: body.name,
    slug: body.slug,
    status: 'pending',
  })

  const plan = await getPlanBySlug(db, body.planSlug)
  if (!plan) throw new ApiError(404, 'Plan not found')

  await db.from('organization_branding').insert({
    organization_id: org.id,
    primary_color: '#c41e3a',
    secondary_color: '#1a1a2e',
  })

  const stripe = getStripeClient()
  if (!stripe) {
    return NextResponse.json({
      organization: org,
      checkoutUrl: null,
      message: 'Organization created; Stripe not configured for billing.',
    })
  }

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
          product_data: { name: `${plan.name} Plan — ${org.name}` },
        },
        quantity: 1,
      },
    ],
    metadata: {
      organization_id: org.id,
      plan_id: plan.id,
      billing_interval: body.billingInterval,
    },
  })

  return NextResponse.json({
    organization: org,
    checkoutUrl: session.url,
    sessionId: session.id,
  })
})