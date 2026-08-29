# AVEL — Data Contracts & Schema (v2)

*This document owns **shapes**: the contract layer structure and the entity definitions. It does not carry rationale — for why any of this changed, see `DECISIONS-V2.md`. For tools and versions, `TECH-STACK.md`. For build status, `STATE.md`.*

*Supersedes the v1 data model. Stale markers: 13 entities · tRPC · Capability as an entity · `bytea` snapshots · `skippable` gates.* <!--allow-stale-->

---

# Part 1 — The Contract Layer

## What the contract artifact is

Under ts-rest the contract is a first-class artifact: a shared object of routes, methods, paths, and Zod shapes, from which an OpenAPI document is generated.

| Job | Mechanism |
|---|---|
| Type safety, both sides | Backend implements it; frontend infers from it. A change breaks both at compile time. |
| Breaking-change detection | `oasdiff` compares the generated spec against the previous one in CI. Exit 1 on breaking. |
| Reproducibility | The contract's hash freezes into the export's version manifest alongside the rendered bytes. |

**Scope note:** this artifact governs **AVEL's own API**. The phase1↔phase2 conformance gate operates on a *different* artifact in the *client's* repository — see `CLIENT-CONTRACT-CONFORMANCE.md`. Do not conflate them.

## Structure

```
src/contract/
  index.ts            the assembled contract (this is THE artifact)
  mission.ts          route group per domain
  roster.ts
  export.ts
  agent-template.ts
  skill.ts
  playbook.ts
  preset.ts           RosterPreset — list · get · create · update · apply
  skill-source.ts
  repo-policy.ts
  connection.ts
  activity.ts
  shared/
    envelope.ts       success/error response envelope
    errors.ts         the error code union
    pagination.ts
    coherence.ts      computeCoherence — pure, imported by both sides
```

**`apply` materializes.** `preset.apply` copies the preset into RosterEntries (copy-then-edit); the preset holds no mission state. The procedure name should make it obvious that applying is a write, not a reference.

**Placement rule:** the contract lives where neither the backend nor the frontend can edit it unilaterally without the other noticing. `src/contract/` in the single-repo layout; `packages/contract` if it ever splits.

## Route shape

Every route declares method, path, request shape, and **responses per status code**.

```ts
// src/contract/export.ts
export const exportContract = c.router({
  create: {
    method: 'POST',
    path: '/exports',
    body: z.object({
      missionId: z.string().uuid(),
      idempotencyKey: z.string().uuid(),
      target: exportTargetKind,           // zip | github_pr | github_push
      repoUrl: z.string().url().optional(),
    }),
    responses: {
      201: exportSchema,
      409: errorEnvelope,                 // IDEMPOTENCY_REPLAY
      422: errorEnvelope,                 // PRECONDITION_FAILED
      502: errorEnvelope,                 // EXTERNAL_GITHUB
    },
  },
})
```

## The envelope

```
success:  { success: true,  data: T, meta?: {...} }
error:    { success: false, error: { code, message, details?, requestId } }
```

**The frontend switches on `error.code`. It never parses `message`.** The code union lives in `contract/shared/errors.ts`; both sides import it.

## Non-contract routes

Two deliberate exceptions, both returning bytes rather than JSON:

- **Zip download** — authenticated `GET`, streams the frozen package.
- **GitHub webhook** — receives, does not envelope.

---

# Part 2 — The Schema

## The sixteen core entities

**Client · Engagement · AgentTemplate · Skill · KnowledgeEntry · Finding · Intake · Mission · Playbook · RosterEntry · RosterPreset · Export · RepoPolicy · Connection · ActivityLog · User**

Plus **SkillSource** (supporting catalog). Deferred: PromptFragment (V1.5), Session (V2 stub).

Up from twelve. `Client` and `Engagement` close the agency layer, `Intake` holds Canon's proposal before an operator approves it into a Mission, and `Finding` turns a confirmed defect from one mission into an executable check on every mission after it.

---

## Entity reference

### Client

```
id · name · status ('active' | 'closed')
primary_contact? · notes_md?
deleted_at · timestamps
```

`Mission.client` was a text field. At three clients that makes "everything for Meridian" ungreppable, and every query that should have been client-scoped was not. Retrofitting scoping through a codebase is where authorization bugs live.

### Engagement

```
id · client_id      FK → Client
name · scope_md?
status              'active' | 'closed'
started_at · closed_at?
deleted_at · timestamps
```

An engagement groups missions, connections, and knowledge for one body of work. **Closing an engagement revokes its Connections** — that is the lifecycle step `Connection.revoked_at` exists for.

### Intake

Canon's proposal. Never a Mission until an operator approves it.

```
id · engagement_id          FK → Engagement
status                      'draft' | 'proposed' | 'approved' | 'rejected'
source_md                   raw input: call notes, transcript, email thread
proposed_brief              structured — Canon's output
open_questions              text[] — ambiguities Canon surfaced
derived_cut                 'horizontal' | 'vertical'  — computed, not proposed
derived_cut_evidence        text — the directory structure that decided it
suggested_preset_id?        FK → RosterPreset — follows from the cut
approved_by? · approved_at?
mission_id?                 FK → Mission, set on approval
deleted_at · timestamps
```

**`derived_cut` is computed by reading the repository, not proposed by Canon.** See the Canon decision in `DECISIONS-V2.md`.

**Approval materializes a Mission.** Nothing Canon writes becomes executable until an operator says so. The Intake row is retained — it is the provenance for how the brief came to exist.

### AgentTemplate
An agent as data.

```
id · slug              path segment in the export, and the mount lookup key
name
kind                   'horizontal' | 'feature'
engagement_id          FK -> Engagement, required when kind='feature'
team                   frontend | backend | qa | root
wave_defaults          wave[]
identity_md            ≤800 tokens, Zod refinement
depth_md               ≤800 tokens, Zod refinement
writable_paths         text[]   ← glob patterns this agent may modify
version · deleted_at · timestamps
```

`writable_paths` backs the file-ownership check at render time: a file modified by an agent outside its declared globs is a gate failure. This is the mechanical form of "testers never modify code under test."

**`kind` decides what may be aggregated, and it is not cosmetic.**

A horizontal agent owns no feature and builds no product code. It is the same agent across every mission and every client, so its history is continuous and cross-mission trends are meaningful.

A feature agent is scoped to one codebase. Two clients can both have an agent slugged `transactions`, and those are unrelated agents that happen to share a name. `engagement_id` enforces the scope.

**Never aggregate a feature agent's metrics across engagements.** The slug is a path lookup key, not an identity. This is the reporting consequence of the naming rule in `ROSTER-V2.md`: a personal name means horizontal, a territory name means feature, and the two have different lifetimes.

### Skill

```
id · slug · name
content_md · avel_enhancement_md?
type                   'knowledge' | 'capability'
source_id              FK → SkillSource
recommended_for        text[]     team tags
version · deleted_at · timestamps
```

**`type='capability'` declares a tool grant; it does not enforce one.** Enforcement requires a runtime that can restrict a tool; none exists. Render only:
`knowledge` → `.avel/skills/[agent]/[slug].md` · `capability` → `.avel/capabilities/[agent]/[slug].md`

Join tables: `agent_template_skills`, `roster_entry_skills`.

### SkillSource
Open catalog, not an enum. `Skill.source_id` is an FK. Ships empty; populated in-app.

*(The test: does code branch on the value? If yes it's an enum. If it's a label that grows, it's a catalog.)*

### KnowledgeEntry

```
id · type              pattern | decision | registry | component | reference | anti-pattern
agent_id               nullable — null = agent-agnostic
client_id              nullable — null = genuinely general, never client-specific
supersedes             self-reference
content_md
version · deleted_at · timestamps
```

**`client_id` is the one-way door.** A pattern learned on one client's codebase must not be retrievable by an agent working another client's mission. Today the vault is empty so it is harmless; once it is not, it is contractual. Nothing auto-promotes from client-scoped to general — promotion is explicit and requires the entry be rewritten to strip anything client-specific.

**No write path in V1.** The entity exists so the shape is right. Deferred past ~10 real missions; when built, provenance, candidate/promoted status, and forgetting come first, retrieval second, auto-promote never.

### Mission

```
id · engagement_id     FK → Engagement
type
brief                  structured
sprint_n · status
cut                    'horizontal' | 'vertical'
cut_source             'derived' | 'overridden'
cut_rationale          text — required when overridden, renders into delivery
repo_url               a DEFAULT, not the binding destination
spend_ceiling_usd?     ← nullable today; enforcement unbuilt
deleted_at · timestamps
```

`spend_ceiling_usd` is modeled now so cost governance is a gate check rather than a migration later. Currently unread by any code.

**`cut` is derived, not chosen.** At mission setup the system reads the connected repository's directory structure and determines which boundary is a directory: layer or feature. That is the cut. `cut_source` defaults to `derived`.

An operator may override, and an override requires `cut_rationale` in writing, which renders into the delivery. This is the `gate_override` pattern applied one layer up, and it exists for a specific reason: the original roster defect came from applying the decomposition rule to a roster that had already been decided on. A free-choice field permits exactly that failure. A derived field with a written-rationale override does not.

**Open:** the cut is a property of a mount root rather than of a repository. A monorepo can be layer-organized on the backend and feature-organized on the frontend. A scalar bakes in a uniformity assumption. See ROSTER-V2.md.

### Playbook

```
id · mission_type (unique) · name
waves_applicable       wave[]
gates                  { gate, policy: 'mandatory' | 'warn' }[]
deliverable            'pr' | 'report' | 'recommendation'
required_fields        text[]
default_preset_id      FK → RosterPreset
version · deleted_at · timestamps
```

Gate vocabulary is closed: `phase1-close · alignment · qa · security · rollback · acceptance`.

**References a preset; never lists agents.** Squad composition is RosterPreset's; the Playbook owns process.

### RosterEntry
One agent customized for one mission.

```
id · mission_id · agent_template_id
active · waves
monitor_priority       wezterm
customized_md?
writable_paths?        overrides the template's, per mission
timestamps
```

Whether an agent is on a mission = whether its RosterEntry exists and is active. Skills are a relation.

### RosterPreset
A saved squad. Applying it **materializes** RosterEntries (copy-then-edit); the preset holds no mission state.

### Export

```
id · mission_id · sprint_n
idempotency_key (unique)
target_kind            'zip' | 'github_pr' | 'github_push'
connection_id          FK → Connection    what authorizes this
status                 pending → rendering → verifying → pr-open → done | failed
pr_status?
verification           see below
gate_override          { gate, justification, overridden_by, overridden_at } | null
replay_of              FK → Export, nullable — this export re-ran a past
                       mission's frozen inputs against a different model
snapshot_key           R2 object key
snapshot_sha256        content hash — the integrity check
snapshot_bytes         size
version_manifest       structured, IN POSTGRES — queryable, never inside the blob
contract_sha256        AVEL's frozen contract artifact hash
timestamps
```

Immutable after freeze; only `status` and `pr_status` advance.

**Four gate stages, in order:** verify → conform → blast radius → deliver. There is deliberately no AI review stage — no inference in the gate, permanently. See `DECISIONS-V2.md`.

**Every stage is headless.** The machine interface is primary; any human-facing view consumes it. A gate that needs a TUI cannot run in CI, which is the case that matters.

**`verification`:**

```
verification {
  build       { status: 'pass' | 'fail', ... }
  tests       { status, total, failed, ... }
  analysis    { status, findings, ... }
  coverage    { lines_pct, delta_pct }
  mutation    { score_pct, killed, survived, scope: 'changed' | 'full' }
  ownership   { status, violations: [{ agent, path }] }
  permissions { status, cells_total, cells_undefined,
                gaps: [{ role, resource, state, expected, actual }] }
  absence     { status, obligations_total, unmet:
                [{ rule, subject, detail }] }
  findings    { status, checked, matched:
                [{ finding_id, mission_id, rule, subject }] }
  conformance { status, breaking: [...] }        ← see CLIENT-CONTRACT-CONFORMANCE.md
  verified_at
  runner      which capability-type Skill produced this
  runner_chain [{ slug, attempted_at, ok }]   ordered fallbacks — a failed
                                              runner degrades to the next
                                              rather than failing the export
} | null
```

Gate passes only when: build pass · zero test failures · analysis pass · coverage delta ≥ 0 · mutation score ≥ the global floor · zero ownership violations · zero breaking conformance diffs · zero undefined permission cells · zero unmet obligations · zero matched prior findings.

**`permissions`** is the full role × resource × state matrix generated from the schema. A cell that is neither explicitly allowed nor explicitly denied is a gap, not a pass. Mission 002's authorization defect was this shape.

**`absence`** checks what the contract implies but the code lacks. Every other field in this object inspects what is present; this is the only one that inspects what is missing, which is the shape of the failure class this product exists to catch.

**`findings`** checks the work against previously confirmed defects. Deterministic list matching — no retrieval, no inference, nothing auto-promoted.

**The mutation floor is not stored on Export.** It is global, versioned, and lives in config under source control — changing it is a reviewed commit, not a per-mission field. `verification.mutation` records the *measurement*; policy lives elsewhere. `version_manifest` carries the config hash, so "what bar did this ship against" stays answerable exactly, later — same move as `contract_sha256`.

**`scope`** distinguishes an incremental run (changed files, normal export, minutes) from a full-project run (sprint ship, hours, its own job).

> **⚠ `conformance` is a placeholder.** Its inner shape depends on the client-side artifact format, which is unspecified.

### RepoPolicy

```
id · repo_url (unique, normalized) · label?
allow_direct_push_to_default   boolean, default FALSE
default_target?                'zip' | 'github_pr' | 'github_push'
deleted_at · timestamps
```

A repo with no policy row is treated as `false`. The safe behavior needs no setup; only the permissive behavior is opt-in.

### Connection

```
id · service ('github')
label                  e.g. "Meridian engagement"
scope_type             'owner' | 'repo'
scope_value            e.g. "meridian-co" or "meridian-co/app"
credential_ref         env var name or secret ref — NEVER the token
status                 'active' | 'expired' | 'revoked'
expires_at? · last_rotated_at? · revoked_at?
deleted_at · timestamps
```

- **The token is never stored in the database.** `credential_ref` names where it lives; the gateway resolves it.
- An export resolves **both** a Connection (*what authorizes this?*) and a RepoPolicy (*what am I allowed to do?*).
- **Revocation is a step in engagement close** — set `revoked_at`; the gateway refuses.

V1 reads a single token from env. The model supports many, so the second client is a row, not a migration.

### ActivityLog
Append-only. `action` and `entity_type` are **closed vocabularies**. Adding a mutation adds its action to the enum in the same change. The action prefix is a *domain*, not the entity_type (`roster.preset_applied` logs against entity_type `roster_entry`). The write happens **inside the same transaction** as the mutation.

### User
`role` reserved; middleware does not read it.

---

## Coherence

```
computeCoherence(mission, playbook) → {
  block?: { code: 'no_agents_in_first_wave', reason, wave },
  warnings: CoherenceWarning[]
}
```

**This function lives in `src/contract/`, not in the service layer.** It is pure — no database, no network, no clock — so both sides import the same implementation. The frontend calls it for live feedback on the loadout screen; the export gate calls it for permission. Shared code, single authority: a client that lies about coherence still cannot ship.

**Cut coherence is path arithmetic, not an assertion.** "Is a foundations role assigned" passes if foundations is assigned to a feature agent, which is the failure mode it was meant to catch. The checkable form:

> Under the vertical cut: a foundations role and a verification role are both assigned, and each one's writable set is disjoint from every feature agent's writable set.

Computable from the mount table. This enforces the rule that owning territory disqualifies you from judging a seam, mechanically rather than by good intentions.

**The hard block:** the mission must contain at least one active agent in the **earliest wave its playbook declares**. For `full-build` that resolves to phase1; for `discovery` it resolves to whatever that playbook starts with.

Warnings are playbook-relative — read the playbook's `gates`, so absences a playbook doesn't declare aren't flagged.

---

## Cross-cutting invariants

- **Soft delete** on anything an Export can reach. `deleted_at` + an explicit `live()` filter in every list query — Drizzle has no middleware, so it is never implicit.
- **Versioning is counter-only.** No version-history table, deliberately.
- **Determinism in the render.** No clock, no randomness, no unstable ordering in rendered bytes.
- **Zod defines shape once.** Tables derive via `drizzle-zod`; the contract imports the same schemas. One definition, three consumers.
- **Enums are pgEnums when code branches on them**; catalogs are tables when they're labels that grow.

---

## Migration order

1. `SkillSource` → `Skill` (with `type`) → `AgentTemplate` → the two join tables
2. `Mission` → `Playbook` → `RosterPreset` → `RosterEntry`
3. `Connection` → `RepoPolicy` → `Export`
4. `KnowledgeEntry` → `ActivityLog` → `User`
5. Enable **pgvector** — one line, unused, so V2 retrieval needs no migration later

Forward-only. One migration per change. Never edit an applied one.
