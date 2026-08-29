# Mission: CounselOS Slice 1 — Transactions

**Client:** Meridian Law
**Type:** full-build
**Sprint:** 1
**Cut:** vertical (derived — feature-organized codebase)

## What ships

One vertical slice: the transactions module, backend through UI,
gated by both an API test and a browser test.

## Definition of done

Both gates green:
- `pnpm --filter api test:e2e`
- `pnpm --filter web test:e2e`

Neither is optional. One red means no ship.

## Who is running

| Phase | Agent | Owns |
|---|---|---|
| A | operator | The composition root, the api common layer, and shared packages |
| B | transactions | The transactions feature, every layer |
| C | nemi | Frontend tests and the accessibility audit |

Every agent on this mission, with its phase and its mount, is declared in
`roster/roster.json`. That file is authoritative. A dispatch narrows a mount.
It never widens one.

## Where things go

- Read `conventions/` before writing any code.
- Write completion reports to `process/reports/`.
- File blockers rather than absorbing them silently.
- Log every decision in `process/log/decision-log.md`.

## What is forbidden

Writing outside your declared mount. See `roster/roster.json`.
This is enforced, not advised.
