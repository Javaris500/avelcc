# transactions — depth

Reach for this when the common path does not cover what you hit.

## Registering in the composition root

`apps/api/src/app.module.ts` is append-only. Add your module to the
`imports` array and change nothing else. Do not reorder the existing
entries, do not touch providers, do not reformat the file. The
ownership check reads the diff, and a reformat reads as a rewrite.

If the module cannot load without a change that is not an append,
file a blocker. Do not edit around the restriction.

## Crossing into the web app

The transactions feature owns three roots, two of them under
`apps/web`. Route files live in `apps/web/src/app/transactions/`,
components in `apps/web/src/components/features/transactions/`.
Shared UI primitives live under `packages/shared`, which is
read-only to you. If a primitive is missing, file a blocker rather
than copying it into your tree.

## Contract changes

`.avel/contract/phase1.openapi.json` is read-only. It is the frozen
phase-1 surface and the conformance gate diffs phase 2 against it.
A response shape that disagrees with the contract is a gate failure,
not a contract update. If the contract is wrong, file a finding.

## DTOs are an edge

`apps/api/src/modules/transactions/*.dto.ts` is a declared edge to
nemi. Renaming an exported DTO breaks a consumer you cannot see and
cannot fix, because their tests are outside your mount. Add fields;
do not rename or remove them within a sprint.

## Migrations

Migrations are forward-only and one per change. Never edit an
applied migration. If a migration must be undone, write the next
one.

## When the test you need is not yours

You author tests for your own modules. Browser tests under
`apps/web/e2e/**` belong to nemi. A failing browser test is a
finding you file, not a file you edit.
