# Brief: CounselOS Slice 1 — Transactions

## Client

Meridian Law, a twelve-person practice running matter billing on a
spreadsheet and a shared mailbox. CounselOS is the replacement.

## Problem

Every billable event is entered twice: once by the fee earner in a
timesheet, once by the practice manager into the invoice run. The
second entry is where the errors are, and there is no record that
links an invoice line back to the event it came from.

## What this slice is

One vertical slice through the transactions module: a transaction can
be recorded once, listed, and read back, through the API and through
the UI, with the same shape at both ends.

This is the first slice. It establishes the layering, the contract,
and the two gates. Every slice after it follows the pattern this one
sets, so the pattern matters more here than the feature does.

## In scope

- The transactions table, service, repository, and controller
- Create, list, and read a single transaction
- The transactions route and list view in the web app
- The phase-1 API surface, frozen as the contract
- An API test suite and a browser test suite, both gating

## Out of scope

Editing and deleting a transaction. Invoicing. Matter linkage.
Authentication beyond what already exists. Pagination beyond a
default limit. Currency other than GBP.

Anything in this list that turns out to be load-bearing is a
blocker, not a quiet addition.

## Constraints

The contract at `.avel/contract/phase1.openapi.json` is frozen. Phase
2 is diffed against it and a breaking change fails the conformance
gate.

`packages/shared` is read-only to every agent on this mission. A
missing shared primitive is a blocker.

The composition root is append-only. Register the module; change
nothing else in that file.

## Definition of done

Both gates green, neither optional:

- `pnpm --filter api test:e2e`
- `pnpm --filter web test:e2e`

Plus zero ownership violations, coverage delta at or above zero, and
mutation score at or above the global floor.

## What would make this slice a failure

A working feature with a shape the next slice cannot follow. The
deliverable is the pattern as much as the transactions module, and a
slice that ships green while establishing a layering the second
feature has to break has not shipped.
