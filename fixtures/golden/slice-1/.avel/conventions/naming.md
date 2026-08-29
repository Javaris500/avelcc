# Naming

## Files

kebab-case, always. `transaction-list.tsx`, not `TransactionList.tsx`.

Backend files carry their layer: `transactions.controller.ts`,
`transactions.service.ts`, `transactions.repository.ts`,
`transactions.module.ts`, `transactions.dto.ts`.

Test files sit beside what they test: `transactions.service.spec.ts`.
Browser tests live under `apps/web/e2e/` and end in `.spec.ts`.

## Code

Types and components PascalCase. Functions and variables camelCase.
Constants that are genuinely constant SCREAMING_SNAKE_CASE.

A boolean reads as a predicate: `isPosted`, `hasMatter`, `canVoid`.
Never `posted` for a boolean and never a negative name like
`notPosted`.

## Database

Tables plural snake_case: `transactions`. Columns snake_case.
Foreign keys are `<singular>_id`: `matter_id`. Money is stored in
minor units as an integer, in a column ending `_minor`, never a
float.

Timestamps end `_at` and are `timestamptz`. Never a bare `date`
column for something that happens at a moment.

## API

Paths are plural nouns, lowercase, kebab-case: `/transactions`,
`/transactions/{id}`. No verbs in a path. The method is the verb.

JSON fields are camelCase at the boundary even though columns are
snake_case. The mapping happens in the repository and nowhere else.

## Modules and features

A feature directory is the singular domain word, plural only if the
domain is plural: `transactions`. The same word names the module,
the route, the component directory, and the table. One feature, one
word, everywhere.
