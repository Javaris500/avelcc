# Golden Fixture

The hand-written `.avel/` package the renderer must reproduce byte-for-byte.

This document is the render specification. Everything the renderer needs to know is here, because everything the renderer produces is here. Write this by hand first, commit it, then write code until `render(mission)` matches it exactly.

## Why hand-write it

You discover the data model by producing the output once. Every field the renderer reaches for is a field that must exist; every field it never touches was speculation.

The test comes free:

```ts
expect(render(fixtureMission)).toEqual(goldenBytes)
```

And the determinism check comes free with it: render twice in one process, twice in fresh processes, once under `TZ=Asia/Tokyo LANG=tr_TR`, and diff the hashes.

## What the fixture must exercise

Small enough to hand-write, complete enough that the contract is fully discovered rather than partially.

| Must include | So that |
|---|---|
| Two agents in different phases | Phase ordering and per-agent rendering both matter |
| One feature agent and one horizontal agent | Both naming conventions and both mount shapes are exercised |
| A skill of each type | The `knowledge` / `capability` render branch is covered |
| A playbook with both gate policies | `mandatory` and `warn` both render |
| One declared edge | The edge graph is not theoretical |
| An append-only mount | The composition-root finding from Mission 002 is encoded |
| A phase-1 contract artifact | The conformance gate has something to diff against |

**Recommended agents: `transactions` and `nemi`.** Real, from CounselOS, minimal, and they sit at opposite ends of the cut — one owns a feature, one owns nothing and tests everything.

## The tree

```
.avel/
├── MISSION.md                      human entry point — read this first
├── manifest.json                   machine-readable, content-addressed
├── mission/
│   ├── brief.md
│   └── playbook.md
├── roster/
│   ├── roster.json                 mounts · phases · edges, machine-readable
│   ├── transactions/
│   │   ├── identity.md
│   │   ├── depth.md
│   │   └── skills/
│   │       ├── nestjs-module.md          type: knowledge
│   │       └── drizzle-migrate.md        type: capability
│   └── nemi/
│       ├── identity.md
│       ├── depth.md
│       └── skills/
│           └── playwright-gate.md        type: knowledge
├── contract/
│   └── phase1.openapi.json         what phase 2 gets diffed against
├── conventions/
│   ├── layering.md
│   ├── testing.md
│   └── naming.md
└── process/
    ├── dispatch/_TEMPLATE.md
    ├── reports/_TEMPLATE.md
    ├── findings/_TEMPLATE.md
    └── log/decision-log.md
```

**Not in the package:** `evidence/`. That is produced by the gate at verification time, not by the render. The renderer must never create it, or the two will disagree.

## The determinism rules this encodes

These are the constraints that make the fixture reproducible, and getting them wrong is the most likely source of a failing hash.

**No clock anywhere in rendered bytes.** No `exported_at`, no `generated_on`, no timestamps in file headers. Timestamps live in `version_manifest` in Postgres, which is queryable and is not part of the package.

**No randomness.** No UUIDs generated at render time. Mission and agent IDs are stable inputs, so they may appear; anything freshly generated may not.

**Sorted everything.** JSON object keys sorted lexicographically. Arrays sorted by a declared stable key — agents by slug, skills by slug, gates by gate name. Directory listings sorted before iteration, because `fs.readdir` order is OS-dependent.

**Normalized text.** LF line endings, trailing newline on every file, NFC Unicode normalization, no locale-sensitive comparison anywhere. Sort with an explicit comparator, never `localeCompare`.

## MISSION.md

The human entry point. An agent opening the package reads this first and needs no external context afterward.

```markdown
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
| B | transactions | The transactions feature, every layer |
| C | nemi | Frontend tests and the accessibility audit |

Foundations for this mission is the operator, unless a dispatch names someone else.

## Where things go

- Read `conventions/` before writing any code.
- Write completion reports to `process/reports/`.
- File blockers rather than absorbing them silently.
- Log every decision in `process/log/decision-log.md`.

## What is forbidden

Writing outside your declared mount. See `roster/roster.json`.
This is enforced, not advised.
```

## manifest.json

Machine-readable, content-addressed, no timestamps.

```json
{
  "avel_version": "1",
  "mission_id": "01J8Z4K2QW3E5R7T9Y1U3I5O7A",
  "sprint": 1,
  "cut": "vertical",
  "cut_source": "derived",
  "files": [
    { "path": "MISSION.md", "sha256": "..." },
    { "path": "contract/phase1.openapi.json", "sha256": "..." },
    { "path": "roster/roster.json", "sha256": "..." }
  ],
  "gate": {
    "mutation_floor": 60,
    "coverage_delta_min": 0,
    "config_sha256": "..."
  },
  "package_sha256": "..."
}
```

`files` is sorted by path. `package_sha256` is computed over the sorted file list and their hashes, excluding `manifest.json` itself.

`gate.config_sha256` is the hash of the versioned gate config, so "what bar did this mission ship against" stays answerable later. The floor is global and versioned, never per-mission.

## roster/roster.json

The mount table, machine-readable. This is what the sandbox reads to build mounts and what the ownership check compares the diff against.

```json
{
  "cut": "vertical",
  "phases": ["A", "B", "C", "D"],
  "agents": [
    {
      "slug": "nemi",
      "phase": "C",
      "kind": "horizontal",
      "writable": [
        "apps/web/e2e/**",
        "apps/web/src/**/*.test.tsx"
      ],
      "append_only": [
        ".avel/process/reports/**",
        ".avel/process/log/decision-log.md"
      ],
      "readonly": ["**"]
    },
    {
      "slug": "transactions",
      "phase": "B",
      "kind": "feature",
      "writable": [
        "apps/api/src/modules/transactions/**",
        "apps/web/src/app/transactions/**",
        "apps/web/src/components/features/transactions/**"
      ],
      "append_only": [
        "apps/api/src/app.module.ts",
        ".avel/process/reports/**",
        ".avel/process/log/decision-log.md"
      ],
      "readonly": [
        "packages/shared/**",
        ".avel/contract/**",
        ".avel/conventions/**"
      ]
    }
  ],
  "edges": [
    {
      "from": "operator",
      "artifact": ".avel/contract/phase1.openapi.json",
      "to": ["transactions"]
    },
    {
      "from": "transactions",
      "artifact": "apps/api/src/modules/transactions/*.dto.ts",
      "to": ["nemi"]
    }
  ]
}
```

Agents sorted by slug. Globs sorted within each array.

**`append_only` is the Mission 002 finding encoded.** The composition root belongs to no feature and every feature must register in it. Omit it and the first agent cannot load its own module. `process/reports/` and the decision log are the same shape — every agent is required to write there.

## mission/playbook.md

Process for this mission type, not this mission.

```markdown
# Playbook: full-build

## Waves
A → B → C → D

## Gates

| Gate | Policy |
|---|---|
| phase1-close | mandatory |
| alignment | mandatory |
| qa | mandatory |
| security | warn |
| acceptance | mandatory |

Gate policy is mandatory or warn only. Shipping past a red mandatory gate
requires a written override that is rendered into the delivery
and visible to the client.

## Deliverable
pr

## Required fields
brief · contract · roster · conventions

## Hard block
The mission must contain at least one active agent in the earliest
wave this playbook declares.
```

## conventions/layering.md

The stack rules an agent needs before writing anything. These come from the client project, not from AVEL.

```markdown
# Layering

controller → service → repository

A controller handles the HTTP request and nothing else.
A service holds business logic.
A repository talks to the database.

A controller never queries the database directly.
A module imports another module's service, never its repository.

Enforced by ESLint and a bootstrap guard. Violations fail the build.
```

`testing.md` and `naming.md` follow the same shape: short, imperative, and specific to the client's codebase.

## Agent files

Two per agent, each capped at 800 tokens by Zod refinement. `identity.md` is always loaded; `depth.md` is reached for when the agent hits something uncommon.

```markdown
# transactions

You own the transactions feature end to end: schema, service,
controller, guards, state, and components.

## Mount

Writable:
  apps/api/src/modules/transactions/**
  apps/web/src/app/transactions/**
  apps/web/src/components/features/transactions/**

Append-only:
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
```

**Note what that last section encodes.** Three operator errors in Mission 002 surfaced as filed blockers rather than silent workarounds, and that was the instructed behavior working the first time it was tested. It belongs in every identity file.

## Building it

1. Create the tree by hand. Real content, not lorem.
2. Normalize: LF endings, trailing newlines, sorted JSON keys.
3. Compute `sha256` per file, fill `manifest.json`, compute `package_sha256`.
4. Commit as `fixtures/golden/slice-1/`.
5. Write `render(mission) → Map<path, Buffer>` until it matches.

```ts
const golden = loadFixture('fixtures/golden/slice-1')
const out = render(fixtureMission)

expect([...out.keys()].sort()).toEqual([...golden.keys()].sort())
for (const [path, bytes] of golden) {
  expect(out.get(path)).toEqual(bytes)   // byte-for-byte
}
```

Then the determinism harness:

```ts
const a = packageHash(render(m))
const b = packageHash(render(m))
expect(a).toBe(b)                        // same process
// then: fresh process, and TZ=Asia/Tokyo LANG=tr_TR
```

## What this fixture will teach you

The point of writing it by hand is that the render contract stops being a guess.

Fields the renderer reaches for are fields `Mission`, `RosterEntry`, `Skill`, and `Playbook` must carry. Fields nothing touches are fields the schema does not need. That is how the data layer gets built over something that works rather than over a document.

Expect at least one surprise. Mission 002 found four in a process that had been designed for weeks.
