# Decision Log

Append-only. Every agent on this mission writes here. Nothing in this
file is edited or removed once written, including entries that turned
out to be wrong. A superseded decision is corrected by a later entry
that names it, never by a rewrite.

No timestamps. Ordering is the order of entries, and the sprint and
phase on each entry place it.

## Entry format

Copy this shape. One decision per entry.

```
### <sequence> · <agent-slug> · sprint <n> · phase <A|B|C|D>

Decision
  What was decided, in one sentence, as a statement rather than an
  intention.

Context
  What forced the decision. The constraint, the ambiguity, or the
  finding that made a choice necessary.

Alternatives
  What else was considered and why it was not taken. An entry with no
  alternatives is a decision that did not need making.

Consequence
  What is now true that was not true before, and what it costs.

Supersedes
  The sequence number of an earlier entry this replaces, or none.
```

## Entries

### 0001 · operator · sprint 1 · phase A

Decision
  The cut for this mission is vertical.

Context
  The connected repository organises `apps/api/src/modules/` and
  `apps/web/src/components/features/` by feature, not by layer. The
  cut is read from that structure.

Alternatives
  A horizontal cut was not considered. The cut is derived from the
  directory structure rather than chosen, so there was no decision to
  make once the structure was read.

Consequence
  Agents are scoped to features rather than to layers. The
  transactions agent owns every layer of one feature, which is why
  its writable set spans both the api and web applications.

Supersedes
  none
