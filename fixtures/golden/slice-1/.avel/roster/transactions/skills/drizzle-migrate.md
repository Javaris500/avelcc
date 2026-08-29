---
name: Drizzle Migration
recommended_for:
  - backend
slug: drizzle-migrate
source: counselos-house
type: capability
---

# Drizzle Migration

Generate and apply schema migrations with Drizzle Kit.

This skill declares a tool grant. It does not enforce one. Nothing in
the current runtime restricts which tools an agent may invoke, so
treat the grant as the boundary you are accountable to rather than
one you will be stopped at.

## Grant

```
pnpm --filter api drizzle-kit generate
pnpm --filter api drizzle-kit migrate
```

Generation reads the schema and writes a migration. Application runs
it against the connected database.

## Procedure

Edit the schema first. Generate second. Read the generated SQL before
applying it, every time, because a rename that Drizzle cannot see is
emitted as a drop followed by an add, and that is data loss rather
than a rename.

Apply against the local database. Run the API test suite. Commit the
schema change and the generated migration in the same commit.

## Rules

Migrations are forward-only. One migration per change. Never edit a
migration that has been applied anywhere, including locally, because
the checksum is what tells the next environment whether it has run.

If a migration is wrong, write the next one that corrects it.

A migration file is generated output. Do not hand-edit it to tidy the
SQL. If the SQL is wrong, the schema is wrong.

## Out of grant

Dropping a column that any deployed code still reads. Truncating a
table. Running `drizzle-kit push` against anything, which skips the
migration history and leaves environments unable to agree on state.
File a blocker instead.
