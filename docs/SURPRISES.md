# Surprises

*One line every time an agent does something you didn't predict. Good or bad.*

**Why this file exists.** AVEL's roster, wave sequencing, and file boundaries are hypotheses. This is the only place they get tested against reality. It also becomes the anti-pattern library and, eventually, the seed data for KnowledgeEntry — which is why it must be written *during* the mission, not reconstructed after.

**Rules**
- Write it the moment it happens. Reconstruction is fiction.
- One line. If it needs a paragraph, it's a finding — put it in the mission log instead.
- Record good surprises too. "Kel caught a schema mismatch nobody asked it to look for" is as informative as a failure.
- Never delete an entry. Strike through if superseded.

**Format:** `YYYY-MM-DD · slice · agent · what happened`

---

## Slice 0 — foundation

<!-- example, delete when the first real entry lands
2026-08-19 · S0 · Atlas · Wrote a repository method that queried across two modules directly — the boundary rule was in CLAUDE.md and it went around it anyway.
2026-08-19 · S0 · Iyo · Test suite came back green with zero assertions in three of eleven specs.
-->

---

## AVEL's own build — 2026-08-29

*Three AVEL sessions building the export engine. Not a CounselOS slice; the section headings below are that client's. Whether this file covers AVEL working on itself is an open structural question — the content is exactly what the file asks for, so it is recorded here rather than discarded for want of a heading.*

2026-08-29 · AVEL · avel-a8 · Found the renderer's tr_TR determinism tests prove nothing on Windows — LANG and LC_ALL never reach node's collator, so both children resolve en-US and the two sides move together.
2026-08-29 · AVEL · avel-96 · The determinism gate passed for months while comparing a wrong number against itself; the package hash included manifest.json, which the manifest's own hash excludes.
2026-08-29 · AVEL · avel-71 · Two error recoveries offered "Open connections" and navigated to /login — invisible for weeks because nothing rendered the recovery, and a defect the moment something did.
2026-08-29 · AVEL · avel-71 · A running dev server's route generator silently overwrote a committed 339-line route file with a 9-line scaffold stub that still typechecked and still served.
2026-08-29 · AVEL · avel-96 · TaskStop kills the wrapper, not the vite child — reported a server stopped while it kept serving, then told another session the port was free.
2026-08-29 · AVEL · avel-a8 · Refused to write an enum four times from vocabularies that existed, on the grounds that a value list you cannot read is a guess; three of the four later proved to have a fourth value the template did not list.
2026-08-29 · AVEL · avel-a8 · A query that is RIGHT BY ACCIDENT in the half people copy is worse than one wrong in both halves — `listMissions` filtered the mission and not the client it joined, and every service copied from it inherited the correct half without anyone re-deriving the other.
2026-08-29 · AVEL · all three · THE RECURRING ONE: a check that is real, and answers a narrower question than the claim it is about to support. "My log says 3000" ≠ "the port is mine". "I stopped it" ≠ "it is stopped". "The selector resolved" ≠ "the page is done". Each was caught only by going to the source before sending the message.

---

## Slice 1

---

## Slice 2

---

## Patterns (fill in after ~3 slices)

*Once entries accumulate, group them. Recurring shapes are the finding; individual entries are just data.*

| Pattern | Times seen | Agents involved | Mechanical fix? |
|---|---|---|---|
| | | | |

**The question this table answers:** which failures need a *mechanism* rather than a better instruction? Anything appearing three times is not an instruction problem.
