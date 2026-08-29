# Roster v2

Status: specced. No roster has executed. CounselOS Slice 1 will be the first.

This document defines the roster shape, the two ways it can be cut, how to choose between them for a given client stack, and what stays fixed regardless. It supersedes the v1 agents reference and the earlier version of this document, which presented one instantiation as if it were universal.

Related: SANDBOX.md covers where agents execute. DECISIONS-V2.md covers the gate model.

## The correction

The earlier version of this document listed fifteen agents cut by layer and presented them as AVEL's roster. That was wrong in a specific way worth recording.

Those fifteen were derived from a layer-organized codebase. Applied to a feature-organized one, the cut does not survive. NestJS puts a module's controller, service, repository, and DTO in one directory, so a layer boundary becomes a file-suffix pattern that no filesystem mount can enforce.

The earlier version treated that as an enforcement problem and reached for diff checking. It is a decomposition problem wearing an enforcement problem's clothes. Under a feature cut it does not arise at all: one agent owns the directory, and the mount works.

So:

> **AVEL does not have a roster. It has a roster shape that is instantiated per stack.**

The principle is fixed. The cut is chosen by reading the client's directory structure.

## What is fixed

These hold for every instantiation, on every stack, always.

**A boundary is worth its handoff cost only if it can be written as a set of writable paths.** This is the rule that decides everything else, including which cut to use.

**Verification agents cannot write source.** Test and quality agents get test directories and findings directories, nothing else. An agent that can edit the code it is testing can make any failing test pass by changing the code instead of fixing the bug. Remove the ability and you remove the temptation.

**Agents exchange declared artifacts, never direct messages.** Every handoff is a file: a contract, a type definition, a findings report. Handoffs cannot be eliminated, but they can be made verifiable instead of assumed. An artifact can be checked. An assumption can only be hoped about.

**Phases are global.** Foundations, then builders, then verification, then quality. Team or feature is a label, not a schedule. The v1 roster had frontend in wave 2 depending on an artifact produced by backend in wave 3, which is the kind of contradiction global phases prevent.

**Quality holds block authority above every builder.** The people who built something are biased toward shipping it. Only the human orchestrator overrides, and only with written rationale that renders into the delivery. See the gate override decision in DECISIONS-V2.md.

**An agent with no writable paths is not an agent.** This is what cut the two lead roles from v1. Neither wrote product code, so neither produced an artifact. Coordination and construction compete for attention in people; for a language model the scarce resource is context, and a lead consumes a great deal of it reading everyone's output to produce a summary no mechanism acts on. The integration pass is a script.

## Naming

The convention is not cosmetic. It tells you which kind of agent you are looking at from the folder name alone.

> A **personal name** means the agent owns no feature and builds no product code. It is horizontal.
> A **territory name** means the agent owns that territory through every layer. It is vertical.

Under this rule a personally-named agent sitting among territory-named folders is not an anomaly. It is the convention working.

Two reasons it holds beyond tidiness:

**The mount table is keyed by path.** `modules/transactions/` resolves to agent `transactions` directly. A personal name requires a lookup table, and a lookup table is a thing that drifts.

**A personal name implies persistence.** A persona is a character who travels across clients. A feature is a mission-scoped assignment that ends when the mount does. Personal names create the pull toward treating agents as staff, and treating agents as staff is what produced the two lead roles that had to be cut.

## Choosing the cut

Read the client's directory structure before assigning anyone.

| The codebase groups files by | Cut | One agent owns |
|---|---|---|
| Layer | Horizontal | One layer, across every feature |
| Feature | Vertical | One feature, through every layer |

**Layer-organized** looks like `services/`, `handlers/`, `db/`, `components/` at the top level. A Go service, a Rails app, most Express codebases. The layer boundary is a directory, so it mounts cleanly.

**Feature-organized** looks like `modules/transactions/`, `modules/documents/`, each holding its own controller, service, and repository. NestJS, Next.js app-router colocation, most Angular. The feature boundary is a directory; the layer boundary is a suffix pattern.

The test is mechanical: **which boundary is a directory in this codebase?** That is the cut. You are not choosing a philosophy, you are reading a filesystem.

## The horizontal instantiation

For layer-organized codebases. **Fourteen agents** — two in phase A, five in B, three in C, four in D.

Was fifteen. The quality lead was removed when the block decision became a function; see below.

Phase A, foundations, parallel, gates everything downstream:

| Agent | Owns |
|---|---|
| Leonora | Schema, migrations, the API contract artifact |
| Fantem | Design tokens, motion, primitives, the steal list |

Phase B, builders, parallel within mounted directories:

| Agent | Owns |
|---|---|
| Ghost | State architecture, the data boundary, rendering strategy |
| Leon | Feature components, composition, data visualization |
| Kel | Domain services and business rules |
| Dunn | Route handlers, integrations, real-time |
| Gat | Identity, authorization, trust boundaries |

Phase C, verification:

| Agent | Owns |
|---|---|
| Iyo | Backend tests |
| Nemi | Frontend tests and the accessibility audit |
| Kodie | Performance budget |

Phase D, quality:

| Agent | Owns |
|---|---|
| Brennan | Verification against the spec |
| Zane | Security, using the implementer's documentation as the attack map |
| Raze | Adversarial testing with no spec |
| Fenn | Deploy, rollback proof, final CI gate |

**The block decision is not an agent.** See below.

### Mount table

Paths are illustrative. Concrete globs come from the client project and are stored in `AgentTemplate.writable_paths`.

| Agent | Writable | Read-only |
|---|---|---|
| Leonora | `db/`, `migrations/`, `contract/` | none |
| Fantem | `tokens/`, `styles/`, `primitives/` | none |
| Ghost | `lib/`, `stores/`, `hooks/`, `types/` | `contract/` |
| Leon | `components/`, `app/` | `primitives/`, `tokens/`, `types/` |
| Kel | `services/`, `domain/` | `db/`, `contract/` |
| Dunn | `routes/`, `api/`, `integrations/` | `services/`, `contract/` |
| Gat | `auth/`, `middleware/` | `db/`, `contract/` |
| Iyo | `tests/backend/` | all source |
| Nemi | `tests/frontend/`, `tests/a11y/` | all source |
| Kodie | `tests/perf/` | all source |
| Brennan | `findings/spec/` | everything |
| Zane | `findings/security/`, `permissions/policy.json` | everything, incl. the security surface doc |
| Raze | `findings/adversarial/`, `tests/property/` | everything |
| Fenn | `deploy/`, `.github/workflows/` | everything |

Phase D agents were previously collapsed into a single "Quality" row. That contradicted the rule the whole document rests on — a boundary is only real if it is a set of writable paths, and one shared row means four agents writing to the same place. Split, with disjoint finding directories.

### Edges

| From | Artifact | To |
|---|---|---|
| Leonora | `contract/api.openapi.json` | Ghost, Dunn, Kel, Iyo |
| Fantem | `tokens/`, `primitives/` | Leon, Kodie |
| Ghost | `types/boundary.ts` | Leon |
| Kel | service signatures | Dunn |
| Gat | `docs/security-surface.md` | Zane |
| Phases C and D | `findings/` | `decide(findings)` — a function, not an agent |

Six edges instead of the fifteen an implicit graph would allow across the frontend team alone.

## The vertical instantiation

For feature-organized codebases. Agent count equals feature count, plus the horizontal roles.

One agent owns one feature through every layer: its schema tables, its services, its endpoints, its guards, its state, its components. It is dispatched once and gated once.

CounselOS is the reference implementation. Six feature agents (transactions, documents, deadlines, chat, drafts, case-ops) plus Nemi.

### Why the names do not transfer

There is no horizontal agent that corresponds to a feature agent. Kel owns every service across all features; transactions owns one service among many, plus five other layers. These are different boundaries, not different vocabularies for the same boundary.

**Nemi is the exception because Nemi is horizontal in both cuts.** She tests everything and owns no cell in the grid, which is exactly why her name transfers when the other six have nothing to inherit.

Feature agents should be named for their territory. That is not a naming slip; it is the correct convention for a cut where territory is the identity.

### The horizontal roles a vertical cut still needs

**Three, minimum. All build nothing.**

**Verification.** Nemi, or an equivalent. Tests every feature, writes only to test directories.

**Foundations.** This one is the gap the vertical cut opens and it must be filled explicitly.

Under the horizontal cut, Leonora owns schema conventions and the cross-feature contract. Under the vertical cut, six agents each own a slice of the schema and their own endpoints, and **nobody owns consistency between them.** Six agents will produce six ways of naming a timestamp column, six error envelope shapes, six pagination conventions, and you find out at integration.

A drift-recording file is not a substitute. Recording drift is what you do after you have already lost.

The foundations role owns shared schema conventions, the cross-feature contract, and the shared package. It writes conventions and reviews adherence. It does not build features.

Assign it to an existing agent, create one, or have the human orchestrator do it manually for the first slice. All three are acceptable. Leaving it unassigned is not.

**Security.** The third role, and it is currently unowned in the same way foundations was before Mission 002.

The merge queue says every agent's first backend module gets an adversarial security review in a fresh session before merge. "A fresh session" names a setting, not an owner. That is a condition with nobody attached to it, which is exactly the shape of the gap that blocked four times before the first commit.

Cross-feature permission interactions are a seam, and owning territory disqualifies you from judging a seam — the same reasoning that keeps verification horizontal. A feature agent cannot audit whether its own guards compose correctly with another feature's.

Under the horizontal cut this is Gat plus Zane. Under the vertical cut it needs a name and a mount, and it must not be a feature agent.

**Do not assign it to a feature agent.** Owning territory disqualifies you from judging a seam, which is the same reasoning that keeps the verification role horizontal.

**Foundations runs before the first feature agent, not after the second.**

This corrects an earlier version of this document, which said the role became necessary once two or more feature agents dispatched concurrently, reasoning that convention divergence requires concurrent writers.

Mission 002 falsified that. Foundations was needed on the first slice, with one agent running, and blocked four times before the first commit: the composition root, the shared package (three times), and the reports directory.

The reasoning error was about *function*. Divergence prevention is a second-order need and does require concurrent writers. **Provisioning is first-order and requires none.** Under a vertical cut, the first feature agent needs shared surface that does not exist yet and owns none of it. There is nothing to diverge from because there is nothing there.

So the role has two phases:

| Phase | When | Function |
|---|---|---|
| Provisioning | Before the first feature dispatch | Create the shared surface: composition root, shared package, contract conventions, reports and compliance directories |
| Convention keeping | Once two or more feature agents write concurrently | Prevent divergence across features |

The provisioning phase can be the operator. The convention-keeping phase is where making it an agent becomes worth considering, and by then completion reports will describe what it actually did.

### Vertical mount table shape

| Agent | Writable | Read-only |
|---|---|---|
| Feature agent | `apps/api/src/modules/<feature>/`, `apps/web/src/app/<feature>/`, `apps/web/src/components/features/<feature>/` | shared packages, other features, contract |
| Foundations | `packages/shared/`, `apps/api/src/common/`, `apps/api/src/database/`, contract conventions | all features |
| Verification | `apps/api/test/`, `apps/web/e2e/`, `**/*.spec.ts`, `**/*.test.tsx` | all source |
| Security | `findings/security/`, `permissions/policy.json`, `tests/property/` | all source, all features |

Every boundary here is a directory, so every boundary mounts. This is why the vertical cut is correct for feature-organized frameworks and the horizontal cut is not.

**Name the composition root explicitly.** Most feature-organized frameworks have one file every feature must register itself in: a NestJS `app.module.ts`, a router table, a plugin registry, a DI manifest. It belongs to no feature and every feature must write it.

Grant it **append-only** to every feature agent. Omitting it from the mount table means the first agent cannot load its own module, which is what happened in mission 002.

**Grant the process directories by default.** Every agent is required to write a completion report and any compliance attestation. Withholding `reports/` and `compliance/` forbids the thing the process requires.

### Sequencing

A vertical cut concentrates risk differently. One agent per slice means fewer coordination failures and more surface area per agent, including layers it may never have written before.

Stagger the first runs. One agent goes dispatch-to-completion before another starts. Choose the feature with the fewest external dependencies first, so an early failure is a process failure rather than pipeline complexity. Give each agent's first backend module an adversarial security review in a fresh session before merge.

Those conditions came from CounselOS's merge queue and they generalize.

## The block decision is a function, not an agent

The v1 roster and the first draft of this document both listed a quality lead holding pass-or-block authority over every builder. Applying this document's own rules removes it.

**It fails the boundary rule.** Its mount was `findings/`, which is a superset of `findings/spec/`, `findings/security/`, and `findings/adversarial/`. A superset is not a boundary. Every other agent in the roster is defined by a disjoint writable set; this one was defined by containing three others.

**It fails the artifact rule.** Its output was judgment over other agents' artifacts. That is the same shape as the two lead roles cut from v1, one layer higher. Authority does not change the shape — authority is a property of the gate, not of the agent standing next to it.

**And it violates the standing determinism rule.** DECISIONS-V2.md states that no inference runs in the render, freeze, gate, or delivery path. The pass-or-block decision is the gate. An agent performing inference to decide whether work ships is inference in the gate path, which is the one thing the architecture forbids outright.

**Resolution.** The block decision is a pure function over typed findings:

```
decide(findings: Finding[]) -> pass | block
```

Findings carry a severity and a class. The function is arithmetic over them. It is auditable, reproducible, and identical every run, which a model's judgment is not — and that matters most for the decision sitting above every other decision.

Brennan, Zane, and Raze remain agents. Findings are input to the gate, not the gate.

This puts the block decision alongside Blair and Plye on the permanently-code list. Replacing a provably correct function with a probably correct one is not an upgrade, and the gate is the last place to make that trade.

## Roles preserved in both cuts

Three v1 designs are the strongest part of the system and survive whichever cut is chosen.

**Implementer to attacker.** The agent that builds the security surface is required to document it. A separate agent uses that documentation as the attack map. Adversarial reuse of an artifact the builder had to produce anyway.

**Spec verifier and adversary, separated.** One agent verifies against the spec. Another breaks things without reading the spec first, because knowing what is supposed to work blinds you to what can break. Most rosters never separate those postures.

**The steal list.** Five real product decisions with evidence before the design agent may close. The only hard deliverable in the roster that is not code, and what separates research-backed design from training-data averages.

## The adversary now has mechanical inputs

This was the one strong role that had no mechanism behind it. The five gate additions supply three.

"Break everything without reading the spec" is a good instruction and a poor mechanism on its own. A language model with no spec produces plausible-looking adversarial tests — null, empty string, negative numbers. That is the training-data average of an edge case. It will not find the race condition.

Three inputs change that:

| Input | What it turns into |
|---|---|
| The permission matrix | Attack the undefined cells directly. Mission 002's authorization defect lived in one. |
| Property-based testing | Thousands of cases generated from stated invariants rather than a dozen imagined ones. fast-check for TypeScript, Hypothesis for Python. |
| The findings registry | Has this defect class appeared before, and does the current work reproduce it? |

The role moves from hypothesis to specced. Mount: `tests/property/` and `findings/adversarial/`, with read access to the permission matrix.

## The implementer-to-attacker edge becomes an artifact

The security pair is the best-designed relationship in the roster and it was still an unverifiable handoff: the implementer wrote prose, the attacker read it.

**Make the implementer's output the machine-readable permission policy** — the expected value for every role, resource, and state cell — rather than a document describing it.

Three things follow:

- The attacker has a concrete surface rather than a narrative
- The absence gate independently checks that every cell carries a declared expectation
- The edge is diffable, so a change to the security surface is visible as a diff rather than as a rewritten paragraph

This is the same move as the phase-1 contract: a handoff that can be verified rather than one that has to be trusted.

## The dispatch is generated, not authored

Mission 002 produced zero agent boundary violations across 61 files and **three operator errors**. All three were the same shape: a hand-written dispatch forbade something the mount table already granted — the composition root, the shared package, the reports directory.

The failure was not the agent misreading its boundary. It was a human transcribing a boundary that already existed in machine-readable form.

**Generate the dispatch from `roster.json`.** The mount section, the append-only list, the read-only set, and the edges are all already declared. A dispatch that derives them cannot contradict them.

That does not make the error less likely. It makes it structurally impossible, which is the standard every other mechanism in this system is held to.

What stays hand-written: the task, the acceptance criteria, and anything specific to this slice. What stops being hand-written: every boundary statement.

**Expected result for the next mission:** operator boundary errors go from three to zero, and if they do not, the cause is somewhere the mount table does not reach — which is itself a finding worth having.

## Command Center

Six roles that run the firm rather than the builds. Unaffected by the cut, since they operate between missions.

| Role | Function | Reality |
|---|---|---|
| Canon | Intake | **A real agent.** Turns raw client input into a structured brief and surfaces what is underspecified. Writes to `Intake`, never to `Mission`. The cut, the preset, and `RepoPolicy` are computed, not proposed. |
| Trace | Research | Unbuilt, V2 |
| Blair | Knowledge authority | Database and rules. Never a language model. |
| Plye | Loadout and export | Deterministic code. Never a language model. |
| Della | Billing and cost | Code and templates. Never a language model. |
| Uno | Client operations | Unbuilt, V2 |

Blair, Plye, and Della are permanently plain code. Trace and Uno are unbuilt. Canon is the one that earned inference, because intake is reasoning and it sits outside the gate path. Replacing a provably correct function with a probably correct one is not an upgrade.

## What this means for AVEL's data model

`RosterPreset` was modeled as a saved squad. Under this document it is the instantiation: a preset is a cut plus an agent set plus a mount table, applied to a mission.

`Mission` should record which cut is in effect, because the coherence rules differ. A vertical mission with no foundations role assigned is incoherent in a way a horizontal mission is not.

This is a shape change to DATA-CONTRACTS-V2.md, not yet applied.

## The one honest per-agent metric

Per-agent telemetry was demoted because with no missions run it is noise. The findings registry supplies a signal that needs no new instrumentation: **did this agent's work match a previously confirmed defect?**

That measures whether an agent repeats known mistakes. It is derived from data the gate already produces, and unlike throughput or lines written it cannot be gamed by looking busy.

Two rules for using it:

**Do not rank agents on it.** Ranking is how you get an agent that files fewer blockers because filing looks bad. Mission 002's most valuable behavior was three blockers filed rather than absorbed; a metric that penalizes that destroys the thing worth keeping.

**Aggregate at five missions, not before.** Two data points is not a trend, and a per-agent number computed from one run is an anecdote with a decimal point.

## Open questions

| Question | Status |
|---|---|
| Does `Mission` carry a `cut` field? | **Resolved.** Derived from the repo, not chosen. `cut`, `cut_source`, `cut_rationale`. See DATA-CONTRACTS-V2.md. |
| Who owns foundations in CounselOS Slice 1? | **Resolved.** The operator, unless a dispatch names someone else. Committed to all seven identity files and decision-log row 9. |
| Named identities or territory names? | **Resolved.** Territory names, per the naming rule above. Identity files were written 2026-08-16; the question was stale. |
| Should the horizontal instantiation be trimmed? | **Not on data — the rule already trimmed one.** A successful vertical mission is weak evidence about a horizontal roster: different cut, different coordination surface, different failure modes. The vertical cut's advantage is that it minimizes coordination, so it cannot measure coordination cost. Only a horizontal mission on a layer-organized codebase can. Until then the horizontal instantiation stays specced, untrimmed, and labeled untested. |
| Is the cut a property of the repository or of a mount root? | **Open.** A monorepo can be layer-organized on the backend and feature-organized on the frontend. CounselOS is uniform so it will not surface here, but a scalar `cut` bakes in an assumption. Decide before the first non-uniform client. |
