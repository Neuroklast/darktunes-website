import Stripe from 'stripe'

let stripeClient: Stripe | null = null

export function getStripeClient(): Stripe | null {
  const secret = process.env.STRIPE_SECRET_KEY
  if (!secret) return null
  if (!stripeClient) {
    stripeClient = new Stripe(secret)
  }
  return stripeClient
}

export function getStripeWebhookSecret(): string | null {
  return process.env.STRIPE_WEBHOOK_SECRET ?? null
}