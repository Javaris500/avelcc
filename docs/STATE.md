# AVEL Command Center — State

*The single source of truth for build status, counts, and gaps. **No other document may state build status, entity counts, or agent counts.** They link here.*

**Last updated:** 2026-08-29

---

## One-line status

Backend rebuild in progress on the v2 stack. Export engine's deterministic core is built and byte-for-byte on the golden fixture. **The loop is closed for missions**: a browser renders a row that a request created — browser → route → service → Neon → response, reads and writes both. That loop covers Mission only; delivery targets are unbuilt, seven entity groups have no routes, and mission `update` is still unimplemented. **Zero missions have RUN.** One exists, as a `draft` row; nothing has executed it.

---

## Counts

| Thing | Count |
|---|---|
| Core entities — target (`DATA-CONTRACTS-V2.md`) | **16** + SkillSource (supporting catalog) |
| Core entities — built in `schema.ts` | **11 of 16** + SkillSource + 2 join tables (`agent_template_skills` · `roster_entry_skills`) — Client · Engagement · AgentTemplate · Skill · Mission · Playbook · RosterEntry · RosterPreset · RepoPolicy · Connection · Export. Absent: KnowledgeEntry · Finding · Intake · ActivityLog · User |
| Tests | **168** — all passing on this workstation (Windows · node 24 · pnpm); two harness defects fixed 2026-08-29, see *Verification* |
| Build agents — as authored (v1) | **18** (frontend 6 · backend 7 · quality 5) |
| Build agents — target (`ROSTER-V2.md`) | **14** (phase A 2 · B 5 · C 3 · D 4) |
| Orchestrator | **1** (Axis — the human, in V1) |
| Command Center agents | **6** (support app; not AI) |
| Agent identity files authored | **5 of 19** (Ghost, Fantem, Leon, Nemi, Zero) |
| Agent files at PE/CB standard | **2 of 19** (Ghost, Fantem) |

Honest external framing: *18 build agents + 1 human orchestrator + a support app.* Never "25 AI agents." <!--allow-stale-->

---

## Module status

| # | Module | State |
|---|---|---|
| 1 | Schema & validation (Zod) | 🟡 steps 0–3 built (11 of the 16 target entities, + joins); **step 3 completed 2026-08-29** — `RepoPolicy`, then `Connection` and `Export`; step 4 (KnowledgeEntry · ActivityLog · User) absent; `Finding` and `Intake` absent; pgvector not enabled |
| 2 | Persistence (Drizzle + migrations) | 🟡 migrations `0000`–`0010` applied to Neon (`0008` mission `status` default + nullable `cut`; `0009` Connection · Export; `0010` their `updated_at` triggers); runtime db client built (`modules/db/client.ts` — neon-http on the pooled `DATABASE_URL`, server-only). Entity coverage is the remaining gap, not the connection |
| 3 | Auth & context | ✅ built (portable, unchanged) |
| 4 | Contract layer (`src/contract/`) | 🟡 `mission · roster · playbook · export` built + shared envelope/pagination/errors; four error vocabularies (`ERROR_CODES` · `VIOLATION_CODES` · `AUTH_CODES` · `CRUD_CODES`) kept deliberately separate; 7 entity groups still unspecced (see `contract/index.ts`) |
| 5 | API layer (server route handlers) | 🟡 `GET /api/missions`, `GET /api/missions/:id` and `POST /api/missions` built and exercised against Neon, success and every declared failure path; `auth` and `preflight.blast-radius` alongside them. `PATCH` absent **by choice** (see Gaps); every other entity has no route. Pattern is TanStack Start `createFileRoute().server.handlers`, not a ts-rest server adapter |
| 6 | Service layer | 🟡 `modules/mission/service.ts` only — `listMissions` (client-name join + pagination envelope), `getMission`, `createMission`. No other entity has a service |
| 7 | Roster & loadout | 🟡 contract shape only (`contract/roster.ts`); no service |
| 8 | Export engine — deterministic core | ✅ `render` byte-for-byte 20/20 on the golden fixture (D5 resolved 2026-08-29) · `blast` radius · `git` blob-sha · locale/determinism proven |
| 9 | Export targets (zip · PR · push) | ⬜ not started — `gitBlobSha` is the only building block; nothing writes a zip or opens a PR |
| 10 | GitHub gateway (real) | 🟡 `readTree`/`parseTree` built + tested against real trees; served read-only via the preflight route |
| 11 | Webhook + zip route | ⬜ not started |
| 12 | Cross-cutting (ActivityLog, AppError) | 🟡 error taxonomy built; ActivityLog has no table yet |

**Carried forward from v1:** auth, the GitHub gateway interface, the error taxonomy. Everything schema- or API-shaped is being redone against ts-rest and Neon.

---

## Verification

Modules 1, 8 and 10 are proven by unit tests over pure functions and fixtures. Module 5 is proven by being driven against Neon: the client-name join, the pagination envelope, the `NOT_FOUND` path, a `201` create, and all four declared `422` paths (unknown engagement · `sprintN` 0 · empty `type` · unparseable JSON).

**The loop is closed, 2026-08-29.** A browser renders a mission row that a POST created. Both halves — **browser → route** and **route → service → Neon → response** — were watched working, not inferred from tests.

**The Neon row this file previously claimed as proof did not exist.** When the write path was built, `clients`, `engagements` and `missions` were all empty. The pooled and direct URLs point at the same endpoint, so it was not a wrong-branch mixup — the row was simply gone, and every read-side claim above had been resting on it. The database now holds a seeded client (CounselOS), an engagement, and one live mission, so those claims are re-earned rather than re-asserted. The lesson is that the endpoint tests are the durable proof and a live row is only a demonstration.

**Schema drift is now caught mechanically, one layer.** `triggers.test.ts` derives its expected table list from the schema module and requires the database to carry every table the code declares — so a generated-but-unpushed migration fails the suite instead of passing by not existing. That closes half of the failure this file was caught in. The other half is open: nothing checks that a table someone claims holds a row actually holds one. That is correctly not a test's job, but it is why "verified live" is a weaker claim in here than "covered by a test", and the two should not be written as if they were the same.

**Soft delete is proven from the browser, incidentally.** The table holds three mission rows, two of them soft-deleted; the screen renders exactly one. `isNull(missions.deletedAt)` in `listMissions` is doing real work rather than sitting decoratively in the query.

**Provenance note.** The first mission row created through the API was `06092187…`; it is soft-deleted, because the em dash in its brief arrived as `U+FFFD`. The live record is `27b48649…`, posted with an ASCII-escaped body. The corruption came from this workstation's handling of a curl `-d` argument — heredoc file writes preserve `U+2014` correctly and the source tree is clean — so it is a hand-testing trap, not an API defect.

**Suite: 167 of 167 pass.** Six had been failing on this workstation. Both causes were defects in the test harness, not in the code under test; both are fixed, and neither ever touched a production path:

- **3 × `render` determinism** (`export/render/render.test.ts`) — `spawnSync … node_modules/.bin/tsx ENOENT`, two faults stacked. `tsx` was **undeclared**, present only as a transitive peer of Vite and so given no `.bin` entry by pnpm's strict layout; and `node_modules/.bin/tsx` is a POSIX shell script, so even once installed, `execFileSync` on the extensionless name cannot run it on Windows (the runnable shim there is `tsx.CMD`). Fixed by declaring `tsx` as a devDependency **and** spawning `process.execPath` with `--import tsx --input-type=module`, which is the same child process on every platform.
- **3 × `git hash-object` disagreement** (`export/git/gitBlobSha.test.ts`, `export/blast/integration.test.ts`) — Windows only. The tests handed node's `join()` output to `git hash-object`; on Windows that is **backslash-separated**, git could not match it against the fixture directory's `.gitattributes`, the `* -text` guard lapsed, and the system-config `core.autocrlf=true` normalised `crlf.txt` before hashing. `gitBlobSha` was the correct side throughout — it returns `4e7cdf2b…`, which is what the file's own index entry holds. Fixed by passing the bare fixture name with `cwd: FIXTURES`, so git resolves it itself and finds the `.gitattributes` that was always there.

---

## Gaps

### Blocking

- **`mission.status` still has no vocabulary.** Resolved enough to write, not resolved. Migration `0008` defaults the column to `'draft'` so a row is insertable; that does **not** declare a lifecycle, and the column is still `TEXT` while every other status in `DATA-CONTRACTS-V2` is a closed enum. Promote it to a `pgEnum` once mission 001 has run and shown what the states are — writing the enum before then is a guess about states nobody has observed.
- **`mission.update` has no handler, deliberately.** The contract accepts a partial of the whole schema, which would let a caller set `cut` directly, and a freely-chosen cut is the exact defect `cut_source` exists to prevent (`DECISIONS-V2.md:246`). **Narrow the contract before writing the handler.** This is the one remaining write blocked on a contract question rather than on effort.
- **Only Mission is served at all.** The other seven entity groups have no procedures and no routes (see `contract/index.ts`). The wire to Neon is open and proven, but exactly one entity travels it.
- **Export delivery targets are unbuilt.** `render` produces the file map; nothing turns it into a zip, a PR, or a push. `Connection` and `Export` tables (migration step 3) do not exist yet, and `preview`/`create` resolve both.
- **Four canonical-doc rulings live only in this repo.** Building `Connection` and `Export` surfaced four places where `DATA-CONTRACTS-V2.md` and the shipped code disagree. They were ruled on 2026-08-29 and are implemented, but **the canonical doc still says the old thing**: Connection gains `engagement_id`; Export gains `dry_run` · `preview_export_id` · `base_ref` · `base_commit_sha` · `blast_radius`; `export_status` is the contract's nine values, not the doc's six; `exports.connection_id` is nullable with a `target_kind = 'zip'` CHECK. That doc is maintained outside this repo and has drifted three times already — **reconcile it or these get re-litigated.** Reasoning is in commit `b850d98`.
- **Four Export/Connection conflicts are open and uncoded.** `gate_override` has two incompatible shapes (doc `:281` vs contract `:77` — typed against the contract, `jsonb`, so reconciling costs no migration). `pr_status` has no vocabulary anywhere, so it is nullable TEXT rather than an invented enum — `missions.status` without the teeth. A third meaning of `scope` is described in prose at `:332` with no field block, so no column was added. Export immutability after freeze is an `[attestation]` with no constraint or trigger behind it.
- **Client-side contract conformance is specced, not built.** `CLIENT-CONTRACT-CONFORMANCE.md` — D1–D5 ratified 2026-08-29 (OpenAPI + `oasdiff`, generated from the implementation, `.avel/contracts/phase1.openapi.json` hashed as `mission_contract_sha256`). The `verification.conformance` field shape is defined; the extractor and the `oasdiff` step wait on the export verification runner. Until it runs, the alignment gate stays a labelled `[attestation]`.

### Content-blocked, not code-blocked

- 14 of 19 agent identity files are `[STUB]`s. All 19 were authored against the v1 roster; `ROSTER-V2.md` cuts two leads, folds Neil into Fenn, and narrows Kodie.
- 17 of 19 agent files await the PE/CB rewrite.
- `base_skills` seeds empty — no skill library exists.

### Unowned

- **No sandbox exists.** Agents run with full user privileges on a machine holding the GitHub credential, with every client's code on one filesystem. `SANDBOX.md` Tier 0 fixes this at zero cost.
- **`cc-palette.html`** — a design system (tokens, contrast ratios, chamfer geometry) exists as a standalone HTML file referenced by no document. It needs an owner doc or an explicit note that it is a scratch artifact.
- **`MOBILE-PWA.md` does not exist** but is referenced by the frontend handoff prompt as required reading. The mobile boundary and the iOS push-permission ordering are undocumented. **A frontend session cannot start on mobile work until this is written.**

### Minor

- **No `test` script in `package.json`.** The suite runs only as `npx vitest run`; `pnpm check` covers Biome and tokens but not tests, so nothing makes the suite the default gate. (The previously-listed `npm run start` gap was stale — no `start` script exists, and none appears anywhere in this repo's history.)
- **`pnpm check` fails on `.vscode/settings.json`** — a Biome formatting error in a committed file nobody has touched. Pre-existing and unrelated to `src`, but it leaves the check script red by default, which trains people to ignore it. Two `noNonNullAssertion` warnings in `export/render/bytes.ts` are likewise long-standing.
- **The mission list fetches one page and says so.** `meta.nextCursor` is read and the footer states the limit when more rows exist, but no pager is built. Deliberate: cursor pagination is proven at the service layer, and a pager behind a single row would be speculative. The first dataset that outgrows 25 rows is the signal.
- **`CRUD_CODES` has no error map.** `contract/errors` holds an export-scoped and an auth-scoped `ERROR_MAP`; the CRUD vocabulary has none, because it has exactly one consumer — the mission list, which names its single reachable code (`FORBIDDEN`) locally. Deliberate: a shared map for one caller is an abstraction whose shape is a guess. The second screen that needs it should force `contract/errors/crud-map.ts` into existence.

---

## The parallel-session problem

The canonical data model is maintained outside this repo and advances in parallel sessions. It has drifted ahead of the repo doc set three times; each reconciliation surfaced real conflicts.

**Re-pull canonical before any schema work.** This is the most common source of wasted effort on this project.

`docs/scripts/check-docs.sh` now catches the mechanical half of this automatically. It does not catch semantic drift.

---

## What has to happen next

**One mission, end to end, measured.** Not the frontend, not more architecture. Every decision in `DECISIONS-V2.md` is a hypothesis until a real client project passes through the whole pipeline — manually in places if necessary — and produces a number.

Standing between here and that, in order:

1. ~~Answer the `status` / `cut` question.~~ **Done 2026-08-29**, migration `0008`. `status` defaults to `'draft'` and stays TEXT; `cut` became nullable, because it is derived from a repository that does not exist at capture time and a default would have fabricated a derivation.
2. ~~Write the first mission.~~ **Done** — `POST /api/missions`, `201`, all four declared failure paths confirmed.
3. ~~Point one screen at the endpoints that exist.~~ **Done** — `missions.index.tsx` renders the row from Neon through all four states.
4. ~~Apply `0009`/`0010`.~~ **Done 2026-08-29** — step 3 complete, 11 of 16 entities, both triggers live. **Reconciling the canonical doc is NOT done** and is now the oldest outstanding debt: four rulings live only in this repo, four more conflicts are unresolved. See *Gaps*.
5. **Export delivery targets.** `render` has produced the correct file map since 2026-08-29 and nothing consumes it. This is the largest unbuilt block in the system, and the only thing standing between a `draft` mission and a delivered one.
6. **Run mission 001.** Everything above is scaffolding for this. `docs/MISSION-001-COUNSELOS-SLICE-0.md` is written to be filled in *as it runs*, and its client and engagement rows now exist in Neon.
