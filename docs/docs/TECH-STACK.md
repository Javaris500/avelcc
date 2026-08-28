# AVEL Command Center — Tech Stack

*This document owns **the tool list**: what is used, at what layer, in one line each. It carries no rationale — every "why" lives in `DECISIONS-V2.md`. Shapes are in `DATA-CONTRACTS-V2.md`; status is in `STATE.md`.*

*Stale markers: tRPC · Supabase · `bytea` snapshots.*

---

## The stack

| Layer | Choice | One line |
|---|---|---|
| Language | TypeScript, end to end | — |
| API contract | **ts-rest** | Emits a real OpenAPI artifact; the previous choice emitted none. |
| HTTP server | **Hono** | ts-rest has a Hono adapter; they compose. |
| Validation | Zod | One definition, three consumers (tables, contract, runtime). |
| ORM | Drizzle | Tables derive from Zod via `drizzle-zod`. |
| Database | **Neon (Postgres)** | DB branching per feature branch; scale-to-zero. |
| Auth | Auth.js (GitHub OAuth) | Identity only, single-user, no role seam. |
| GitHub | Octokit, behind a gateway interface | Credential resolved from `Connection.credential_ref`. |
| Frontend | **TanStack Start** | Resolved. Server routes for the zip stream, the webhook, and credential resolution. |
| Jobs | **pg-boss** | Verification outlives a request; uses the Postgres already present. |
| Object storage | **Cloudflare R2** | Frozen export bytes. `snapshot_key` + `snapshot_sha256`. |
| Testing | Vitest · Playwright · **Stryker** | Stryker supplies the mutation score the gate reads. |
| Contract diffing | **oasdiff** in CI | Exit 1 on a breaking change to AVEL's own API. |
| Observability | **Pino** · **Sentry** | ActivityLog records business events; this is operational logging. |
| Tooling | **Biome** | Optional. Not blocking. |

---

## Operational notes

**Neon — two connection strings.** Pooled for the application; **direct/unpooled for `drizzle-kit`**. This trips people.

**Neon — day one.** Enable `pgvector` (unused) and create `main` + `dev` branches immediately, so branching is habit rather than retrofit.

**R2 — from the start.** <!--allow-stale--> *Previously this document deferred object storage and specified Postgres `bytea` first. That contradicted the schema, which carries `snapshot_key` and no `bytea` column. Resolved 2026-08-17 in favour of R2; see `DECISIONS-V2.md`.* The `version_manifest` stays in Postgres and queryable — only rendered bytes go to R2.

**Stryker — cost is unresolved.** Mutation testing runs the suite many times over. Verification moves from minutes toward hours per export. Scope (full-project at ship vs. changed-files per export) is an open question in `DECISIONS-V2.md` and affects the job queue design.

**ts-rest — scope.** The contract artifact and `oasdiff` govern **AVEL's own API**. The phase1↔phase2 gate operates on a different artifact in the client's repo; see `CLIENT-CONTRACT-CONFORMANCE.md`.

---

## Resolved

**TanStack Start**, not plain Vite + Router. The router is identical either way; the deciding factor is that three things need a server — GitHub credential resolution, the zip byte stream, and the webhook receiver. Without Start those force a second Node process and a second place for the credential boundary to be wrong. See `DECISIONS-V2.md`.

---

## Deliberately deferred

| Deferred | Until |
|---|---|
| pgvector *usage* | The knowledge vault has contents. Extension enabled day one; nothing built against it. |
| Redis | pg-boss removes the reason. Revisit only on genuine throughput need. |
| BullMQ | Same. |

---

## What this stack buys

| Principle | What enforces it |
|---|---|
| AVEL's own contract is verifiable, not attested | ts-rest → OpenAPI → oasdiff in CI |
| Verification survives weak tests | Stryker mutation score + coverage delta |
| Agents stay in their lane | `writable_paths` ownership check at render |
| Reproducibility | Frozen bytes (R2) + version manifest (Postgres) + contract hash |
| Deterministic core | No inference anywhere in this stack — by design |
| Migration-heavy work stays cheap | Neon branching |
| Long verification survives failure | pg-boss |
| Doc consistency | `scripts/check-docs.sh` in CI |
| The gate stays small | Four stages, fixed. No AI review stage — by rule, not by preference. |
| A tool outage doesn't route people around the gate | Ordered runner fallback chain |

**Not yet enforced by anything in this table:** client-side phase1↔phase2 conformance, cost ceilings, and acceptance-criteria coverage. Those remain intentions.
