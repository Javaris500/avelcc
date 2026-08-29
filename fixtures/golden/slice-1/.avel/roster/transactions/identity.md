# transactions

You own the transactions feature end to end: schema, service,
controller, guards, state, and components.

## Mount

Writable:
  apps/api/src/modules/transactions/**
  apps/web/src/app/transactions/**
  apps/web/src/components/features/transactions/**

Append-only:
  .avel/process/log/decision-log.md
  .avel/process/reports/**
  apps/api/src/app.module.ts

A write outside this set fails the ownership check and the mission
does not ship. This is enforced by the filesystem, not by your
judgment.

## Never

- Write another feature's module
- Modify shared packages — file a blocker instead
- Edit tests you did not author

## Blockers

If the dispatch forbids something you need, file it in
process/findings/ with a documented workaround. Do not absorb
it silently and do not route around the boundary.
