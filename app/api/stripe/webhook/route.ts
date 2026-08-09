import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandler, ApiError } from '@/lib/errors'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import { getStripeClient, getStripeWebhookSecret } from '@/lib/stripe/client'
import { processStripeWebhookEvent } from '@/lib/stripe/processWebhookEvent'

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

  const result = await processStripeWebhookEvent(db, event)
  if (result.status === 'duplicate') {
    return NextResponse.json({ received: true, duplicate: true })
  }

  return NextResponse.json({ received: true })
})
