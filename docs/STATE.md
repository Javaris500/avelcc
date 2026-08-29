# AVEL Command Center — State

*The single source of truth for build status, counts, and gaps. **No other document may state build status, entity counts, or agent counts.** They link here.*

**Last updated:** 2026-08-29

---

## One-line status

Backend rebuild in progress on the v2 stack. Export engine's deterministic core is built and byte-for-byte on the golden fixture. The first request path is open end to end — HTTP → route → service → Neon → response — for mission **reads only**; writes are blocked on an undefined vocabulary, delivery targets are unbuilt, and no screen calls the API yet. **Zero missions have run.**

---

## Counts

| Thing | Count |
|---|---|
| Core entities — target (`DATA-CONTRACTS-V2.md`) | **16** + SkillSource (supporting catalog) |
| Core entities — built in `schema.ts` | **9 of 16** + SkillSource + 2 join tables (`agent_template_skills` · `roster_entry_skills`) — Client · Engagement · AgentTemplate · Skill · Mission · Playbook · RosterEntry · RosterPreset · RepoPolicy. Absent: KnowledgeEntry · Finding · Intake · Export · Connection · ActivityLog · User |
| Tests | **167** — all passing on this workstation (Windows · node 24 · pnpm); two harness defects fixed 2026-08-29, see *Verification* |
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
| 1 | Schema & validation (Zod) | 🟡 steps 0–2 built (9 core entities + joins); step 3 (Connection · Export) and step 4 (KnowledgeEntry · ActivityLog · User) absent; pgvector not enabled |
| 2 | Persistence (Drizzle + migrations) | 🟡 migrations `0000`–`0007` applied to Neon; runtime db client built (`modules/db/client.ts` — neon-http on the pooled `DATABASE_URL`, server-only). Entity coverage is the remaining gap, not the connection |
| 3 | Auth & context | ✅ built (portable, unchanged) |
| 4 | Contract layer (`src/contract/`) | 🟡 `mission · roster · playbook · export` built + shared envelope/pagination/errors; four error vocabularies (`ERROR_CODES` · `VIOLATION_CODES` · `AUTH_CODES` · `CRUD_CODES`) kept deliberately separate; 7 entity groups still unspecced (see `contract/index.ts`) |
| 5 | API layer (server route handlers) | 🟡 `GET /api/missions` and `GET /api/missions/:id` built and exercised against a real Neon row; `auth` and `preflight.blast-radius` alongside them. Mission **writes** absent (blocked, see Gaps); every other entity has no route. Pattern is TanStack Start `createFileRoute().server.handlers`, not a ts-rest server adapter |
| 6 | Service layer | 🟡 `modules/mission/service.ts` only — `listMissions` (client-name join + pagination envelope) and `getMission`. No other entity has a service |
| 7 | Roster & loadout | 🟡 contract shape only (`contract/roster.ts`); no service |
| 8 | Export engine — deterministic core | ✅ `render` byte-for-byte 20/20 on the golden fixture (D5 resolved 2026-08-29) · `blast` radius · `git` blob-sha · locale/determinism proven |
| 9 | Export targets (zip · PR · push) | ⬜ not started — `gitBlobSha` is the only building block; nothing writes a zip or opens a PR |
| 10 | GitHub gateway (real) | 🟡 `readTree`/`parseTree` built + tested against real trees; served read-only via the preflight route |
| 11 | Webhook + zip route | ⬜ not started |
| 12 | Cross-cutting (ActivityLog, AppError) | 🟡 error taxonomy built; ActivityLog has no table yet |

**Carried forward from v1:** auth, the GitHub gateway interface, the error taxonomy. Everything schema- or API-shaped is being redone against ts-rest and Neon.

---

## Verification

Modules 1, 8 and 10 are proven by unit tests over pure functions and fixtures. Module 5's two read endpoints are proven by being driven against a real Neon row — the client-name join, the pagination envelope and the `NOT_FOUND` path all confirmed.

**Half the loop is closed.** A request now travels **HTTP → route → service → Neon → response**. It has *not* travelled **browser → route**: `routes/_app/missions.index.tsx` still resolves its query to a hard-coded empty list, and no screen in the app calls `/api/missions`. Wiring one screen to the endpoints that now exist is the cheapest way to close the other half.

**Suite: 167 of 167 pass.** Six had been failing on this workstation. Both causes were defects in the test harness, not in the code under test; both are fixed, and neither ever touched a production path:

- **3 × `render` determinism** (`export/render/render.test.ts`) — `spawnSync … node_modules/.bin/tsx ENOENT`, two faults stacked. `tsx` was **undeclared**, present only as a transitive peer of Vite and so given no `.bin` entry by pnpm's strict layout; and `node_modules/.bin/tsx` is a POSIX shell script, so even once installed, `execFileSync` on the extensionless name cannot run it on Windows (the runnable shim there is `tsx.CMD`). Fixed by declaring `tsx` as a devDependency **and** spawning `process.execPath` with `--import tsx --input-type=module`, which is the same child process on every platform.
- **3 × `git hash-object` disagreement** (`export/git/gitBlobSha.test.ts`, `export/blast/integration.test.ts`) — Windows only. The tests handed node's `join()` output to `git hash-object`; on Windows that is **backslash-separated**, git could not match it against the fixture directory's `.gitattributes`, the `* -text` guard lapsed, and the system-config `core.autocrlf=true` normalised `crlf.txt` before hashing. `gitBlobSha` was the correct side throughout — it returns `4e7cdf2b…`, which is what the file's own index entry holds. Fixed by passing the bare fixture name with `cwd: FIXTURES`, so git resolves it itself and finds the `.gitattributes` that was always there.

---

## Gaps

### Blocking

- **Mission writes cannot be implemented as specified.** `missions.status` is `TEXT NOT NULL` with **no default and no vocabulary defined anywhere**; `missions.cut` is `NOT NULL` on the `mission_cut` enum with no default. `mission.create`'s body picks only `engagementId · type · sprintN · brief` — so the contract, obeyed literally, produces an `INSERT` the database rejects. Either the create body gains both fields, or the schema gains defaults, or `status` gains a vocabulary. **This is a contract question, not a coding task**, and it gates every write endpoint that follows the same pattern.
- **Only mission reads are served.** `list` and `get` are built; `create` and `update` are blocked above, and the other seven entity groups have no procedures to serve (see `contract/index.ts`). The deterministic core works and the wire to Neon is open, but nothing yet writes through it.
- **Export delivery targets are unbuilt.** `render` produces the file map; nothing turns it into a zip, a PR, or a push. `Connection` and `Export` tables (migration step 3) do not exist yet, and `preview`/`create` resolve both.
- **Migration step 3 is two-thirds outstanding.** `RepoPolicy` landed 2026-08-29 (migration `0006`, trigger `0007`) — applied to Neon and verified live. `Connection` and `Export`, the other two tables in that step, remain.
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
- **`routes/_app/missions.index.tsx` carries a stale comment** — "there is no contract yet, so there is no Mission shape." `mission.list` and `missionListRow` now exist; the screen still returns `[]`.

---

## The parallel-session problem

The canonical data model is maintained outside this repo and advances in parallel sessions. It has drifted ahead of the repo doc set three times; each reconciliation surfaced real conflicts.

**Re-pull canonical before any schema work.** This is the most common source of wasted effort on this project.

`docs/scripts/check-docs.sh` now catches the mechanical half of this automatically. It does not catch semantic drift.

---

## What has to happen next

**One mission, end to end, measured.** Not the frontend, not more architecture. Every decision in `DECISIONS-V2.md` is a hypothesis until a real client project passes through the whole pipeline — manually in places if necessary — and produces a number.

Standing between here and that, in order:

1. **Answer the `status` / `cut` question.** It is one decision and it unblocks every write endpoint. Nothing downstream can start without it.
2. **Write the first mission.** `POST /api/missions` against a real row, using whatever 1 settles.
3. **Point one screen at the endpoints that exist.** `missions.index.tsx` closes browser → route → Neon the moment it stops returning `[]`. Cheap, and it converts the read path from "exercised by hand" to "exercised by the app."
4. **Migration step 3's remaining two** — `Connection`, then `Export`. Delivery targets cannot begin before them.
