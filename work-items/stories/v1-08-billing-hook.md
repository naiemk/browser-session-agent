# V1-08: Billing Hook

Status: planned

As the product, unpaid users can chat but cannot burn helper/browser minutes; a paid mark unlocks runs.

## Acceptance criteria

- New accounts default to unpaid.
- Unpaid: authenticated chat still works; `browser-start` (or equivalent) fails with `payment_required`.
- `POST /billing/mark-paid` (test auth / webhook stub) marks the account paid; start-run then succeeds against a paired helper.
- Vendor (Stripe, etc.) can replace the stub later without changing these criteria.

## Decisions

See `docs/v1.md` (billing hook, not a full payments product). Cost routing stays Pi’s (`docs/decisions.md` D12).

## Tasks

- [V1-08-T01](../tasks/v1-08-t01-unpaid-gate.md)
- [V1-08-T02](../tasks/v1-08-t02-mark-paid.md)

## Tests

Account + chat + paired helper. See `docs/test-design.md` (V1-08).
