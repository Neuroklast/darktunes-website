# AI credits: accounting, limits and rollout

Credits are an internal consumption allowance, **not a customer payment balance**.
1 credit represents EUR 0.001 of calculated provider costs after a configurable
percentage buffer (25% by default). Actual paid provider fees are recorded separately.

## Deployment order

This repository uses `supabase/reset.sql` for additive, repeatable schema
updates. Apply the updated SQL **before deploying this branch**, since the assistant
intentionally fails closed if the credit schema is missing. Existing rows are never
deleted by the credit section. This does not automatically migrate production.

After applying SQL, visit **Admin → AI Assistant → KI-Credits**, enter the
verified real input/output prices in EUR per million tokens for every active
model (including fallback), set the allowance, and enable credit enforcement.
The feature is disabled by default. The old global/user token limits continue
to apply independently. No prices are hard-coded because provider plans can
change or have zero-cost promotional allowances.

## Quotas

* Artist context: a shared monthly account keyed by artist ID, not an individual
  band member. An admin working inside that context also spends artist credits.
* Editor without artist context: one monthly account per user.
* Admin in label context: shared label account.
* UTC calendar months. Existing accounts are updated when an admin edits limits.
* Defaults: Artist 1000, editor 2000, admin/label 10000 credits monthly.
* Token limits still enforce daily caps and per-turn input/output caps.

## Request lifecycle

1. The existing `reserve_ai_tokens` RPC reserves token capacity.
2. `reserve_ai_credits` atomically locks the shared monthly account and
   reserves a cost ceiling based on estimated input tokens and the maximum
   output tokens at the higher of output and reasoning rates.
3. Every model round has a unique `request_id:round` key.
4. `settle_ai_credits` records provider fees, observed token counts, and
   chargeable credits. Failed/aborted rounds carry zero charge; incomplete
   final output is not billed. Previously successful tool rounds are still
   billable if a later round fails.
5. Leftover reservation capacity is released. Reservations older than three
   minutes with no settlement are reclaimed on the next reservation for that
   account. If provider usage exceeds the estimate, the credit charge is
   capped at the reserved ceiling, while the real provider cost remains stored.
6. Retrying a settlement is idempotent. Stale or duplicate request IDs cannot
   result in double charging.

The available credit balance appears in the assistant, and the Admin panel
shows account limits, model cost totals, and the last 30 reservations.
The token usage dashboard now uses PostgreSQL aggregations rather than a
5,000-row JavaScript aggregation limit.

## Provider usage caveats

Provider reported token usage is authoritative when present. Estimated usage is
kept as an approximation. Reasoning tokens are assumed to be included in
`output_tokens` and are billed at the reasoning rate (or output rate if unset).
If a provider reports reasoning separately, its normalization must be adjusted
before enabling billing for that provider.

## Monitoring and retention

The `ai_credit_reservations` table records request ID, scope, model, consumption,
fees, and user ID for debugging and audit. No prompt text is stored. Its
RLS policies deny access to ordinary clients; authenticated server endpoints
enforce authorization. Establish a documented retention period for individual
transaction rows according to the site's privacy policy.

## Validation

Run `npm test`, `npm run ci` and the applicable type/build checks after
applying the new schema. Validate concurrent use by two members of the same
artist, cancellation, provider timeout, retries, rollover at UTC month
boundary, and missing model price. Avoid activating credit enforcement on
production before these checks and verified NVIDIA pricing.
