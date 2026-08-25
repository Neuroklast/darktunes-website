import { describe, expect, it, vi } from 'vitest'
import { processStripeWebhookEvent } from '@/lib/stripe/processWebhookEvent'
import type Stripe from 'stripe'

const ORG = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const PLAN = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

function makeDb(opts: {
  existingEvent?: boolean
  subscriptionOrg?: string | null
}) {
  const inserts: unknown[] = []
  const upserts: unknown[] = []
  const orgUpdates: unknown[] = []
  const subUpdates: unknown[] = []

  const db = {
    from: vi.fn((table: string) => {
      if (table === 'stripe_webhook_events') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: opts.existingEvent ? { id: 'evt_1' } : null,
                error: null,
              }),
            }),
          }),
          insert: async (row: unknown) => {
            inserts.push(row)
            return { error: null }
          },
        }
      }
      if (table === 'subscriptions') {
        return {
          upsert: async (row: unknown) => {
            upserts.push(row)
            return { error: null }
          },
          update: (payload: unknown) => {
            subUpdates.push(payload)
            return {
              eq: async () => ({ error: null }),
            }
          },
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: opts.subscriptionOrg
                  ? { organization_id: opts.subscriptionOrg }
                  : null,
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'organizations') {
        return {
          update: (payload: unknown) => {
            orgUpdates.push(payload)
            return { eq: async () => ({ error: null }) }
          },
        }
      }
      if (table === 'organization_features' || table === 'plan_features') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
              data: [],
              error: null,
            }),
          }),
          upsert: async () => ({ error: null }),
          delete: () => ({ eq: async () => ({ error: null }) }),
        }
      }
      if (table === 'organization_audit_log') {
        return {
          insert: async () => ({ error: null }),
        }
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
        upsert: async () => ({ error: null }),
        update: () => ({ eq: async () => ({ error: null }) }),
        insert: async () => ({ error: null }),
      }
    }),
    _inserts: inserts,
    _upserts: upserts,
    _orgUpdates: orgUpdates,
    _subUpdates: subUpdates,
  }

  return db
}

vi.mock('@/lib/organizations/provisionPlanFeatures', () => ({
  provisionOrganizationPlanFeatures: vi.fn(async () => undefined),
}))

vi.mock('@/lib/api/organizationAuditLog', () => ({
  writeOrganizationAuditLog: vi.fn(async () => undefined),
}))

describe('processStripeWebhookEvent', () => {
  it('returns duplicate when event id already stored', async () => {
    const db = makeDb({ existingEvent: true })
    const result = await processStripeWebhookEvent(db as never, {
      id: 'evt_1',
      type: 'checkout.session.completed',
      data: { object: {} },
    } as unknown as Stripe.Event)
    expect(result).toEqual({ status: 'duplicate' })
    expect(db._upserts).toHaveLength(0)
  })

  it('activates subscription on checkout.session.completed', async () => {
    const db = makeDb({})
    const result = await processStripeWebhookEvent(db as never, {
      id: 'evt_new',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_1',
          customer: 'cus_1',
          subscription: 'sub_1',
          metadata: {
            organization_id: ORG,
            plan_id: PLAN,
            billing_interval: 'month',
          },
        },
      },
    } as unknown as Stripe.Event)

    expect(result).toEqual({ status: 'processed', eventType: 'checkout.session.completed' })
    expect(db._upserts.length).toBeGreaterThan(0)
    expect(db._orgUpdates).toContainEqual({ status: 'active' })
    expect(db._inserts).toHaveLength(1)
  })

  it('marks subscription past_due on invoice.payment_failed', async () => {
    const db = makeDb({})
    const result = await processStripeWebhookEvent(db as never, {
      id: 'evt_fail',
      type: 'invoice.payment_failed',
      data: {
        object: {
          subscription: 'sub_1',
        },
      },
    } as unknown as Stripe.Event)

    expect(result.status).toBe('processed')
    expect(db._subUpdates).toContainEqual({ status: 'past_due' })
  })
})
