# AVEL Command Center — State

*The single source of truth for build status, counts, and gaps. **No other document may state build status, entity counts, or agent counts.** They link here.*

**Last updated:** 2026-08-29

---

## One-line status

Backend rebuild in progress on the v2 stack. Export engine's deterministic core is built and byte-for-byte on the golden fixture; delivery targets and the API layer that serves it are not. **Zero missions have run.**

---

## Counts

| Thing | Count |
|---|---|
| Core entities — target (`DATA-CONTRACTS-V2.md`) | **16** + SkillSource (supporting catalog) |
| Core entities — built in `schema.ts` | **9 of 16** + SkillSource + 3 join tables — Client · Engagement · AgentTemplate · Skill · Mission · Playbook · RosterEntry · RosterPreset · RepoPolicy. Absent: KnowledgeEntry · Finding · Intake · Export · Connection · ActivityLog · User |
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
| 2 | Persistence (Drizzle + migrations) | 🟡 migrations `0000`–`0005` on Neon; **no runtime db client in `src`** — only the trigger test opens a connection |
| 3 | Auth & context | ✅ built (portable, unchanged) |
| 4 | Contract layer (`src/contract/`) | 🟡 `mission · roster · playbook · export` built + shared envelope/pagination/errors; 7 entity groups still unspecced (see `contract/index.ts`) |
| 5 | API layer (server route handlers) | ⬜ not started — only `auth` and `preflight.blast-radius` routes exist. Pattern is TanStack Start `createFileRoute().server.handlers`, not a ts-rest server adapter |
| 6 | Service layer | ⬜ not started |
| 7 | Roster & loadout | 🟡 contract shape only (`contract/roster.ts`); no service |
| 8 | Export engine — deterministic core | ✅ `render` byte-for-byte 20/20 on the golden fixture (D5 resolved 2026-08-29) · `blast` radius · `git` blob-sha · locale/determinism proven |
| 9 | Export targets (zip · PR · push) | ⬜ not started — `gitBlobSha` is the only building block; nothing writes a zip or opens a PR |
| 10 | GitHub gateway (real) | 🟡 `readTree`/`parseTree` built + tested against real trees; served read-only via the preflight route |
| 11 | Webhook + zip route | ⬜ not started |
| 12 | Cross-cutting (ActivityLog, AppError) | 🟡 error taxonomy built; ActivityLog has no table yet |

**Carried forward from v1:** auth, the GitHub gateway interface, the error taxonomy. Everything schema- or API-shaped is being redone against ts-rest and Neon.

**Verification gap to watch:** modules 1, 2, 8, 10 are proven by unit tests over pure functions and fixtures. **No request has travelled browser → route → Neon → response** — the API and service layers that would close that loop (modules 5, 6) are unstarted.

---

## Gaps

### Blocking

- **No API or service layer.** The `src/contract/` shapes are defined but nothing serves them, and no runtime db client exists. This is now the gate on running a mission: the deterministic core works, but there is no path from an HTTP request to it.
- **Export delivery targets are unbuilt.** `render` produces the file map; nothing turns it into a zip, a PR, or a push. `Connection` and `Export` tables (migration step 3) do not exist yet, and `preview`/`create` resolve both.
- **`RepoPolicy` table** — added 2026-08-29 (migration `0006`). `Connection` and `Export` remain, so migration step 3 is still incomplete.
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

- `npm run start` points at `.output/server/index.mjs`; the build emits `dist/`.

---

## The parallel-session problem

The canonical data model is maintained outside this repo and advances in parallel sessions. It has drifted ahead of the repo doc set three times; each reconciliation surfaced real conflicts.

**Re-pull canonical before any schema work.** This is the most common source of wasted effort on this project.

`scripts/check-docs.sh` now catches the mechanical half of this automatically. It does not catch semantic drift.

---

## What has to happen next

**One mission, end to end, measured.** Not the frontend, not more architecture. Every decision in `DECISIONS-V2.md` is a hypothesis until a real client project passes through the whole pipeline — manually in places if necessary — and produces a number.
