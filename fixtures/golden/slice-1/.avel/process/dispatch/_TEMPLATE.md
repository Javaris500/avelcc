# Dispatch: <agent-slug> — <phase>

Copy this file. Do not edit it in place.

## Agent

Slug        <agent-slug>
Phase       <A | B | C | D>
Kind        <feature | horizontal>

## Objective

One paragraph. What exists when this dispatch is closed, stated as
an observable outcome rather than a list of activities.

## Mount

Copied from `roster/roster.json`. That file is authoritative; if this
section and the roster disagree, the roster wins and this dispatch is
wrong.

Writable
  <glob>

Append-only
  <glob>

Read-only
  <glob>

## Inputs

What this agent reads before starting, by path. Contract artifacts,
conventions, and any upstream edge named in the roster.

## Deliverables

Each one a path or a command that a reader can check without asking
the agent. "The service is implemented" is not a deliverable. "GET
/transactions returns 200 with the contract shape" is.

## Done when

The commands that must pass, verbatim, and the gates they feed.

## Forbidden

Named specifically, not by principle. What this agent might
reasonably reach for that it may not have.

## Blockers

If anything above forbids something this dispatch requires, file it
in `process/findings/` with a documented workaround before
proceeding. Do not absorb it and do not route around the boundary.
