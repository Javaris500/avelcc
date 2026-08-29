# Report: <agent-slug> — <phase>

Copy this file. Do not edit it in place.

## Dispatch

The dispatch this closes, by path.

## Status

<complete | partial | blocked>

Partial and blocked both require the remaining work named below. A
report that says complete while work remains is the failure this
process exists to catch.

## What was built

Paths written, grouped by deliverable from the dispatch. Every
deliverable in the dispatch appears here, including the ones not
done, marked as not done.

## Evidence

Commands run and their result. Paste the summary line, not the whole
log.

  <command>
  <result>

A passing suite means the code ran. It does not mean the tests
checked anything. State what the assertions cover.

## Not done

Anything in the dispatch that did not ship, and why. Empty only when
the dispatch shipped whole.

## Blockers filed

Findings filed during this dispatch, by path. Empty is a valid answer
and a suspicious one on a first dispatch.

## Assumptions

Decisions made where the dispatch was silent. Each one is a place the
next agent may be surprised.

## For the next agent

What the agent picking this up needs and would not find by reading
the code.
