# CLAUDE.md

Standing rules for any agent working on AVEL. Read this before anything else.

Everything below comes from a mistake that actually happened on this project. None of it is hypothetical.

---

## The thesis, in one line

**AI produces work that looks finished but isn't.** Not wrong answers — missing layers. The model builds exactly what was asked and nothing that was assumed.

Every rule here is a defense against that, including the rules about your own behaviour.

---

## The five rules

### 1 · Verify before you assert

**What happened:** an agent wrote four "check your state" commands pointing at `apps/api/src/db/schema.ts`. That path did not exist. Every command errored, and an errored `grep -c` returns output that reads exactly like "zero tables." A confident, wrong status report was produced and acted on.

**The rule:** before stating a fact about this codebase, read the thing. Not the doc about the thing — the thing.

- Before quoting a file path, `ls` it
- Before quoting a count, count it
- Before saying a doc is current, check its date against the code
- If a tool fails, say the tool failed. Do not interpret an error as a result.

**When you cannot verify, say so.** "I could not read X, so this is from the doc, which may be stale" is a good answer. A confident guess is not.

### 2 · Extend the system, never redefine it

**What happened:** asked to improve the palette, an agent invented a new surface token and silently changed the meaning of existing ones. The brand tokens the landing page depends on were altered without anyone being told.

**The rule:** existing tokens, entity names, and conventions are load-bearing. Add alongside them.

- If something needs a different value, ask whether it needs a different **role** instead. Often the value is right and it is being used at the wrong level.
- If you change a shared definition, say so in the first sentence of your response.
- Never rename or drop a token, entity, or convention that another surface consumes.

### 3 · Report before fixing

If a doc disagrees with the code, or two docs disagree with each other, **write down what you found and stop.**

A doc someone relies on, silently rewritten, is a regression even when the rewrite is better. Where two sources conflict and the canonical one is silent, that is a question for the operator, not a judgment call.

Exception: obvious typos and broken links. Fix those.

### 4 · Do the arithmetic

**What happened, three times:** a roster claimed nineteen agents across teams holding eighteen. A doc said fifteen agents while listing fourteen. A total of twenty-six was stated where the parts summed to twenty-five.

**The rule:** when a document states a count, count the items. When it states a total, add the parts. Both, every time, before you rely on either.

### 5 · Delete the references, not just the thing

**What happened:** an agent was removed from the roster and became a function. Three references to it survived — an edge in the communication graph, a phase count, and a status table in another file.

**The rule:** removing something means grepping for its name across the whole doc set and fixing every hit. Deleting the definition is half the job.

---

## Boundaries

**Stay inside your mount.** Every agent has declared writable paths, enforced as filesystem mounts. A write outside them fails the ownership check and the mission does not ship.

**File blockers, do not absorb them.** If a dispatch forbids something you need, write it down with a documented workaround. Do not route around the boundary quietly.

Mission 002 filed three blockers and absorbed zero. That is how it was discovered that all three failures were the operator's, not the agent's. Silent workarounds would have hidden that.

**Testers never modify code under test.** Enforced by the mount, not by discipline. An agent that can edit the code it is testing can make any failing test pass by changing the code instead of fixing the bug.

---

## Evidence

**A green test suite means the code ran.** It does not mean the tests checked anything. A test with no assertions passes every time.

**Never trust a report over an artifact.** If something claims the tests pass, run them. If a doc says the schema is empty, open the schema.

**Security is a layer, not a feature.** Nobody will ask you to add access control. Add it anyway, and assume a model will not.

---

## Writing

- Plain declarative sentences. The project voice is the landing page: *"Built with intent." "Scope doesn't drift if the plan is signed off."*
- No em-dash asides, no "not X but Y" constructions, no marketing adjectives
- Mono for anything a machine produced — hashes, paths, slugs, counts. Sans for prose. Never mixed.
- Every claim carries its status: `[built]` `[specced]` `[hypothesis]` `[attestation]` `[unspecified]`

`[attestation]` matters most. It marks anything enforced by a claim rather than a mechanism, and it is this project's recurring failure mode.

---

## Doc ownership

**One fact, one owner.** A fact restated in two documents will drift. This has happened three times on this project, twice within a single writing pass.

| Fact | Lives in |
|---|---|
| Build status, counts, gaps | `STATE.md` only |
| Rationale, trades, rejected ideas | `DECISIONS-V2.md` |
| Entity shapes, contract structure | `DATA-CONTRACTS-V2.md` |
| Tool list | `TECH-STACK.md` |
| Agents, cuts, mounts, edges | `ROSTER-V2.md` |

Everything else links. Do not restate.

Run `scripts/check-docs.sh docs` before committing doc changes. It catches stale terminology and status leaks. **It does not catch arithmetic or dangling references** — those are rules 4 and 5, and they are yours.

---

## Before you propose anything

Read `DECISIONS-V2.md`. Several ideas in it were considered and rejected with reasons, and a fresh session will otherwise re-propose them.

Things that are settled and should not be reopened:

- The core is deterministic. No inference in the render, freeze, gate, or delivery path.
- The block decision is a function, not an agent.
- The cut is derived from the repository's directory structure, not chosen.
- Gates are `mandatory` or `warn`. There is no skippable.
- The mutation floor is global and versioned, never per-mission.
- `RepoPolicy` defaults false. Safe by absence.

---

## The honest status

Zero missions have run end to end through the platform. Two slices shipped through the process manually.

**Every design claim in these documents is a hypothesis until measured.** Write like it. If you find yourself asserting that something works, check whether anything has ever run it.
