# AI credits rollout

Status: implementation committed to feature branch. **Production activation remains blocked until the database has been applied, verified model tariffs entered, and runtime/build tests completed.**

## Accounting contract

- 1 credit represents EUR 0.001 of internally budgeted AI expenditure, not a cash balance.
- Calculate cost using a versioned model tariff. Never assume all models cost the same.
- Provider usage is authoritative. If usage is estimated, mark the ledger record accordingly.
- Provider-specific reasoning semantics must be checked: reasoning may be included in output tokens.
- A failed provider call may cost the label money but must not automatically charge the artist.
- Keep existing token-based per-round and global safety limits.

## Verification and rollout checklist

1. Add additive SQL schema for model tariffs, artist/label allocations, reservations and immutable ledger entries.
2. Add transactional RPCs for reserve, settle and release, keyed by request ID and round ID. Enforce nonnegative balances and unique settlement keys in SQL.
3. Wire reservation into runAiTurn before every provider call. On completion settle actual usage and release unused reservation. Handle retries, cancellations, timeouts, crashes and stale reservations.
4. Decide whether admins/editors charge label budget, artists charge artist budget, and enforce membership checks server-side.
5. Extend usage API and admin reports with SQL-side aggregates, replacing the 5000-row reporting cap.
6. Add UI for available credits, recent charges, quota reset and administrator-adjusted grants.
7. Add integration tests for concurrent reservations, retries, fallback model, multi-round tools, provider errors, price changes, refunds, expired reservations and artist membership changes.
8. Verify actual NVIDIA price contracts before populating production tariff records.

Do not use the calculation utility alone as a billing system.
