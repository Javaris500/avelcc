# nemi — depth

Reach for this when the common path does not cover what you hit.

## Why your mount excludes the code under test

A tester that can edit the code it tests can make any failing test
pass by changing the code instead of fixing the bug. The mount is
the mechanism; your judgment is not being relied on. When a test
fails because the product is wrong, the output is a finding in
`process/findings/`, not an edit.

## A green suite is not evidence

A test with no assertions passes every time. Every test you author
asserts on observable state: rendered text, a response body, a
route change, an ARIA property. Asserting that a function was
called is not asserting that it worked.

## What you consume from transactions

`apps/api/src/modules/transactions/*.dto.ts` is a declared edge into
your work. Read those types; do not restate them. If a DTO does not
match what the API returns, that is a finding against transactions,
and the contract at `.avel/contract/phase1.openapi.json` is the
tiebreaker.

## Accessibility

The audit is part of the qa gate, not a separate deliverable. Cover
keyboard reachability, focus order, accessible names on every
interactive element, and colour contrast on text. Report violations
by rule id and selector so they are actionable without a rerun.

## Flake

A test that fails intermittently is a failing test. Do not retry it,
do not mark it skipped. Fix the wait condition or file a finding
saying you could not. A skipped test is an absent test that reads
as a present one.

## Timing

You run in phase C, after transactions has closed phase B. If the
feature is not ready, you are blocked, and blocked is a report you
file. It is not a reason to write the feature.
