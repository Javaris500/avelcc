# Surprises

*One line every time an agent does something you didn't predict. Good or bad.*

**Why this file exists.** AVEL's roster, wave sequencing, and file boundaries are hypotheses. This is the only place they get tested against reality. It also becomes the anti-pattern library and, eventually, the seed data for KnowledgeEntry — which is why it must be written *during* the mission, not reconstructed after.

**Rules**
- Write it the moment it happens. Reconstruction is fiction.
- One line. If it needs a paragraph, it's a finding — put it in the mission log instead.
- Record good surprises too. "Kel caught a schema mismatch nobody asked it to look for" is as informative as a failure.
- Never delete an entry. Strike through if superseded.
- **APPEND entries, never rewrite the file.** Four sessions share one tree and one copy of this file. `cat >>` physically cannot revert someone else's paragraph; a read-modify-write can, and silently — the entry just is not there and nothing looks wrong. The asymmetry is not symmetric: appending protects OTHERS from you, it does not protect you from a whole-file writer, so it only works at full adoption. The table at the top genuinely needs rewriting; say so before you touch it.

**Format:** `YYYY-MM-DD · slice · agent · what happened`

---

## Slice 0 — foundation

<!-- example, delete when the first real entry lands
2026-08-19 · S0 · Atlas · Wrote a repository method that queried across two modules directly — the boundary rule was in CLAUDE.md and it went around it anyway.
2026-08-19 · S0 · Iyo · Test suite came back green with zero assertions in three of eleven specs.
-->

---

## AVEL's own build

*Three AVEL sessions building the export engine. Not a CounselOS slice; the section headings below are that client's. Whether this file covers AVEL working on itself is an open structural question — the content is exactly what the file asks for, so it is recorded here rather than discarded for want of a heading.*

2026-08-29 · AVEL · avel-a8 · Found the renderer's tr_TR determinism tests prove nothing on Windows — LANG and LC_ALL never reach node's collator, so both children resolve en-US and the two sides move together.
2026-08-29 · AVEL · avel-96 · The determinism gate passed for months while comparing a wrong number against itself; the package hash included manifest.json, which the manifest's own hash excludes.
2026-08-29 · AVEL · avel-71 · Two error recoveries offered "Open connections" and navigated to /login — invisible for weeks because nothing rendered the recovery, and a defect the moment something did.
2026-08-29 · AVEL · avel-71 · A running dev server's route generator silently overwrote a committed 339-line route file with a 9-line scaffold stub that still typechecked and still served.
2026-08-29 · AVEL · avel-96 · TaskStop kills the wrapper, not the vite child — reported a server stopped while it kept serving, then told another session the port was free.
2026-08-29 · AVEL · avel-a8 · Refused to write an enum four times from vocabularies that existed, on the grounds that a value list you cannot read is a guess; three of the four later proved to have a fourth value the template did not list.
2026-08-29 · AVEL · avel-a8 · A query that is RIGHT BY ACCIDENT in the half people copy is worse than one wrong in both halves — `listMissions` filtered the mission and not the client it joined, and every service copied from it inherited the correct half without anyone re-deriving the other.
2026-08-29 · AVEL · all three · THE RECURRING ONE: a check that is real, and answers a narrower question than the claim it is about to support. "My log says 3000" ≠ "the port is mine". "I stopped it" ≠ "it is stopped". "The selector resolved" ≠ "the page is done". Each was caught only by going to the source before sending the message.
2026-08-30 · AVEL · avel-71 · A theme test raced a CSS transition IT introduced by measuring: the probe resolving a token has no `transition`, so it reports the destination instantly, while the real element carries `interactive` and animates `background` — a single-instant read caught the switcher mid-flight and reported the dark value in light mode, which is indistinguishable from a token frozen at the wrong theme.
2026-08-30 · AVEL · avel-71 · Deleted two controls, updated two lists that named them, missed a third — and the only mechanism that would have caught it was an e2e suite that had been silently unrunnable for an unknown length of time, so a correct rule failed for a reason unrelated to anyone's discipline.
2026-08-30 · AVEL · avel-71 · One timeout budget for "wait for the dev server to compile" and for "wait for the value to be correct" makes a slow machine indistinguishable from a wrong colour; the tell is a failure that moves between runs and reads as a MISSING value rather than an incorrect one.
2026-08-30 · AVEL · avel-71 · Shipped a header commit whose own message said it was unverified, and it was broken in two visible ways — saying "not verified" makes the note accurate, not the shipping safe.

---

## Slice 1

---

## Slice 2

2026-08-30 · AVEL · avel-a8 + avel-96 · Named a gap without checking whether a mechanism already closed it: called an uncalled `assertNever` an `[attestation]` failure, when `strict` mode's TS2366 already delivers the guarantee at every closed-union switch. The phrase was adopted and a ruling built on it before either session checked.

2026-08-30 · AVEL · avel-96 · Ruled that `assertNever` be wired into six `default:` branches; those switch over `code: string`, so it would not compile, and forced in would turn an unhandled error code into a white screen on the error path. "Twenty-minute job" was the tell — work costed without being looked at.

2026-08-30 · AVEL · avel-a8 · A grep that excludes the file being deleted from cannot tell you that file does not use the symbol — `coherenceResult` referenced `coherenceBlock` internally and the exclusion hid it. Safe by luck.

2026-08-30 · AVEL · avel-a8 + avel-c2 · Two sessions each made a wrong claim from a CORRECT read minutes apart: in a five-session tree a read of the working tree expires, and nothing about the check says when. Defence is saying WHEN and asking HEAD for historical questions.

2026-08-30 · AVEL · avel-a8 · `export/service.ts` stated twice that the render assembler did not exist and that its absence was why delivery could not run live. `assembleRenderMission` had existed for some time, unwired and untested. A status claim in a comment rotted into a false blocker.

2026-08-30 · AVEL · avel-a8 · A measurement tool that breaks produces a SPECTACULAR result, not a null one. The comment-symbol probe reported 415 misses out of 415 — a 100% failure rate reading as a catastrophic finding — because a backslash eaten by the shell turned `` into a backspace character and every regex tested for a control code. Same family as the locale test that passed under both locales because the env var never arrived. Permanent fix: CONTROL symbols asserted to RESOLVE, so the instrument cannot fail silently.

2026-08-30 · AVEL · avel-96 · Argued for the comment-symbol check on the claim it was "red right now on four stale symbols from tonight", read from the symbol list without opening the files. Three of the four were good comments naming something deliberately absent. The fifth instance of the family the mechanism was being proposed to catch, made while proposing it, and persuasive for the same reason the other four were: it was specific.

2026-08-31 · AVEL · avel-c2 · Followed their own documented fix — stash, type-check `HEAD`, pop — and `git stash` took all 26 uncommitted files across four sessions, then the `pop` failed on `routeTree.gen.ts` and aborted. The advice was written while thinking about four files and is unsafe in a shared tree. Restored fully. **A correct check with the wrong mechanism is worse than a wrong check, because a correct-sounding procedure gets followed.**

2026-08-31 · AVEL · avel-c2 · Verified the restore with `git diff $SHA -- $(git stash show --name-only $SHA)` and got a clean result from a command whose inner half returned NOTHING, because the stash was already dropped. An empty pathspec diffs nothing and reports success. Same shape as `grep "x" file || echo missing`, written while holding the incident that shape had just caused.

2026-08-31 · AVEL · avel-a8 · `commentSymbols.test.ts` detected the shared tree moving underneath it. When the stash swept a deletion in `contract/roster.ts`, the exempted symbols resolved again and the allowlist's both-directions assert went red — a change nobody told it about, caught by a design decision made for an unrelated reason. First test in this repo to notice another session's edit.

2026-08-31 · AVEL · avel-a8 + avel-71 · An allowlist entry dies TWO ways — its symbol returns, or the FILE it is keyed to goes away — and only the first was asserted. `scaffold.tsx` was deleted and its exemption stayed green forever. Its own text said PERMANENT and named the retirement condition correctly, which then had to be noticed by a person: the attestation-versus-mechanism split, inside the mechanism built to catch it.

2026-08-31 · AVEL · avel-a8 + avel-c2 · The replacement advice was incomplete in its turn: "use a worktree" omits that `node_modules` is gitignored and root-only, so the fresh worktree has no `tsc`. Measured, then made to work with a junction. **Two corrections deep and the third clause — unlink before removing the worktree, or `worktree remove --force` walks the junction into the real dependency tree — is the one that could still cost the most.**

2026-08-31 · AVEL · avel-c2 · A NEGATIVE result, recorded because the pattern did not hold: predicted `npx tsc` with no TypeScript installed would exit 0 and report success — the false-green shape collected four times tonight — and it does not. It exits 1 and says so. The prediction came from the pattern being familiar rather than from measuring. **Collecting a failure shape makes you expect it where it is not.**

2026-08-31 · AVEL · avel-71 · Nearly raised a corruption alarm about this shared file at 2am. Printing their own entry to the console returned `token <U+FFFD> and for one test` (the codepoint NAMED, not reproduced — quoting the character literally would put a real replacement char in this file and fire the very check that disproved the alarm) — a replacement character mid-paragraph, which on its face is corruption in a file four sessions write to. The file was untouched; the Windows console is cp1252 and mangled U+2014 on the way OUT. **Reading the bytes instead of the rendering was the ten seconds between "verified intact" and a false alarm.** Independently reproduced: 0 U+FFFD, 43 em dashes, strict UTF-8.

2026-08-31 · AVEL · avel-a8 · Edited this file by whole-file read-modify-write seven times while three other sessions held entries in it. Nothing was lost, BY LUCK — any of those writes landing between another session's read and write would have silently reverted their paragraph, and nothing would have looked wrong. `cat >>` cannot do that. Rule added above. The asymmetry is one-sided: appending protects others from you, not you from a whole-file writer.

---

## Patterns (fill in after ~3 slices)

*Once entries accumulate, group them. Recurring shapes are the finding; individual entries are just data.*

| Pattern | Times seen | Agents involved | Mechanical fix? |
|---|---|---|---|
| **A confident, specific claim about the code, never checked against the code** | 6 in one day | avel-a8, avel-96, avel-c2 | **Yes, for half of it — built.** `src/commentSymbols.test.ts` |
| A read of the shared tree treated as current after it expired | 3 | avel-a8, avel-c2, avel-71 | Partly. Ask `HEAD` for historical questions; say WHEN. **No test can date a claim, and urgency suppresses the only check there is.** |
| A check scoped so it cannot see the case it most needs to | 5 | avel-a8, avel-96, avel-c2 | Partly. Ask what the instrument CANNOT see before believing it. |
| A measurement taken before the system had settled | 3 | avel-71, avel-fa | **Yes.** Separate waiting for a system to settle from asserting on its state, and never let them share a budget. |


**Row 1, the six instances.** A comment promised a `min-h` the file never had. A seam comment read "NEUTRAL RATHER THAN ACCENT, deliberately" directly above `var(--color-accent)`. `export/service.ts` said twice that the render assembler did not exist and that its absence was why delivery could not run, while `assembleRenderMission` sat built, unwired and untested. And `assertNever`'s own docstring said to call it in the default branch of any switch over ErrorCode — two sessions tried, and it would have thrown inside the function whose job is turning unknown error codes into readable copy.

The fifth was made while ARGUING FOR the mechanism to catch the other four: the check was justified on the claim that it was "red right now on four stale symbols from tonight", read off a symbol list without opening the files. Three of those four turned out to be good comments naming something deliberately absent.

The sixth is avel-c2's and is the cheapest of the six to have avoided: a class read off a grep line, with the element carrying it INFERRED rather than looked at, then reported as a defect. The disproving evidence was in their own terminal output.

All six were specific, well-phrased and load-bearing. **Specificity is what made them survive**: a vague comment gets checked, a precise one gets believed. The fourth is the worst of the family, because following the codebase's own standing guidance is the behaviour we want.

**The mechanism, and honestly what it does not cover.** Every backticked identifier in a comment must resolve somewhere in the code. Prototyped at 1,594 backticked spans, 415 bare identifiers, 21 resolving nowhere — 5%, a signal rather than noise, and it was red on symbols deleted the same evening. It catches a comment naming a SYMBOL. It cannot catch a comment making a claim about INTENT: it would have caught the `min-h` and the assembler, and would NOT have caught "NEUTRAL RATHER THAN ACCENT" or the `assertNever` docstring. Half the family, mechanically, forever, against four for four missed by people.

**Row 2, and the instance that changes its shape.** Two of the three are inert: a correct read of a file another session had rewritten, and live uncommitted work attributed to the wrong session. The third is tonight's stash alarm, and it is a different animal — accurate when sent, resolved before most people read it. Raised by avel-71:

> Reasons age well, status claims rot — and a RECOVERY INSTRUCTION is a status claim with an action attached, so it rots fastest of all. The diagnosis stays true: twenty-six files were stashed. The instruction built on it — "restore them" — became actively harmful within minutes, because four sessions restoring twenty-six already-restored files is how a scare becomes a loss.

**Every other stale claim recorded here is INERT.** A stale comment misleads one reader who is already reading carefully. A stale recovery instruction recruits several people into doing something destructive, under urgency, which is precisely when nobody re-verifies. Same rot, different blast radius.

The standing prohibitions issued during the incident — no `stash drop`, no `stash clear`, no `reset --hard`, no `checkout -- .` — were protecting against the RECOVERY, not against the original event. That is the tell.

**The mechanism column is uncomfortable here and the discomfort is the finding.** The check is re-verifying before acting, and urgency is the thing that suppresses re-verification. So there is no test to write; the only available defence is procedural, which is what this file calls an `[attestation]`. The nearest thing to a mechanism: **an alarm should carry the command that disproves it**, so the next reader re-runs a check instead of acting on a claim. Tonight's alarm did carry one — `git stash list` — which is why it cost nobody anything. **But that defence is weaker than it reads, and avel-71 found the hole the same night:** the failure is not always "nobody re-ran the check". Sometimes the check runs and the INSTRUMENT lies. They nearly raised a corruption alarm about this file from a disproving command they had already run and misread.

**Row 3, the five instances.** A grep excluding the file being deleted from, which therefore could not see that the file used the symbol internally. A `grep "x" file || echo "missing"`, where `grep` exits 1 for no-match so a wrong search term is indistinguishable from a missing file. And the comment checker's first run, which read the tree it lives in and so resolved every exempted symbol against its own allowlist, reporting all sixteen entries as dead weight.

The fourth is avel-c2's and is the strongest, because it is the only one that is not a mistake anyone made — it is a property of the tool. **`tsc` on a dirty tree cannot see a split between what is committed and what is on disk.** Every file individually type-checks, the whole working tree type-checks, and `HEAD` is still broken. That is not a race and no amount of care avoids it; the instrument's window simply excludes the case. It had already bitten: the `blockedTone` rename landed across files owned by three sessions and broke `main` for four minutes. The defence is to type-check `HEAD` alone before committing a rename that crosses files — **but NOT with `git stash`, and this sentence used to say `git stash`.** In a shared tree `git stash` takes EVERY session's uncommitted work, not just yours. Following this advice as originally written swept 26 files across four sessions; the `pop` then failed on a regenerated `routeTree.gen.ts` and aborted, leaving the tree at `HEAD` looking like nobody had worked all night. **The safe form does not touch the working tree at all: `git worktree add --detach` a scratch checkout of `HEAD` and type-check there.** It cannot sweep anyone, cannot be refused on pop, and cannot leave a clean-looking tree with four sessions' work hidden. **It takes three steps, and this row named only the first — someone has now read "use a worktree" without the rest:**

1. `git worktree add --detach <scratch> HEAD`
2. **Link the dependencies.** `node_modules` is gitignored and lives only at the repo root, so a fresh worktree has no TypeScript and `npx tsc` answers with a global stub. Junction it on Windows (`mklink /J`), symlink on posix.
3. **Unlink BEFORE removing the worktree.** `git worktree remove --force` deletes the directory tree, and a junction left in place is a path into the REAL `node_modules`. Doing these in the other order risks deleting the dependency tree of a five-session repo to check one type error. Remove the link, confirm `tsc --version` still answers, then remove the worktree.
 The check was right and its mechanism was wrong, which is a worse failure than a wrong check, because a correct-sounding procedure gets followed.

The fifth is the soft-delete scanner, and it is the closest sibling to the comment checker: it stripped comments BEFORE looking for its own opt-out marker, while documenting that opt-out as "a sentence someone wrote at the query" — which means a comment. So the escape hatch could not be written the way the check documented it, and the only way to claim it was to put the token in code. **A check whose escape hatch cannot be written as documented is a check people route around instead of using.** Fixed at `softDelete.test.ts:87`.

It was argued that this is a different shape, because what the window excluded was the ESCAPE HATCH rather than the target. It is not, and the reason is instance three: the comment checker's failure was also about its exemption list, not its target. Excluding this one on that ground would require removing that one too. The row is about an instrument's window omitting something it needs, and an exemption mechanism is something it needs.

**Row 4, and why it is not row 3.** avel-96 proposed these four as one row and flagged that the last was different. It is: row 3 is about SCOPE, an instrument whose window excludes the target, and row 4 is about TIME, an instrument reading a system that has not stopped moving. The three timing instances are a value read mid CSS-transition, a navigation and its assertion sharing one timeout budget, and `generate-routes | tsc` chained on one shell line reading a half-written tree. Every fix is the same sentence, which is what makes it a row: poll instead of reading once, give the gate its own budget, run two commands. The `tsc`-on-a-dirty-tree case moved to row 3, where its shape actually belongs.

**Below the bar, watched at two: an instrument that breaks produces a SPECTACULAR result, not a null one.** The comment-symbol probe reporting 415 misses out of 415, and the renderer's `tr_TR` determinism tests passing under both locales because `LANG` and `LC_ALL` never reached node's collator and both sides moved together. Two instances is under this table's three-instance threshold so it does not get a row yet, but the mechanical fix already exists in both places and is cheap: **assert a CONTROL that must hold, so a broken instrument fails loudly instead of returning an impressive number.** Recorded here so the third instance is recognised as the third.

**The question this table answers:** which failures need a *mechanism* rather than a better instruction? Anything appearing three times is not an instruction problem.

---

**A test can stop being satisfiable, not merely stop being right.** Two shell tests went red when the sidebar moved from `app-bg` to `app-panel` by operator ruling. The obvious repair is repointing the assertion at the new token — and for one test that was the whole fix. For the other it was impossible: it asserted "the switcher's fill must differ from the sidebar's", and light `app-panel` and light `app-raised` are both `#ffffff`. No token substitution passes. The requirement had been met a different way in the meantime — the control is transparent at rest and recesses on contact — and the test was still measuring the replaced mechanism.

The tell is a red test where every candidate value fails, not just the one you pinned. That is the suite reporting that the *design* moved, and the repair is to find out what carries the requirement now. Repointing tokens until it goes green would have deleted the check while leaving something green in its place.

Three stale claims fell out of the same reversal, all of them status rather than reason: two of three stacked paragraphs above the sidebar's `className` still said it sat on `app-bg`, and `--color-sidebar` in `tokens.css` mapped to `app-bg` with a comment asserting it. Nothing consumed `bg-sidebar`, which is exactly why it was free to be wrong.
