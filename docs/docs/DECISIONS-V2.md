# Decisions & Corrections

*What changed, why, and what was deliberately killed. **Read this before proposing anything** — several items below have already been considered and rejected, and a fresh session will otherwise re-propose them.*

*This document owns **rationale**. It contains no schema blocks and no stack tables — those live in `DATA-CONTRACTS-V2.md` and `TECH-STACK.md`. Where a decision has a shape, this doc explains why and links there.*

---

## The pattern behind most of these

An external review found that AVEL's mechanisms **stop one layer short of the thing they protect against**, and that it was a habit rather than a bug:

- Artifact-verified tests — written by the agent
- A gate — with a config-level bypass
- A deterministic core — fed nondeterministic input
- An audit protocol — enforced by good intentions

Most corrections below are that pattern being closed.

> **The test for any new mechanism: what layer does this stop short of?**
> Apply it to the correction itself, not just the original. Several corrections below initially failed their own test.

---

## Stack decisions

*Shapes and versions: `TECH-STACK.md`.*

### tRPC → ts-rest <!--allow-stale-->
**Finding:** tRPC produces no artifact. Type safety is compile-time only — nothing to diff, freeze, or verify against. Incompatible with machine-verified contract conformance, which is the top-priority fix. <!--allow-stale-->

**Decision:** ts-rest. It emits a real OpenAPI document, so `oasdiff` catches breaking changes in CI, the contract hash freezes into the export manifest, and the alignment gate stops being an attestation and becomes a diff — **for AVEL's own API.** The client-side half is a separate, unsolved problem; see `CLIENT-CONTRACT-CONFORMANCE.md`.

**Trade accepted:** smaller ecosystem than tRPC. Buying the artifact with it. <!--allow-stale-->

### Supabase → Neon <!--allow-stale-->
**Decision:** same Postgres, better fit. Database branching makes migration-heavy export-engine work cheap and resettable. Scale-to-zero suits a solo operator.

**Watch:** two connection strings — pooled for the app, direct/unpooled for `drizzle-kit`.

**Day one:** enable pgvector unused, so V2 retrieval needs no migration later.

### Added: Hono · pg-boss · Stryker · oasdiff · Pino · Sentry
- **pg-boss over BullMQ** — uses the Postgres you already have; no Redis to operate.
- **Stryker** — the highest-value addition. See "the test-authorship hole."

### TanStack Start — resolved

**Decision: TanStack Start.**

The case against it was that a dense internal tool with no SEO requirement and no public surface may not need a meta-framework, and that Vite plus TanStack Router gives identical routing with less churn.

That case was about the wrong axis. The router is the same either way — Start *is* TanStack Router plus a server. What decides it is that the Command Center has three things a pure client app cannot do cleanly:

| Need | Why a server is required |
|---|---|
| The GitHub credential | It must resolve server-side. A client app either proxies through a separate backend or leaks it. |
| The zip download | Streams frozen bytes from a route, outside the contract envelope. Needs a server route. |
| The webhook receiver | Same. GitHub posts to it. |

Without Start, all three force a separate Node process, which is a second deployment target and a second place for the credential boundary to be wrong.

Start also gives server functions for the blast-radius call, so the Trees API request and the local blob-SHA computation happen server-side and the client never sees a token.

**Trade accepted:** younger framework, smaller community, and the API has moved between versions. Pin the version and read release notes before upgrading.

**What this does not change:** the route tree, the contract, or any component. `ROUTES.md` is identical under either choice.

---

## Schema corrections

*Shapes: `DATA-CONTRACTS-V2.md`.*

### Capability merged into Skill — *an entity deleted*
**Finding:** Capability was Skill with an identical shape, plus two extra join tables, its own export render path, and its own version stamping — and it enforced nothing. Full schema, migration, API, and export cost for a naming convention.

**Decision:** one entity, `Skill.type = 'knowledge' | 'capability'`. Four join tables → two. The knows/does distinction survives as data rather than duplicate infrastructure.

**Reintroduce Capability as its own entity <!--allow-stale--> only when a runtime exists that can actually restrict a tool.** At that point it earns the table.

**Downstream requirement:** every doc and every client-facing description must say Capability **declares** and does not enforce. `PRODUCT.md` previously overclaimed this to buyers; corrected.

### `skippable` removed from Playbook gates <!--allow-stale-->
**Finding:** gate strictness was per-mission config authored by the person the gate constrains. At 2am against a deadline that is a blessed bypass — and it undoes the quality lead's block authority in config.

**Decision:** gates are `mandatory | warn`. Bypassing is an **override**, not a policy: `Export.gate_override` carries a written justification and is displayed permanently on that mission.

### The hard block is playbook-relative
**Finding:** the single hard block was "empty phase1" — but Playbook declares `waves_applicable`. For a discovery playbook that excludes phase1, empty phase1 is the *expected* state. Either it blocked every discovery mission or was silently exempt.

**Decision:** *"at least one active agent in the earliest wave the playbook declares."* The rule survives; the hardcoded assumption doesn't.

### Frozen bytes → R2 from the start
**Decision:** R2 from day one. No egress fees, and export bytes accumulate — blobs in the primary database get painful faster than expected.

**Conflict resolved 2026-08-17:** <!--allow-stale--> `TECH-STACK.md` previously listed `bytea` now / R2 later under "deliberately deferred," contradicting this. **R2 wins** — the schema carries `snapshot_key` and has no `bytea` column, so the deferral was the stale text. `TECH-STACK.md` corrected. *(Confirm this is the intended direction; it was resolved in favor of the schema.)*

**Critical:** `version_manifest` stays in Postgres and queryable. You cannot correlate outcomes to loadouts if the manifest is sealed inside the blob.

**New field:** `contract_sha256` — AVEL's own contract artifact, frozen alongside the bytes.

### Connection scoped per engagement
**Finding:** a fine-grained PAT with authority to open PRs and direct-push into **client repositories** — other people's code — covered by one line. No scoping, rotation, or revocation at engagement close. This is the largest real risk in the system.

**Decision:** `Connection` gains scope, status, and lifecycle timestamps. **The token is never stored** — `credential_ref` names where it lives. An export resolves both a Connection (*what authorizes this?*) and a RepoPolicy (*what am I allowed to do?*).

V1 still reads one token from env; the model supports many, so the second client is a row, not a migration.

---

### `computeCoherence` lives in `src/contract/` — **resolved**

**Finding:** coherence warnings must appear live as the operator toggles skills on the loadout screen. Calling the server per toggle is a round trip per checkbox; reimplementing it in the frontend creates two versions of a rule that will drift.

**Decision:** `computeCoherence(mission, playbook)` ships as **shared code in `src/contract/`**, imported by both sides.

**Why it is safe:** the function is pure — no database, no network, no clock, no randomness. It is a rule, not a query. The same property that makes the render deterministic makes this shareable.

**Why it belongs there specifically:** `src/contract/` is defined as the place neither side can edit unilaterally without the other noticing. A rule that both sides must agree on has exactly that requirement. Same reasoning that put the error-code union there.

**How it fits:** the server stays authoritative — the gate calls the same function at export time, and a client that lies about coherence still cannot ship. The frontend copy is for feedback, not for permission. That distinction is what makes sharing it safe rather than a soft boundary.

### `preset` route group added to the contract — **resolved**

**Finding:** RosterPreset is one of the twelve entities and `Playbook.default_preset_id` FKs to it, but `src/contract/` had no `preset.ts`. The loadout screen cannot build the apply-preset flow, and per the standing rule it cannot invent the shape locally either.

**Decision:** add `src/contract/preset.ts` with `list`, `get`, `create`, `update`, `apply`.

**How it fits:** `apply` is the one with semantics — it **materializes** RosterEntries (copy-then-edit); the preset holds no mission state. That is already the entity rule; the procedure name should make it obvious that applying is a write, not a reference. `skillSource` procedures are the same class of gap and should be added in the same change.

## The test-authorship hole

**Finding:** the empirical gate reads build/tests/analysis from an artifact — honest about what the suite *said*, but nothing checked whether the suite said anything. The agents that write the code also write its tests. **A suite that asserts nothing passes green.**

**Decision — three parts, and only one of them is currently a mechanism:**

| # | Fix | Kind | Status |
|---|---|---|---|
| 1 | Coverage delta ≥ 0 and a mutation-score floor in the gate | **mechanical** | `[specced]` |
| 2 | A separate QA agent verifies the suite covers the acceptance criteria | *attestation* | `[hypothesis]` |
| 3 | Testers never modify code under test | *rule* | **mechanizable — see below** |

**Part 1 is the real fix.** Mutation testing alters the source and fails if the suite doesn't notice. It does not care who wrote the tests, which is why it works where a role rule doesn't.

**Parts 2 and 3 were shipped as rules in a markdown file with nothing detecting a violation** — which is the exact pattern this whole section exists to close. Part 3 is mechanizable and should be mechanized: **a file-ownership check on the mission diff.** Each agent's writable paths are declared in its roster entry; at render time, any file modified by an agent outside its declared ownership is a gate failure. Part 2 has no mechanical form yet and stays an attestation; it should be labeled as one wherever it appears rather than counted as a fix.

### Mutation threshold — **resolved: global + versioned**

**Finding:** `verification.mutation.threshold` was stored per export and set by the operator. That is a per-mission numeric gate bypass, reintroduced inside the mechanism that replaced the last one. Lowering a threshold from 70 to 55 leaves no scar; removing the old policy flag was meant to ensure a bypass always scars.

**Decision:** the threshold is **global, versioned, and lives in config under source control.** Changing it is a commit, reviewed like code, with history. It is not a column on Export and not a field on Playbook.

**Why this and not per-mission-with-override:** an override record makes a bypass *visible*, but it still makes lowering the bar a normal in-flow action available at the moment you are least able to judge it. A commit is the correct amount of friction — it cannot be done mid-mission without leaving the mission, and it applies to every future mission rather than one.

**How it fits:** `Export.verification.mutation` keeps `score_pct`, `killed`, `survived` as *measurements*, and drops `threshold` as *policy*. The frozen export records the config hash so "what bar did this ship against" stays answerable, which is the same move as `contract_sha256`. Shape change in `DATA-CONTRACTS-V2.md`.

### Mutation scope — **resolved: changed files per export, full project at ship**

**Finding:** Stryker on a real client codebase runs the suite many times over. Verification moves from minutes toward hours, per export, on the job queue. That is a product constraint, not an ops footnote.

**Decision:** **incremental mutation on changed files for a normal export; full-project mutation on the final ship of a sprint.** The gate reads the same field either way; only the mutation set differs.

**Why:** a per-export gate that takes an hour will get worked around, and a gate that gets worked around is worse than one that does not exist. Changed-files mutation catches the thing that actually matters — a suite that does not assert on the code this mission wrote — at a cost that keeps the gate usable.

**How it fits:** `verification.mutation` gains `scope: 'changed' | 'full'` so the artifact says which bar it cleared. pg-boss job design assumes minutes for `changed`, and the full run is its own job. Open sub-question: whether the sprint-final full run blocks or reports.

### `gate_override` — **resolved: renders into the delivered package and the PR body**

**Finding:** single user. `overridden_by` is always you, the justification is written by you, and the permanent display is on your own dashboard. That is a diary entry, not accountability.

**Decision:** the override text is rendered **into the exported package and into the PR body**, where the client sees it.

**Why:** a scar only works if someone other than the person who caused it can see it. Writing it into the delivery makes the override a thing you have to explain to a client rather than a note you have to ignore. It also converts the mechanism into a selling point — a package that carries its own exceptions is more trustworthy than one that is silent about them.

**How it fits:** one addition to the render template and one to the PR body builder. It is deterministic (the text is data on the Export), so it does not disturb the render invariant. Reinforces the same principle as `blast_radius`: the client sees what actually happened, not a summary of it.

### Rejected: making the frontend tester horizontal
**Considered and declined.** A single horizontal tester across 18 build agents and six waves is a bottleneck on the critical path of every wave, and needs both frontend and backend depth. AVEL already has a horizontal layer — the QA wave. The problem was never a missing role; it was an unassigned duty. Roster unchanged.

---

## The gate is the commodity; the mission is the product

**Resolved 2026-08-21.** This governs how much of the export engine gets built and where effort goes after it.

**Finding:** `PRIOR-ART.md` establishes that AVEL's delivery gate already exists as shipped software at 5.2k stars, and that AVEL should map its design rather than depend on it — because an AI-driven pipeline puts inference in the delivery path and breaks the determinism rule. But the same finding cuts the other way too: **if a gate is something someone else already shipped, a gate is not what makes AVEL worth building.**

**Decision:** build the smallest gate that satisfies the thesis, and spend the remaining effort above it.

### The gate is four stages

`no-mistakes` runs seven. AVEL needs four.

| Stage | Reads | Notes |
|---|---|---|
| **1. Verify** | build · tests · analysis · coverage delta · mutation score · ownership | One artifact from one runner. This is the thesis; everything else is logistics. |
| **2. Conform** | phase1↔phase2 contract diff | `[attestation]` until `CLIENT-CONTRACT-CONFORMANCE.md` is answered. Marked as such everywhere. |
| **3. Blast radius** | create · overwrite · unchanged · violations, with the staleness guard | `BLAST-RADIUS.md`. This one is genuinely AVEL's. |
| **4. Deliver** | zip · PR · push | Pure logistics. Small on purpose. |

**Explicitly rejected: an AI review stage.** That is the U2 line. No inference in the gate, permanently.

**Considered and deferred: a docs stage.** `no-mistakes` gates on documentation and AVEL does not. A mission shipping undocumented interfaces is a real failure mode and the gate is cheap — but it is not the thesis, and it can be added after the four above work.

### Two nearly-free adoptions

**Runner fallback chain.** A verification runner that fails should degrade to the next in an ordered list, not fail the export. `no-mistakes` does this across agent CLIs; AVEL should do it across Capability-type runners. A gate that goes down because one tool is unavailable is a gate people route around.

**Headless by default.** Every gate must run with no TUI and no human present, or it cannot run in CI — which means it cannot run at all in the case that matters. Design the machine interface first; a human-facing view is a consumer of it, never the other way around.

### Where the effort goes instead

None of the following exists in `no-mistakes`, and none of it is a gate:

- **Mission composition** — which agents, equipped how, in what phases (`ROSTER-V2.md`)
- **The loadout screen** — the authoring surface, with live coherence (`ROUTES.md`)
- **Blast radius** against a *client* repository, with the TOCTOU guard (`BLAST-RADIUS.md`)
- **The agency layer** — `Connection` scoped per engagement, revocation at engagement close, `RepoPolicy` per repo
- **Playbooks** — process per mission type rather than per repository
- **Deterministic render** — content-addressed, reproducible, with the preview-vs-real hash comparison as a free determinism gate

**The test for any future scope proposal:** does this make the gate more complete, or the mission more expressible? The first is commodity work someone else has already done better. The second is the product.

---

## Canon becomes a real agent — resolved

**Question:** Canon was specced as a structured form in V1, with a note that a real language-model case existed for V2. Can it be an agent?

**Yes.** The determinism rule forbids inference in the render, freeze, gate, and delivery path. Canon runs *before* a mission exists; its output is input to the mission, not part of the chain that decides whether work ships. That is the opposite of the block decision, which was the gate and therefore had to become a function.

**But not all of it.** Apply the test that shaped CounselOS — does this step require reasoning, or pattern matching?

| Intake step | Reasoning or mechanism | Owner |
|---|---|---|
| Turn call notes into a structured brief | Reasoning | **Canon** |
| Ask clarifying questions when the brief is underspecified | Reasoning | **Canon** |
| Surface contradictions in what the client said | Reasoning | **Canon** |
| Draft acceptance criteria | Reasoning | **Canon** |
| Derive the cut from repository structure | Mechanism | **Code** |
| Select the roster preset | Follows from the cut | **Code** |
| Set `RepoPolicy` defaults | Safe by absence | **Code** |
| Create Client and Engagement records | CRUD | **Code** |

**Canon must never derive the cut.** `cut_source: derived` exists specifically because the original roster defect came from applying a rule to a decomposition already decided on. A model proposing the cut reintroduces exactly that failure with a confident-sounding justification attached.

**Canon must never touch `RepoPolicy`.** Direct push to a default branch is opt-in by deliberate human confirmation. Nothing that performs inference gets to enable it.

### Canon proposes, the operator approves

Canon writes to an `Intake` row, never to `Mission`. Nothing it produces is executable until an operator approves it, at which point the Intake materializes a Mission and is retained as provenance for how the brief came to exist.

This is the approval-gated pattern: proposal, human review, then real. The same policy already decided for KnowledgeEntry write-back, applied at intake.

### Why this is the highest-leverage place for a model

`PRODUCT.md` names bad specification as one of the two dominant causes of multi-agent failure. A form cannot notice that a brief is underspecified. A model can, and `Intake.open_questions` is where it says so.

Canon catching an ambiguous requirement before dispatch is worth more than any downstream gate, because a gate can only reject work that was built against the wrong spec — it cannot recover the time.

---

## Five gate additions — resolved

Each of these extends a mechanism that already exists rather than adding a new subsystem. Ordered by how directly the market evidence supports them; see `WHY-AVEL-EXISTS.md` for the underlying research.

### 1. The published verification receipt

`Export.verification` currently lives in Postgres and is invisible to the client. Render it into the delivered package at `.avel/evidence/receipt.md` and into the PR body: what was checked, what passed, against which contract hash and gate config hash, content-addressed.

**Why it matters:** no platform in this market ships proof. The closest competitor check confirms that a security policy *exists*, not that it *works*. Existence is not effectiveness, and the difference is the entire product.

**Cost:** a render template and a PR body builder. It is deterministic, so it does not disturb the render invariant.

**Connects to:** the `gate_override` decision, which already renders into the delivery for the same reason — a client who can see what happened does not have to trust a summary of it.

### 2. Permission matrix as a gate

Generate the full role × resource × state matrix from the schema and run every cell. Fail on any combination that is undefined rather than explicitly allowed or denied.

**Why it matters:** Mission 002's authorization defect — an expired grant removing a baseline permission — was found by an exhaustive grid in a unit spec, not by end-to-end tests. The agent's own explanation was correct: end-to-end tests only walk paths a request happens to take, and no endpoint produced that combination.

Every major documented breach in this space is an access-control failure. This is the check that finds them, and it has already found one.

**Cost:** matrix generation from the schema, plus a runner. The hard part is already proven.

### 3. The absence gate

Every existing gate checks what is present. Nothing checks what is missing.

That is the wrong shape for this failure class. AI-generated defects are not wrong answers, they are absent layers — the model built what was asked and nothing that was assumed. A database ships with no row-level security because nobody requested row-level security.

Derive obligations from the contract artifact and check each one:

| Obligation | Derived from |
|---|---|
| Every table has a row-level security policy | Schema |
| Every endpoint has an authorization check | Contract |
| Every mutation writes an ActivityLog action | The closed-vocabulary rule |
| Every component has a test identifier | Client conventions |
| Every foreign key is indexed | Schema |
| No secret appears in client-side output | Build output |

Each is mechanically checkable and each maps to a documented breach class.

**Connects to:** the coherence engine, which already computes warnings from declared-versus-actual. Same mechanism, pointed at the client's code instead of the roster.

### 4. Findings as a gate

Every finding is currently a one-off. A defect found in one mission travels to the next only because a human noticed and wrote it down.

Make the registry executable. Each confirmed finding carries a detection rule, provenance, and the mission that found it. Before an export, the work is checked against the accumulated set.

**How this differs from the deferred knowledge vault:** it is not retrieval, it involves no inference, and nothing auto-promotes. It is a deterministic check against a list of confirmed defects. That satisfies the standing rule — provenance and forgetting first, retrieval second, auto-promote never — while delivering the value without waiting for ten missions.

**Connects to:** `SURPRISES.md`, `findings/`, and the existing pattern registry. This turns documentation into a mechanism.

**Scoping caution:** findings promoted to the general registry must be rewritten to strip anything client-specific. Client-scoped findings stay scoped. Same one-way door as `KnowledgeEntry.client_id`.

### 5. Mission replay across models

The render is deterministic, the snapshot is frozen, and the contract and gate config hashes are in the manifest. That means the exact inputs to any past mission can be reconstructed.

So a past mission can be re-run against a different model with identical inputs, and the outcomes diffed: gate results, cost, defects found, defects missed.

**Why nobody else can do this:** answering "did the model upgrade help" requires frozen inputs, and nothing else in this space freezes them. AVEL does, as a side effect of the determinism rule — the same way the preview-versus-real hash comparison is a free determinism gate.

**Why it matters beyond curiosity:** it produces the measured trend across missions that every claim currently lacks, and it makes model upgrades a decision with evidence rather than a leap.

**Cost:** a replay harness over `Export` rows. Requires no new schema beyond a `replay_of` self-reference.

---

## Sequencing corrections

### Promoted: machine-verified contract conformance
Was Tier-2. **Now top of the queue.** Inter-agent interface misalignment is one of the largest documented categories of multi-agent failure, and it was the one thing left as an attestation.

**Correction to the correction:** the machinery built so far — ts-rest, OpenAPI, `oasdiff`, `contract_sha256` — governs **AVEL's own API, in AVEL's repo.** The gate that matters is phase 1 versus phase 2 **in the client's project**, in a stack AVEL does not control. Those are different artifacts in different repositories. `CLIENT-CONTRACT-CONFORMANCE.md` specifies the missing half; **until it exists, the promoted fix is a slogan.**

### Demoted: knowledge write-back
Was promoted into V1. **Now deferred past ~10 real missions.** There is nothing to retrieve yet (`STATE.md`), and memory systems have the field's worst documented failure modes — a poisoned entry is inherited by every agent after it.

When built: **provenance, status (candidate vs. promoted), and forgetting first. Retrieval second. Auto-promote never.**

### Also demoted: executable Playbook · pgvector retrieval · export diff · per-agent telemetry
All solving problems there is no evidence of yet. Telemetry specifically needs missions to measure.

### Raised: cost governance
Was listed last. **Wrong ordering — that reflected intellectual interest, not risk.** Multi-agent runs use far more tokens than a chat session, at frontier rates, with one person paying, no ceiling, and no attribution. Doc drift wastes an afternoon; an unbounded run wastes a month's runway.

**Interim, without building anything:** console budget alerts, a manual per-mission spend log, a hard pause rule above a threshold.

**Flagged:** all three of those are enforced by intention — the thing this architecture argues against. The mechanical version is a `spend_ceiling` on Mission and a refusal at the gate when attributed spend exceeds it. Small. Should not stay interim for long.

### Sequencing correction applied to this rebuild itself
The review's finding was *design judgment is ahead of evidence*. The response was a new API framework, a new database, six new tools, a schema redesign, and five documents — moving backwards on the axis identified as the problem. Each call is individually defensible; the aggregate repeated the original error one level up.

**Standing rule from here:** no further stack or schema change ships before one mission runs end to end and produces a measurement.

---

## Standing decisions — do not re-litigate

- **The core is deterministic, permanently.** No LLM inference in the render, freeze, gate, or delivery path. AI feeds the core; it never executes inside it. *Scope: this buys reproducibility and auditability, not correctness. The gates buy correctness.*
- **Five of the six Command Center agents are not AI.** Canon is now an agent; see above. Blair, Plye, and Della stay permanently code. Trace and Uno are unbuilt.
- **Legacy note — the 6 "Command Center agents" framing.** Two are permanently plain code; one is a form; the orchestrator is the human in V1. Counts in `STATE.md`.
- **Versioning is counter-only.** Reproducibility comes from the frozen snapshot. No version-history table — deliberately.
- **Soft delete** on anything an Export can reach; `live()` explicit in every query.
- **ActivityLog `action`/`entity_type` are closed vocabularies.** Adding a mutation adds its action in the same change. The action prefix is a domain, not the entity_type.
- **Auth is identity-only, single-user, no role seam.** Single-user does not mean open — the app can open PRs, so unauthenticated requests are rejected hard.
- **RepoPolicy defaults FALSE** — safe by absence.
- **The block decision is a function, not an agent.** A pass-or-block verdict computed by inference is inference in the gate path, which the determinism rule forbids. `decide(findings) -> pass | block` is arithmetic over typed findings. Joins Blair and Plye as permanently code. See ROSTER-V2.md.
- **The cut is derived, not chosen.** Read the repository's directory structure at mission setup. An override requires written rationale that renders into the delivery.
- **The gate is the commodity; the mission is the product.** Four gate stages, no AI review stage, headless by default. Effort goes above the gate, not into it.
- **Doc ownership is exclusive.** See `DOC-OWNERSHIP.md`. A fact restated in two documents will drift; this has happened three times.

---

## Open questions

| Question | Blocking? |
|---|---|
| Mutation scope: does the sprint-final full run block or report? | Before first ship |
| Client-side conformance artifact format (D1/D2) | **Yes — blocks the top-priority fix** |
| Adopt `no-mistakes` as the delivery gate — see `PRIOR-ART.md` | **Yes — determines whether the export engine is built or wrapped** |
| `MOBILE-PWA.md` does not exist | **Yes — blocks the handed-off frontend session** |
| TanStack Start vs. plain Vite + TanStack Router | No |
| The verification receipt handed to clients | Held — revisit after the gate is closed and after asking a real client |
| Where the contract lives long-term (`src/contract/` vs `packages/contract`) | No |

**Resolved 2026-08-21:** mutation threshold (global + versioned) · mutation scope (changed per export, full at ship) · `gate_override` renders into the package and PR body · `computeCoherence` in `src/contract/` · `preset` route group added.

## The honest status this all sits on

Zero missions run. See `STATE.md`.

**Every decision above is a well-reasoned hypothesis until one mission runs end to end and gets measured.** The design judgment is ahead of the evidence. That is the more fixable direction — but it is the problem, and this rebuild widened it.
