import type { Metadata } from 'next'
import Link from 'next/link'
import { createPublicSupabaseClient } from '@/lib/supabase/publicClient'
import { listActivePlans } from '@/lib/api/plans'

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Label website plans — public site, admin CMS, artist portal, and billing.',
  robots: { index: true, follow: true },
}

function formatEur(cents: number): string {
  return new Intl.NumberFormat('en-EU', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

/**
 * Platform pricing page. On darkTunes hosts this still works as an internal preview.
 * Marketing hosts (MARKETING_HOSTS) should prefer this route for acquisition.
 * Copy kept plain (no promo fluff).
 */
export default async function PricingPage() {
  let plans: Awaited<ReturnType<typeof listActivePlans>> = []
  try {
    plans = await listActivePlans(createPublicSupabaseClient())
  } catch {
    plans = []
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-16 text-foreground">
      <header className="mb-12 max-w-2xl">
        <p className="text-sm text-muted-foreground mb-2">Label platform</p>
        <h1 className="text-3xl font-semibold tracking-tight mb-3">Plans</h1>
        <p className="text-muted-foreground leading-relaxed">
          Pick a plan for your label site, admin CMS, and artist tools. After checkout you get a
          subdomain and a short setup checklist. Custom domains are available on higher plans.
        </p>
      </header>

      {plans.length === 0 ? (
        <p className="text-muted-foreground">
          Plans are not loaded yet. Apply the multi-tenant schema seed, or open{' '}
          <Link href="/onboarding" className="underline underline-offset-4">
            onboarding
          </Link>{' '}
          once Stripe and plans are configured.
        </p>
      ) : (
        <ul className="grid gap-6 md:grid-cols-3">
          {plans.map((plan) => (
            <li
              key={plan.id}
              className="rounded-xl border border-border bg-card p-6 flex flex-col gap-4"
            >
              <div>
                <h2 className="text-xl font-medium">{plan.name}</h2>
                <p className="mt-2 text-2xl font-semibold tabular-nums">
                  {formatEur(plan.priceMonthlyCents)}
                  <span className="text-sm font-normal text-muted-foreground"> / month</span>
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  or {formatEur(plan.priceYearlyCents)} / year
                </p>
              </div>
              <ul className="text-sm text-muted-foreground space-y-1 flex-1">
                {Object.entries(plan.features).map(([key, value]) => (
                  <li key={key}>
                    <span className="text-foreground/80">{key.replaceAll('_', ' ')}</span>: {value}
                  </li>
                ))}
              </ul>
              <Link
                href={`/onboarding?plan=${encodeURIComponent(plan.slug)}`}
                className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-11"
              >
                Start with {plan.name}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-12 text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link href="/login" className="underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </main>
  )
}
