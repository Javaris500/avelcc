# AVEL Command Center — State

*The single source of truth for build status, counts, and gaps. **No other document may state build status, entity counts, or agent counts.** They link here.*

**Last updated:** 2026-08-17

---

## One-line status

Backend rebuild in progress on the v2 stack. Export engine unstarted. **Zero missions have run.**

---

## Counts

| Thing | Count |
|---|---|
| Core entities | **12** + SkillSource (supporting catalog) |
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
| 1 | Schema & validation (Zod) | 🔁 rebuilding on v2 schema |
| 2 | Persistence (Drizzle + migrations) | 🔁 rebuilding on Neon |
| 3 | Auth & context | ✅ built (portable, unchanged) |
| 4 | Contract layer (`src/contract/`) | ⬜ not started — new under ts-rest |
| 5 | API layer (Hono + ts-rest handlers) | ⬜ not started |
| 6 | Service layer | ⬜ not started |
| 7 | Roster & loadout | ⬜ not started |
| 8 | Export engine | ⬜ **not started — highest risk** |
| 9 | Export targets (zip · PR · push) | ⬜ not started |
| 10 | GitHub gateway (real) | 🟡 interface built, unwired |
| 11 | Webhook + zip route | ⬜ not started |
| 12 | Cross-cutting (ActivityLog, AppError) | ✅ built (portable) |

**Carried forward from v1:** auth, the GitHub gateway interface, the error taxonomy, and the cross-cutting layer. Everything schema- or API-shaped is being redone against ts-rest and Neon.

---

## Gaps

### Blocking

- **The export engine is unstarted.** Everything downstream waits on it.
- **`RepoPolicy` has no table.** Export engine depends on it.
- **Client-side contract conformance is unspecified.** See `CLIENT-CONTRACT-CONFORMANCE.md` — the artifact Leonora must emit in the *client's* repo has no defined format, and the promoted top-priority gate cannot be built until it does.

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
