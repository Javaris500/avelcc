# The Export Engine

*How AVEL turns a mission into files in someone else's repository, why it is built this way, and what we chose not to do.*

Written for someone joining the project who has read no other doc. Where a decision had a plausible alternative, the alternative is stated and so is the reason it lost. If you disagree with one, the reasoning is here to argue with — that is the point of writing it down.

> **This is a teaching document, not a source of truth.** `CLAUDE.md`'s doc-ownership rule is that one fact has one owner: **`DECISIONS-V2.md` owns rationale and rejected ideas, `STATE.md` owns build status and gaps, `DATA-CONTRACTS-V2.md` owns entity shapes.** This file deliberately restates parts of all three in one narrative, because reading five documents in dependency order is not a way to learn a system.
>
> The cost of that is drift. **Where this file disagrees with those, they win** — and fixing this file is then the job, not arguing with them. If you are changing behaviour, update the owning document; update this one only to keep the explanation true.

---

## 1. What problem this solves

AVEL produces a package of files — a mission brief, a roster, per-agent instructions — and puts it into a client's Git repository.

That last step is the dangerous one. **We are writing into a codebase we do not own.** A mistake is not a bad response on a screen that the user can ignore; it is a commit in someone's repository, possibly overwriting work, possibly deleting it, and always visible to people who did not ask us to touch it.

Everything below follows from that single fact. If you only remember one thing: **the export engine is not a file-writing feature with safety checks bolted on. It is a safety mechanism that happens to write files.**

---

## 2. The pipeline, end to end

```
mission (Neon)
   │
   ├─ render()            → a Map<path, bytes>: the package, deterministically
   │
   ├─ packageSha256()     → one hash over every path and its content
   │
   ├─ readTree()          → what is already in the client's repo
   ├─ computeBlastRadius()→ what delivery would CREATE, OVERWRITE, leave alone
   │
   ├─ guards              → four refusals, all pure functions
   │
   └─ a DeliveryTarget    → zip | github_pr | github_push
```

Each stage is a separate module with its own tests. The reason for that separation is in §4.

**Where the code lives:**

| Stage | Path |
|---|---|
| Render | `src/modules/export/render/` |
| Blast radius | `src/modules/export/blast/` |
| GitHub read | `src/modules/export/gateway/readTree.ts` |
| GitHub write | `src/modules/export/gateway/write.ts` |
| Zip writer | `src/modules/export/zip/` |
| Guards + lifecycle + targets | `src/modules/export/delivery/` |
| Orchestration | `src/modules/export/service.ts` |
| Routes | `src/routes/api/exports*.ts` |

---

## 3. Determinism, and why it is load-bearing

**The rule: the same mission must render byte-for-byte identical output, on every machine, in every timezone and locale, forever.**

This is not tidiness. Three things depend on it:

1. **Replay.** You cannot re-run a past mission against a new model and compare results if the baseline moves on its own.
2. **The determinism gate** (§6). It compares two renders; if renders drift naturally, the gate is noise.
3. **Trust.** "We can reproduce exactly what we shipped you" is a claim we either can or cannot make.

### The sorting decision

Every place the engine orders anything — file paths, agents, skills, zip entries — uses `byCodepoint`, never `String.localeCompare`.

**Why:** `localeCompare` is locale-derived. Turkish orders `Ilk` before `ilk`; English orders it after. A package sorted with `localeCompare` produces *different bytes on different machines*, and the difference is invisible until two people compare hashes.

**Alternative considered:** `localeCompare` with an explicit locale, e.g. `localeCompare(b, 'en')`. Rejected — it still routes through ICU, whose collation tables change between Node versions. Codepoint order is defined by the string itself and cannot drift.

### A trap worth knowing about

The renderer's determinism tests set `TZ=Asia/Tokyo LANG=tr_TR.UTF-8 LC_ALL=tr_TR.UTF-8` in a child process and assert the hash does not move.

**On Windows, the locale half of that does nothing.** `LC_ALL` and `LANG` never reach Node's collator — the child resolves `Intl.Collator` to `en-US` regardless, and `"I".toLowerCase()` is `"i"`, not the dotless `ı` the test's comment assumed. `TZ` works fine. So on a Windows workstation those tests compare two identical configurations and prove nothing.

**The fix, and the general lesson:** a test that compares two runs *against each other* cannot catch a change that moves both of them equally. The repair was a **pinned digest** — one side, frozen, so anything that reorders the package moves it with no environment involved. If you are writing a determinism test, prefer a frozen value over a self-comparison.

---

## 4. Why the guards are pure and the targets are thin

The four safety checks live in `delivery/guards.ts` as pure functions. They take plain values, touch no database and no network, and return a result. The delivery targets — the code that actually writes — do no checking at all.

**Why:** if each target checked for itself, there would be three implementations of the same rules, and one of them would eventually be subtly wrong. The one that is wrong would be `github_push`, because it is the one nobody tests against a real repository.

**Alternative considered:** a base class with the checks in a template method, targets overriding the write step. Rejected — inheritance makes it easy to override the wrong thing, and a subclass can skip a `super` call. A pure function that runs *before* the target is even constructed cannot be skipped by a target author.

Two rules are enforced by **shape** rather than by discipline, which is the part worth copying elsewhere:

- `checkNoViolations(violations)` takes **no override parameter**. You cannot pass a gate override to it because there is nowhere to put one.
- `checkPreviewFresh(a, b)` takes **two SHAs and nothing else**. There is no argument by which "the changes don't overlap" could be smuggled in. A test asserts the function's arity, so growing that signature has to be deliberate.

> **Gates vs violations.** A *gate* is about work quality — tests failing, coverage dropping — and an operator may override one with a written justification. A *violation* is about writing where you were not permitted. **A violation is never overridable.** A justification does not make a path traversal acceptable.

---

## 5. The blast radius, and the TOCTOU problem

Before any delivery we read the client's repository and compute what would change: which files are **created**, which are **overwritten**, which are **unchanged**, and which **violate** a path rule.

Overwrites are the interesting category — that is where we destroy someone's work.

### Time-of-check / time-of-use

The preview says "3 overwrites". Ten minutes later the operator presses Deliver. Someone pushed in between; it is now 5 overwrites, one of them a file that did not exist when we looked.

**A preview that can silently go stale is worse than no preview, because it manufactures confidence.**

**The guard:** the preview records the branch tip SHA. At delivery we re-read the tip. If it moved, we refuse with `PREVIEW_STALE` and the operator re-previews.

**Alternative considered — and explicitly rejected:** "only refuse if the changed files actually overlap ours." This is tempting and wrong. Overlap detection is a judgment call about someone else's repository, made by code that cannot see intent. A refactor that touches nothing we write can still change what our delivery *means*. Refusing costs one API call; being clever costs a corrupted repository.

**We do not enumerate unchanged files.** A client repo has thousands. Listing them buries the three lines that matter. The preview reports a count and top-level directory names.

---

## 6. The dry run, and a free determinism gate

A preview is a **real Export row** with `dry_run: true`, terminal at status `previewed`. It is **never promoted** — the real export re-renders the package from scratch.

Re-rendering looks wasteful. It is the opposite, and this is the most elegant mechanism in the system:

> The render is deterministic. Therefore the real export's package hash **must** equal its preview's. If it does not, something non-deterministic reached the render path — an unsorted map, a leaked timestamp, a locale-sensitive comparison — and it has been caught **on this export, before delivery**.

That is a determinism check running on every single export, costing a render that was happening anyway. It verifies the one architectural property everything else rests on.

**Alternative considered:** cache the preview's rendered bytes and reuse them at delivery. Faster, and it destroys the gate — you would be delivering the bytes you already checked, proving nothing about reproducibility.

**Consequence:** `previewed` is a terminal state in the lifecycle machine. If a dry run could be promoted to `delivering`, the gate could be bypassed entirely, so the transition table forbids it and a test asserts no edge leaves `previewed`.

---

## 7. The three targets

| Target | Writes | Terminal status | Preview required? |
|---|---|---|---|
| `zip` | nothing remote | `done` | no |
| `github_pr` | a new branch + a PR | `pr-open` | warned if absent |
| `github_push` | the target branch | `done` | **refused if absent** |

**`github_pr` lands on `pr-open`, not `done`.** Whether a PR merges is the client's decision. Reporting `done` would claim a delivery that is still sitting unreviewed in someone's queue.

**The device boundary.** A `github_push` with no linked preview is refused *in a guard*, not by hiding a button. Approving a gated export from a phone is fine; initiating an irreversible one is not — and that holds because the server refuses it, not because a screen was designed a particular way. **A UI-only rule is not a rule.**

### The zip writer is hand-rolled

No library. ~250 lines against `node:zlib`.

**Why:** a zip library will happily stamp the current time into each entry's DOS timestamp field. The archive extracts perfectly, every file is correct, and the hash differs on every run — undetectable until two machines disagree. Rather than audit a dependency for that behaviour and re-audit on every upgrade, we write the format. Every field that could carry a clock or a locale is a pinned constant.

**Residual risk, stated rather than hidden:** DEFLATE does not standardise its encoder. Every zlib knob is pinned, which fixes output for a given zlib build, but a future Node could compress identically-input bytes differently. A pinned fixture digest makes that day a loud red test naming what moved, instead of a silent cross-machine disagreement.

**It also refuses to emit a zip-slip archive** — paths containing `..`, absolute paths, backslashes. We are the *writer*, so this is not input validation; it is declining to hand a client an archive that attacks whoever extracts it.

---

## 8. The GitHub write path, and its one genuinely dangerous field

Delivering to GitHub is five calls: `createBlob` per file → `createTree` → `createCommit` → `createRef` (PR) or `updateRef` (push) → `createPullRequest`.

### `base_tree` is the field that can delete a codebase

`createTree` takes a `base_tree`. **A tree created without one contains only the entries you supplied** — so the commit pointing at it has deleted every other file in the repository. That is not a corrupted write. It is a *valid commit* that removes the client's code, and it is one forgotten property away.

Three defences:

1. The parameter is typed `string | null`, **required and nullable** rather than optional. You cannot reach the dangerous case by omission; you must write `null` and mean it. `null` is correct exactly once — the first commit into an empty repository.
2. It is resolved through `getCommit`, because `ctx.baseCommitSha` is a **commit** SHA and `createTree` wants a **tree** SHA. Verified against the live API: `GET /git/trees/{branch}` echoes back the resolved *commit* SHA, not the tree's, which makes the two very easy to confuse.
3. A test asserts the value sent is the tree SHA and explicitly **not** the commit SHA.

**Two shortcuts were available and both refused:**

- *Pass the commit SHA as `base_tree` and let GitHub resolve it.* It probably works; it is undocumented. Not a trade worth making on this field.
- *Skip `base_tree` and rebuild the whole tree from `readTree`'s recursive listing.* This is the dangerous one, and it looks reasonable. **`readTree` falls back to a `.avel`-scoped call when the full tree truncates.** So on exactly the large repositories where it matters, that listing is partial — and a no-base tree built from a partial listing deletes every file outside `.avel`.

### Other decisions here

- **`updateRef` never forces by default.** Force is an explicit opt-in argument, and `github_push` never passes it. A non-fast-forward push is GitHub's to refuse, and the answer to a branch that moved is to re-preview — never to overwrite what arrived.
- **`createRef` cannot repoint an existing ref.** Repointing is `updateRef`'s job. Keeping the additive call incapable of destruction is most of the value of having two calls.
- **Blobs are written sequentially, not in parallel.** GitHub's secondary rate limit is triggered by concurrency rather than volume. A package is tens of files, so the wall-clock saving is small and the failure it buys is a half-delivered package.
- **`createBlob` verifies the SHA GitHub returns** against our own `gitBlobSha` of the bytes we sent, and refuses the blob if they disagree. A blob whose remote content differs from what we rendered must never reach a tree.
- **GitHub's two ref endpoints disagree about names.** `POST /git/refs` wants `refs/heads/x`; `PATCH /git/refs/{ref}` wants `heads/x` and 404s on the long form. The gateway normalizes each to what its endpoint expects. It reads like a bug if you skim it.

---

## 9. Error codes: a closed vocabulary, and what it cost

Errors carry a **code**, never a parsed message. `ERROR_MAP` turns each code into operator-facing copy and a recovery action, and it is a `Record` keyed on the union — so adding a code **fails the build** until it is given a screen.

The unions are deliberately separate: `ERROR_CODES` (export), `CRUD_CODES` (resources), `AUTH_CODES` (sign-in), `VIOLATION_CODES` (path rules). Collapsing them would let a mission 404 render through the export error map, which has no case for it.

**What went wrong, three times:** `ERROR_CODES` was seeded from one document's table, and the contract kept naming codes that table never had. `IDEMPOTENCY_REPLAY` was declared on a route's `409` and existed in no vocabulary at all. `PRECONDITION_FAILED` was named on a `422` but lives in `CRUD_CODES`, which that envelope cannot carry. And nothing meant "GitHub refused this request", so refusals fell through to `EXTERNAL_GITHUB` — whose copy tells the operator it is *safe to retry*, which on that path is false.

**Resolutions, and why they differ:**

- `IDEMPOTENCY_REPLAY` was **added**. It named a real state the route reaches and nothing else could express it.
- `GITHUB_REJECTED` was **added**. The distinction from `EXTERNAL_GITHUB` is retryability, which is the half an operator acts on.
- `PRECONDITION_FAILED` was **deleted from the contract instead**. It already exists in `CRUD_CODES`, and two unions holding the same name is worse than a missing one — a screen switching on the code could not tell which vocabulary it came from.

**The lesson:** a closed vocabulary is worth having, but seed it from the code that uses it, not from a document. And when you add to one, the things you must re-read are the ones your change made wrong — which are usually *not* the ones you edited.

---

## 10. What is deliberately not built

Being explicit about this matters more than the features. A reader should not mistake "the tests pass" for "this has delivered anything."

| Gap | Consequence |
|---|---|
| **No render input assembler** | `render()` needs roster, playbook and per-agent skills assembled from Neon, and nothing does that. **Every mission currently renders the same golden fixture package.** |
| **No Connection provisioning** | The schema requires a `connection_id` for any GitHub target, `connections` is empty, and nothing can populate it. **No GitHub delivery can be inserted at all.** |
| **No blob storage (R2)** | `snapshot_key` cannot be written, and the schema requires all three snapshot columns or none. Deliveries work; **replay and audit do not.** |
| **GitHub fixtures are constructed, not recorded** | Recording a write means performing one. The write path is proven correct **against GitHub's documented schemas, not against GitHub.** |

That last row is the one to take seriously. A green suite here means "we send what the docs say to send", not "this works against the real API".

---

## 11. If you are changing this code

- **Do not add a parameter to a guard.** If a check needs more information to be smarter, that is usually a sign the smartness is wrong. Re-read §5.
- **Do not make `previewed` non-terminal.** §6.
- **Do not sort with `localeCompare`.** §3.
- **Do not make `base_tree` optional.** §8.
- **If you add an error code**, `ERROR_MAP` will fail the build until you write copy for it. Write it for the operator deciding what to do next, not for a log.
- **If a determinism test compares two runs**, ask what would happen if your change moved both of them. If the answer is "the test still passes", pin a digest instead.
