---
name: Playwright Gate
recommended_for:
  - qa
slug: playwright-gate
source: counselos-house
type: knowledge
---

# Playwright Gate

The browser test suite is one of two gates on this mission. It runs
as `pnpm --filter web test:e2e` and one red run means no ship.

## What a gate test asserts

Observable state a user could see: rendered text, a visible element,
a URL after navigation, a form's validation message, an accessible
name. Not a spy, not a call count, not an internal store value. A
test that asserts a function was called does not assert the feature
works.

Every test carries at least one assertion. A test with no assertion
passes every time and reads as coverage.

## Selectors

Use role and accessible name first: `getByRole('button', { name:
'Post transaction' })`. Fall back to `getByLabel` and `getByText`.
Use a test id only when no accessible handle exists, and when that
happens, the missing accessible name is itself a finding.

CSS and XPath selectors couple the test to markup that is not yours
to stabilise. Do not use them.

## Waiting

Assert on a condition, never on a duration. Playwright's expectations
retry; `waitForTimeout` does not. A test that needs a sleep is a test
that has not found its condition yet.

A test that fails intermittently is a failing test. Do not retry it
and do not skip it. Fix the condition or file a finding stating that
you could not.

## Fixtures

Each test creates the state it needs and does not depend on another
test having run. Order dependence turns one real failure into a wall
of noise that hides it.

## Accessibility

The audit runs inside this suite, not beside it. Check keyboard
reachability, focus order, an accessible name on every interactive
element, and text contrast. Report each violation by rule id and
selector.

## Boundary

The code under test is read-only to you. When a test fails because
the product is wrong, the output is a finding, not an edit.
