# UI PLAN

*Shell, theme, clients, chat.*

**Status: `[specced]` — design decided, nothing built.** Claims about the current
code are marked `[built]` and were verified by reading it on 2026-08-30. Claims
about how an operator will behave are marked `[hypothesis]`. They are untested.
Zero operators other than the author have used this interface.

A handoff document for the session that will do this work. Every ruling carries
the reason that produced it, so the next person can overturn one on evidence.

`DECISIONS-V2.md` owns rationale. `STATE.md` owns build status.
`DATA-CONTRACTS-V2.md` owns entity shapes. Where this file restates any of them,
they win.

Decisions already made:

| | Decision |
|---|---|
| 1 | Chat replaces home. `/` is a conversation with the Command Center agent **when signed in**. Signed out keeps the front door: a conversation with an agent nobody is authenticated to is a control that cannot work, offered as the first screen. |
| 2 | Chat is built on the Vercel AI SDK and its UI component layer. |
| 3 | Client detail uses sections on one scrolling page. No tabs. |
| 4 | The operator reads "Request". `intake` stays the internal name. |
| 5 | Theme is a manual toggle. It does not follow `prefers-color-scheme`. |
| 6 | One solid dark and one solid light. The intermediate surfaces go. |
| 7 | The sidebar takes the reference shape: app background, active-item underglow, time-grouped recents. |
| 8 | The composer takes the morphing-control shape. Its mode pill is the agent's permission gate. |
| 9 | **No rules anywhere in the shell.** Panes separate by tone and gap. Operator ruling 2026-08-30. |
| 10 | **Clients is a three-pane layout**: nav, table, detail panel. The table is the second pane. Operator ruling 2026-08-30. |
| 11 | **Header buttons are two-tier**: core actions constant on every page, module actions change per page. Operator ruling 2026-08-30. |

---

## 1 · Theme

Measured in `L*`, CIE lightness. It is perceptually uniform, so a `+8` step
looks like a `+8` step anywhere on the scale. These are the values in
`src/styles/patch.css` today. `[built]`

### Dark climbs too far

```
app-bg      #1a1d23   L* 10.7
app-panel   #2a2e36   L* 18.9   +8.2
app-raised  #393e46   L* 26.0   +7.2
app-float   #4a5058   L* 33.8   +7.7
                              ────────
             background → float:  23.1
```

The ramp is even. The comment in `patch.css` is proud of that, and evenness was
never the problem. The top of the ramp is too high for a dark UI. A surface at
`L* 33.8` is a mid-grey, and three of them stack in a mission panel. That is why
the screen reads washed out. A solid dark theme keeps the whole climb inside
roughly `12 L*`.

### Light is non-monotonic

```
app-bg      #eaedf0   L* 93.6
app-raised  #eeeeee   L* 94.1   <- 0.5 above the background
app-panel   #ffffff   L* 100.0  <- the "panel" is lighter than the "raised"
```

A raised surface is darker than the panel it sits on. `app-raised` is within
half a point of the background. The ordering is broken. That is why light mode
has never looked settled. `[built]`

The `CORRECTION 5` comment in `patch.css` records how it got there. Light was
flat white. That failed. `#eeeeee` was taken from the reference, and the result
inverted the ramp.

### The ruling that fixes both

Pick one elevation mechanism per theme. Stop treating the sidebar as elevated.

Dark climbs lightness and carries borders. The lightness climb is redundant, and
it is the half doing the damage. Light climbs lightness from a base with no
headroom left.

> **The sidebar is a different plane. It is not a raised one.**
> It sits at `app-bg` in both themes.

That is the direct answer to "the sidebar is too light". `sidebar.tsx:149`
paints it `bg-app-panel`, a surface meant for cards. That one class is most of
the complaint. `[built]`

The same ruling rescues light mode. Flat white failed because a white control
sat on a white sidebar, with a 1px hairline doing all the work. Put the sidebar
on grey and a white control inside it reads on its own. No hairline is required,
and panel, raised and float can share a value honestly.

### Proposed values

**Dark.** Elevation by a small lightness step plus the existing border:

```
app-recessed  #111317   L*  5.8    wells, inputs, code blocks
app-bg        #16181d   L*  8.2    desktop mat AND SIDEBAR
app-panel     #1c1f25   L* 11.7    cards, mission panels
app-raised    #23272e   L* 15.5    hover, active row, controls
app-float     #2a2f37   L* 19.2    popover, dropdown, modal
                                ─────────
                 background → float:  11.0   (was 23.1)
```

**Light.** Elevation by border and shadow. The background drops to make room:

```
app-recessed  #dcdfe5   L* 88.8    wells, inputs
app-bg        #e8eaee   L* 92.7    desktop mat AND SIDEBAR
app-panel     #ffffff   L* 100.0   cards
app-raised    #ffffff   L* 100.0   + elevation-border-raised + shadow-e2
app-float     #ffffff   L* 100.0   + elevation-border-raised + shadow-e3
```

Both are monotonic. Nothing above ever goes darker than what it sits on.

### The change reaches further than the five tokens

`tokens.css:169-182` maps the shadcn alias layer onto these same tokens.
`--color-background` resolves to `var(--color-app-panel)`, `--color-popover` to
`var(--color-app-float)`, and the block is re-declared in `.light` at
`:206-221`. `[built]`

Every shadcn-derived component in `src/ui/` inherits the ramp, and so will
everything AI Elements brings in (section 7). Fix the ramp once and the chat is
fixed with it.

### Rules for whoever implements this

- **Declare every alias in both `:root` and `.light`.** `patch.css` says so in
  its header. An alias present in one block freezes at the dark value, and the
  bug is invisible in whichever theme you were testing. `CORRECTION 4` cost
  every border in light mode this way. `[built]`
- **Put `.light` on the shell wrapper.** Never on `<html>`. The landing page
  shares this stylesheet and must not follow the app's theme. `shell.tsx` does
  this correctly today. Do not "fix" it. `[built]`
- **Re-check contrast afterwards.** Text tokens were tuned against the old
  surfaces. Moving every surface by 7 to 14 `L*` changes every ratio on screen.
  `text-subtle` on `app-panel` is the pair most likely to fall under 4.5:1.
- **Re-derive `--color-skeleton`.** It is pinned at `#333842`, `L* 22`. That
  lands brighter than the new `app-float` at `L* 19.2`, which would make a
  loading skeleton the brightest thing on the page. Derive it from `app-raised`.
- **Re-derive the elevation borders.** A border tuned to separate `#2a2e36` from
  `#393e46` is doing a different job between `#1c1f25` and `#23272e`. In dark
  the border now carries more of the load.

---

## 2 · The shell header

The complaint is a divider with nothing on it. The cause is two controls that do
nothing.

### What is up there today

`src/modules/shell/topbar.tsx` renders three things. `[built]`

1. A status pill that also contains the breadcrumb. The page name and the
   run-state dot are fused into one element.
2. An "All gates" dropdown. Its selection lives in `useState` inside the TopBar.
   It filters nothing.
3. A "github_pr" dropdown. Its selection lives in `useState` inside the TopBar.
   It targets nothing.

Both dropdowns are global chrome carrying page-specific data. A "Filter by gate"
control sits above the Clients page, the Skills catalog and Account settings,
where the concept does not exist.

The file's own doc comment states the principle correctly:

> *"Every control opens something. A chevron that opens nothing is the product
> telling the operator a menu exists when it does not."*

It then stops one level short. A menu that opens and changes nothing is the same
failure one level deeper. For a non-technical operator there is no way to
discover it was never wired. `[hypothesis]`

### The ruling

> **The shell header carries no page-specific data controls.**

Gate filtering belongs on mission detail. Delivery target belongs on the export
screen. They move to the pages that own the data, or they are deleted until
those pages exist.

With both pills gone, the strip holds a status pill and a horizontal rule. That
is the original complaint. So make it a header.

### What the header carries

```
+--------------------------------------------------------------------------+
|  Clients > Northwind                          [ o idle ]  [ New request ] |
|  3 engagements · 1 open request · last delivery 4 days ago                |
+--------------------------------------------------------------------------+
```

| Slot | Owner | Contents |
|---|---|---|
| Title | route | A real `<h1>`. The page's name in plain words. |
| Subtitle | route, optional | One line of orienting context. Counts, status, last activity. |
| Breadcrumb | route | Only where nesting is real, as in `Clients > Northwind`. A bare `Missions >` is noise. |
| Run state | shell | The live dot, separated from the breadcrumb. "Where am I" and "is something running" are different questions. One pill cannot answer both. |
| Primary action | route | Exactly one. `New request`, `Deliver`, `Add agent`. Empty is a valid state, and the header must not reserve space for it. |
| Overflow | route, optional | A `...` menu for secondary actions. Rendered only when there are some. |

Moving the `h1` into the header is what stops the strip reading as a divider.
Today every page prints its own title inside the content, which leaves the strip
above it decorative. `[built]`

### Ruling: no rules anywhere in the shell

Remove every divider. `border-b` on the header, `border-r` on the sidebar,
`border-t` on the nav scroller. Panes separate by TONE and GAP.

The sidebar sits at `app-bg`. Content sits in `app-panel` cards with a gap
between them and the frame. The gap is the separator, and the tone step does the
rest. A hairline is what you reach for when two surfaces are the same colour,
and after section 1 they are not.

Where a boundary still needs marking after tone and gap, use `shadow-e1`.

**A rule is a line drawn BETWEEN two things. A border AROUND one thing is not a
rule, it is half of the elevation mechanism**, and it stays. `patch.css` says so
directly: a raised surface gets a stronger border, not just a shadow.

That distinction is load-bearing in light, not cosmetic. `app-panel`,
`app-raised` and `app-float` are ALL `#ffffff` there — section 1 chose that
deliberately, because light has no headroom upward and elevates by border and
shadow instead. Strip container borders in light and a white card goes invisible
on a white surface with only `shadow-e1` left. Dark survives it because the ramp
has real steps; light does not. `[built]`

So: dividers go, container and control borders stay. Removing the second group
requires a light-mode elevation answer first, and there isn't one. Boundary
drawn by avel-bb, verified here.

The app window's own outer frame also stays. It is the edge against the mat, not
a rule between panes, and without it the rounded corners have nothing to
describe them against.

### Ruling: header buttons are two-tier

The earlier "exactly one primary action" is too thin. The operator asked for
per-module buttons that keep a core set.

**CORE, on every page, right-aligned, never moving.** Position is the whole
point: these are found by muscle memory, so they cannot reorder between pages.
Command palette, theme, help, account.

**MODULE, left of the core group, changes per page.** The page's primary action,
plus an overflow `...` when there is a second and third.

| Page | Module primary | Module secondary |
|---|---|---|
| Home (chat) | New chat | History |
| Missions | New mission | Filter, Export |
| Clients | New client | Import, Filter |
| Client detail | New request | Share, `...` |
| Agent templates | New template | Filter |
| Skills | New skill | Import from source |
| Sources | New source | Sync |
| Presets | New preset | — |
| Playbooks | New playbook | — |
| Activity | — | Filter, Export |
| Settings | — | — |

A page with no module action renders none. The core group does not shift left to
fill the space, because a control that moves is a control that has to be found
again.

### Components the shell needs

**Exists and stays.** `src/ui/` holds `badge`, `button`, `dialog`,
`dropdown-menu`, `input`, `page-empty`, `skeleton`, `states`, `surface` and
`tooltip`. Ten primitives. `[built]`

**Exists and stays put.** The sidebar footer holds theme, collapse and account.
That follows a stated principle worth keeping: per-operator preferences live
with the operator, and per-view controls live with the view. The theme toggle
does not move to the header.

**New.** Needed before anything else in this document can be built:

| Component | Why it does not exist yet |
|---|---|
| `PageHeader` | The slots above. Every route prints its own title inside the content. |
| `ActionSlot` | Lets a route hand the shell its one primary action without the shell importing route code. |
| `SectionCard` | Client detail is sections. There is no card with a title, a count, an action and a body. |
| `SectionRail` | In-page nav for the detail panel: a masthead and nine numbered sections, ten blocks rendered. Without it, "sections rather than tabs" becomes an endless scroll. |
| `DefinitionList` | Label and value pairs. Every detail view needs it. There are none today. |
| `DataTable` | The clients and missions lists are hand-rolled. Sorting, density and empty state should be decided once. |
| `Timeline` | The telemetry tables are a list of events, and there is no primitive for one. |
| `ConfirmAction` | Irreversible actions have no shared treatment. Approving a request materialises a Mission. |
| `MetricStat` | A number with a label and a trend. Used by the client masthead and the chat status strip. It must accept `null`, because a metric with no query behind it is a state rather than a zero. |

**TWO ENTRIES WERE WRONG AND ARE REMOVED.** An earlier draft listed `EmptyState`
and `StatusChip` as new. Neither is. `src/ui/states.tsx:10` exports `EmptyState`
beside `ErrorState`, and this section's own inventory two paragraphs above counts
`states` among the ten primitives, so the draft contradicted itself. `StatusChip`
was justified with "badge is presentational", which is not what `badge.tsx:65`
contains: `StatusBadge` already carries a closed `tone` set and a glyph per tone,
so state survives without colour. A second component beside it would be a second
colour vocabulary for one job. Found by avel-bb, verified here. `[built]`

---

## 3 · Ten ways to polish the shell

Each item is grounded in code that was read. Ordered by impact over effort.

### 1. Kill the flash of the wrong theme

`use-theme.ts` starts at `dark` and corrects in `useEffect`. `use-collapsed.ts`
does the same from `false`. There is no blocking script in `__root.tsx`. `[built]`

An operator on light mode gets a dark flash on every load. An operator with a
collapsed sidebar watches it expand and snap shut.

The hooks are right to defer. Reading `localStorage` during render is a genuine
SSR mismatch, and their comments say so. The fix is a small inline script in the
document head that sets the class before first paint. The hooks continue to own
the state afterwards.

This is the most visible item in the list. It happens on every load, on every
page.

### 2. Honour `prefers-reduced-motion`

A grep across `src/` returns zero matches for `prefers-reduced-motion` or
`motion-reduce`. `[built]`

Meanwhile the live dot runs `animate-pulse` indefinitely, dropdown content
animates on open, and chevrons transition on `--duration-micro`.

One block in `patch.css` collapsing durations under the media query covers
nearly all of it. The chat makes this more pressing. Streaming text is motion,
and an auto-scrolling conversation is a lot of motion.

### 3. Resolve the focus ring and give it an offset

Three problems in one token. `[built]`

- `tokens.css:56` declares `--color-focus-ring: #0092ca` and marks it
  `[INVENTED]`. It is the last unsourced colour in the system.
- `patch.css:343` sets `*:focus-visible { outline: 2px solid ... }` with no
  `outline-offset`. On a rounded pill that already has a border, the ring lands
  on the border and reads as a colour change.
- The app window is `overflow-hidden` so its rounded corners clip. A focus ring
  on the leftmost sidebar item is clipped by the window edge.

Derive the colour from `--color-accent`, add `outline-offset: 2px`, and give the
sidebar enough inline padding for a ring to live in.

### 4. Bind ⌘K

The sidebar binds a bare `F` key for search, guarded by `isTypingTarget`. The
guard is careful and the shortcut works. `[built]`

A bare letter is not a convention anyone arrives with. `⌘K` and `Ctrl+K` are
what every other tool has trained this operator on. `[hypothesis]`

Worth going further and making it a command palette. Navigate, run an action,
jump to a client. It becomes the "I know what I want but not where it lives"
escape hatch, and it shares its whole backend with the chat.

### 5. Constrain content width inside `main`

The app window caps at `--frame-max`, 1440px. `main` is `flex-1 overflow-y-auto
p-6` with no max-width of its own. `[built]`

On a wide display a `DefinitionList` or a paragraph of brief text stretches past
1300px, roughly triple a comfortable measure. Give `main` a per-view content
width. Around `72ch` for prose and forms, full-bleed for tables and the
blast-radius diff. The chat needs this most. A streaming response at 1300px wide
is unreadable.

### 6. Tell the operator the content scrolls

`main` is `overflow-y-auto` under a fixed header, with no affordance that
content continues. The sidebar already solves this for itself by tracking
`navScrolled`. The same idea is absent from the main pane. `[built]`

Add a scroll shadow under the header, and sticky `SectionCard` titles on the
client page, so scrolling through ten sections never loses the label of the one
you are in.

### 7. Give routes a pending state

`skeleton.tsx` exists and nothing uses it at route level. TanStack Router offers
`defaultPendingComponent` for this. `[built]`

Today a slow Neon query is indistinguishable from a frozen app. Decide it once
in the router config: a pending delay of around 200ms so fast navigations do not
flash, a minimum display time so the skeleton does not strobe, and one skeleton
shape per layout family.

### 8. Make the frame respond to height

The mat is `p-(--frame-mat)` at 26px, and the window is `100vh - 52px`.
`max-md:p-3` handles narrow. Nothing handles short. `[built]`

On a 13-inch laptop with a bookmarks bar, 52px of vertical decoration is space
the mission panels needed. Add a short-viewport media query that drops the mat
the way the narrow one does.

### 9. Stop the header height jumping

The header is `flex flex-wrap items-center gap-3`. At intermediate widths the
right-hand controls wrap to a second line and the header doubles in height,
shifting all content down. `[built]`

Removing the dead controls makes this much less likely. Title, subtitle and
primary action can still collide on a narrow laptop. Truncate the title with an
ellipsis and collapse the action into the overflow menu instead of wrapping.

### 10. Fill the holes in the shadcn alias layer

`tokens.css:169` maps most of the shadcn vocabulary onto AVEL tokens in both
themes. Three groups are absent, verified by grep: `[built]`

- `--color-card` and `--color-card-foreground`
- `--color-sidebar-*`, the whole shadcn sidebar block
- `--color-chart-1` through `--color-chart-5`

A component using `bg-card` gets no background. Tailwind v4 emits nothing for an
undefined utility, so it fails silently, and `check-tokens.mjs` does not catch
it because it only flags hex literals and arbitrary values. This is a trap laid
for section 7, where AI Elements arrives with those class names. Close it before
installing anything.

While in there, add `color-scheme: dark` and `light` on the shell wrapper, so
native scrollbars, form controls and autofill follow the theme.

---

## 4 · Nav

### A count to fix first

`nav.ts` holds 16 `label:` fields. Three are group labels, so there are **13 nav
items**, each with a `to:`. `[built]`

`shell.tsx:86` says "Twelve nav items sit before the content in tab order." That
comment is wrong, and an earlier draft of this document repeated it. Fix the
comment in the same commit as the nav change.

### The groups today

**Work** holds Home, Missions, Clients, Intake. **Library** holds Agent
templates, Skills, Sources, Presets, Playbooks. **System** holds Activity,
Repositories, Connections, Account. Four, five and four. `[built]`

### Intake is a verb in a list of nouns

Everything else is a thing you browse. Intake is how a mission gets born, and it
is born out of a client relationship. It belongs inside a client.

```
Work        Home            -> the chat        (section 8)
            Missions
            Clients         -> requests live inside a client   (section 5)

Library     Agent templates
            Skills
            Sources
            Presets
            Playbooks

System      Activity
            Repositories
            Connections
            Account
```

Twelve items. The freed slot is left empty. Fewer nav items is the direction,
and both the chat and the command palette can reach anything the nav can.

`nav-tree.tsx:95` already sets `aria-current="page"` on the active item, so the
accessibility side of this change is handled. `[built]`

---

## 5 · Clients

### What exists

`src/routes/_app/clients.tsx` was a `PageEmpty` placeholder with no query and no
data, and so was `/intake`. Neither was a list. An earlier draft of this section
called the first one "a list", which read as though there were something to
rework. There was not. Corrected by avel-c2. `[built]`

The intake table landed on 2026-08-30 as migrations `0016` and `0017`, with
`src/contract/intake.ts` and an `intake` route group in the contract barrel.
Neither migration is applied to Neon, so `schemaSync.test.ts` and
`triggers.test.ts` both fail on `intakes` until they are. `[built]`

### Correction: every section is a two-hop read

An earlier draft of this section assumed a client detail page reads from a
client. It does not. `clientId` is a column in exactly one place,
`schema.ts:104`, on `engagements`. Missions, connections, agent templates,
findings, intakes, blockers and cost entries all carry `engagementId`. `[built]`

Found by avel-c2, verified by avel-a8 and verified again here. It changes three
things.

**Engagement is the spine of the page.** It is not one section among nine.
Everything below the masthead joins `client -> engagements -> the thing`.

**The masthead metrics aggregate over a client's engagements.** A client with no
engagement has no numbers rather than zeros. Those are different states and the
page says which one it is in.

**`New request` cannot work as a bare header action.** Intake is
`engagement_id FK -> Engagement`. A client with no engagement has nothing to
attach a request to, and a client with three does not tell the button which one.

### Ruling: `New request` opens an engagement picker

Disabling the button with a reason answers the zero-engagement case and says
nothing about the multi-engagement case, which is the more common one. The
picker step is not optional, so it is the flow rather than an exception to it.

- **One engagement.** Preselected, named, changeable.
- **Several.** Pick one. This is the case a disabled button never addresses.
- **None.** The picker says the client has no engagement, that a request needs
  one, and offers to create it as a labelled step. The flow still ends in a
  request, so `New request` keeps its promise.

`POST /intakes` requires `engagementId` under every branch, so none of this is a
contract change. `[built]`

The operator can overturn this. The interim behaviour avel-c2 built is correct
for the zero case and needs extending rather than replacing.

### The shape to reuse

> **`request -> mission` has the same shape as `preview -> export`.**
> Review what will happen, then commit to something that materialises.

That idiom is built, tested and understood in the export pre-flight screen.
Reuse it. Approval creates a Mission, which is a creation event, and it should
carry the same weight as a delivery: here is what this produces, here is what
could go wrong, here is one button.

### Why this is more than two sections

A client is the one place in the product where every other entity converges.
Missions, engagements, exports, roster entries, repositories, findings, blockers
and cost all point back at one. A client page showing a name and a list of
requests throws away the only view that can answer "what is actually happening
with these people", which is the question the operator opens the app to ask.
`[hypothesis]`

### Ruling: three panes, and the second one is a table

Operator ruling, 2026-08-30, with a reference. Clients is **nav, table, detail
panel**, not a list that navigates to a page.

```
+--------+--------------------------------+---------------------------+
|  nav   |  CLIENTS  (the second pane)    |  DETAIL  (the third)      |
|        |  Filters: [Status] [Owner] [+] |  Northwind                |
|  Home  |  ----------------------------  |  [Message] [New request]  |
|  Miss. |  Account      Lead      State  |                           |
| >Clien.|  Northwind    J. Lee    Active |  Legal name   ...         |
|  ...   |  Acme         S. Davis  Active |  Since        ...         |
|        |  Bridgewater  J. Lee    Paused |  Engagements  3           |
|        |                                |  ---------------------    |
|        |  Total: 12 clients             |  Overview cards, then     |
|        |                                |  the nine sections        |
+--------+--------------------------------+---------------------------+
```

**The nine sections survive.** They move into the third pane and scroll there,
under a masthead that becomes the panel header. Nothing in the section table
below is discarded; it changes where it lives.

**The second pane is a real table.** Sortable columns, a filter row above it,
and a footer aggregate. A client with a blocked mission looks different in the
row, before anything is clicked.

**Selection drives the third pane.** The URL carries the selected client, so a
selected client is linkable and survives a reload.

### Three section states, not two

Sections in the detail panel always render. An absent section looks the same as
one you scrolled past. But "empty" is two different facts and they must not
share a treatment:

| State | Means | Why it is distinct |
|---|---|---|
| `not-built` | No query exists behind this section. | Rule 7. |
| `empty` | We asked and there is nothing. | The operator's problem to act on. |
| `populated` | We asked and here it is. | |

A section printing "No deliveries yet" when no query exists is worse than one
saying it is unbuilt, because it is indistinguishable from a working section
reporting a true zero. Split by avel-c2; `SectionCard` carries the distinction so
it is not re-decided at nine call sites. It is the same ruling as `MetricStat`
taking `null`, one level up.

```
+- HEADER --------------------------------------------------------------+
|  Clients > Northwind                                  [ New request ]  |
|  Active · 3 engagements · 1 open request · last delivery 4 days ago    |
+------------------------------------------------------------------------+
| RAIL     |  MASTHEAD                                                   |
| Overview |  [ 3 missions ] [ 1 blocked ] [ 12 deliveries ] [ $1.2k ]   |
| Requests |  Who they are. One paragraph. Contacts, since, timezone.    |
| Engage.. |                                                             |
| Missions |  1 · REQUESTS            open first, then decided           |
| Deliver. |  2 · ENGAGEMENTS         contracted work -> its missions    |
| Roster   |  3 · MISSIONS            flattened across engagements       |
| Repos    |  4 · DELIVERIES          what shipped, where, when          |
| Brief    |  5 · ROSTER              which agents work this client      |
| Cost     |  6 · REPOSITORIES        targets + per-repo last delivery   |
| Activity |  7 · BRIEF & DOCUMENTS   the source material                |
|          |  8 · COST                from cost_entries                  |
|          |  9 · ACTIVITY            the append-only timeline           |
+------------------------------------------------------------------------+
```

| # | Section | Contents | Backed by |
|---|---|---|---|
| — | Masthead | Four `MetricStat`s, the one-paragraph brief, contacts, a `DefinitionList` of key facts. Health signals surface here, so a blocked mission is visible without scrolling. | `clients`, aggregates |
| 1 | Requests | Open first, then decided, then rejected. Each row shows what was asked, the derived cut, the suggested preset, and age. This is the absorbed intake. Primary action `New request`. | intake table *(to build)* |
| 2 | Engagements | The contracted work. Each expands to its missions inline. | `engagements` |
| 3 | Missions | Flattened across engagements. "Show me the mission" is what the operator wants. Filter by status, gate state per row. | `missions` |
| 4 | Deliveries | Export history: target, branch, PR link, package hash, when. The record of what shipped. | `exports` |
| 5 | Roster | Which agent templates have worked this client, and on what. Links back to the catalog. | `roster_entries`, `agent_templates` |
| 6 | Repositories | Connection targets, per-repo last-delivery status, whether credentials resolve. | `connections` |
| 7 | Brief & documents | The source material a mission brief is built from. | `missions.brief` |
| 8 | Cost | Effort and spend. | `cost_entries` |
| 9 | Activity | One `Timeline` merging dispatches, completions, findings and blockers. Append-only, so it is a log and needs no edit affordance. | telemetry tables |

**One write and nine reads.** Requests is the only section on the page with a
write path at all, because approval materialises a Mission. Sections 2 through 9
are exactly as read-only as 5 through 9 — an earlier draft called out the second
group as "deliberately read-only in the first cut", which implied the first group
had write paths someone would later go looking for. It does not. Corrected by
avel-c2.

### The clients list needs work too

It is a list with no opinions. It needs sortable columns for name, status, open
requests, active missions and last activity. It needs a status filter, a density
control and a real empty state. Rows should make the state of a client visible
before you click. A client with a blocked mission should look different in the
list.

### The request review screen

Modelled on export pre-flight:

| Region | Contents |
|---|---|
| What was asked | The raw request as written. Always visible, never behind a disclosure. |
| What we derived | The derived cut and its evidence. The evidence is the point. It makes an automated decision reviewable. |
| What we suggest | The suggested preset, with the roster it would produce, expanded. |
| What this will create | The Mission approval materialises. Named, typed, with its playbook and gates. |
| Decision | Approve, Revise, Reject. `Approve` is the only primary, and it goes through `ConfirmAction`. |

### Views needed

1. **Clients list.** Exists. Needs header, table and state work.
2. **Client detail.** New. Masthead and nine sections.
3. **Request review.** New. Replaces `/intake`.
4. **New request.** A form, reachable from the client header and from the chat.
5. **Engagement detail.** A section anchor. Make it a route only when it needs
   its own URL.
6. **Delivery detail.** Links out to the existing export screens rather than
   duplicating them.

---

## 6 · What the chat is built on

Nothing AI-related is installed today. `package.json` has no `ai`, no
`@ai-sdk/*`, and no provider package. `[built]`

Everything in this section is new dependency surface. It is the largest addition
the project has taken on since Drizzle.

To add:

```
ai                 the core SDK: streamText, tool, convertToModelMessages
@ai-sdk/react      the useChat hook
@ai-sdk/anthropic  the provider
```

### The server route

A normal TanStack Start file route. It must be wrapped in `withMethodGuard`.
`method-guard.test.ts` scans `src/routes/api/` from the directory listing, so a
new route is covered the moment it exists and will fail the suite if it is not
wrapped. That is the mechanism working as designed. Do not special-case around
it. `[built]`

```ts
// src/routes/api/chat.ts
export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: withMethodGuard({
      POST: async ({ request }) => {
        const { messages }: { messages: UIMessage[] } = await request.json();
        const result = streamText({
          // Model is NOT decided. See section 14 — model choice and key
          // location are open, and are the same question as `credential_ref`.
          model: MODEL,
          messages: await convertToModelMessages(messages),
          tools: { /* below */ },
        });
        return result.toUIMessageStreamResponse();
      },
    }),
  },
});
```

### The client

```ts
const { messages, sendMessage, status, stop, regenerate, error } = useChat({
  transport: new DefaultChatTransport({ api: "/api/chat" }),
});
```

`status` is `'submitted' | 'streaming' | 'ready' | 'error'`. Four states, which
maps onto the four-state discipline `Surface` already enforces. `stop()` and
`regenerate()` both need real buttons. A stream the operator cannot cancel is a
hang.

### The one API fact that will bite

**Render `message.parts`.** Not `message.content`.

A `UIMessage` is `{ id, role, parts[], metadata? }`. The parts array carries
`text`, `reasoning`, `file`, `source-url`, `source-document`, and tool call and
result parts. Every pre-v5 example maps over `content` and will produce an empty
conversation here.

That parts array is where the value is. A tool part is how the agent's database
read becomes a rendered mission card instead of a paragraph of prose about a
mission.

### Tools

Declared with zod, already a dependency and already the contract vocabulary. The
first set is read-only and maps onto services that exist:

| Tool | Backed by |
|---|---|
| `listMissions`, `getMission` | `mission/service.ts` |
| `getMissionRoster` | `getMissionRoster` |
| `whatIsBlocking` | `blockers`, gate state |
| `listClients`, `getClient` | client service |
| `recentDeliveries` | `exports` |

Read-only is the whole first cut and is worth shipping alone. A chat that can
approve a request needs the same `ConfirmAction` gate the screen has, and a
confirmation that round-trips through the UI rather than living in the model's
judgement. Write tools do not ride along on the first PR.

The rule from section 12 applies here with full force. Never show a control that
does not work. A tool advertised in the system prompt and not implemented is the
same failure as the gate dropdown, except the model will invent plausible output
for it.

---

## 7 · AI Elements

AI Elements is Vercel's component layer for AI interfaces, built on shadcn/ui.
It is copy-in source. It is not an npm package. Installed per component:

```
npx ai-elements@latest add conversation message prompt-input response
```

**It cannot be installed yet.** Its components import from `ai`, which is not in
`package.json` and not in `node_modules`. A paste would not typecheck, so there
is no conversion pass to budget until the SDK lands. Verified by avel-bb against
both, not against the doc. The nine shapes were hand-built against AVEL tokens
instead and swap to the real components when `ai` arrives. `[built]`

It offers far more than the chatbot set: code components, voice, and a workflow
canvas. Take almost none of it. The first cut needs `Conversation`, `Message`,
`PromptInput`, `Response`, `Reasoning`, `Tool`, `Suggestion`, `Loader` and
`Actions`. Nine components. Add `CodeBlock` later if the agent starts returning
diffs.

### Why it fits

`components.json` is present and configured: `new-york` style, `cssVariables:
true`, `iconLibrary: lucide` matching the `lucide-react` dependency, with
aliases pointing `ui` at `#/ui` and `components` at `#/modules`. `[built]`

AI Elements requires React 19, Tailwind 4 and shadcn. All three are satisfied.

The shadcn alias layer at `tokens.css:169-182` and `:206-221` already maps
`--color-background`, `--color-muted-foreground`, `--color-popover`,
`--color-primary`, `--color-destructive` and the rest onto AVEL tokens in both
themes. The claim that an existing theme applies automatically is true here. The
section 1 ramp change flows straight into the chat. `[built]`

### Four things that will still go wrong

1. **`bg-card` renders nothing.** `--color-card` is absent, per section 3 item
   10, and Tailwind v4 emits no rule for an undefined utility. Message bubbles
   will have no background, in both themes, with no error anywhere. Add the
   missing aliases first.

2. **`check-tokens.mjs` will reject the install.** Copy-in source becomes our
   source under `src/`, and the checker fails on any hex literal or arbitrary
   radius. The first `pnpm check` after adding components will go red. That is
   the mechanism working. Budget a cleanup pass to convert literals to tokens.
   Do not weaken the rule or add an ignore.

3. **`--color-background` maps to `app-panel`, a card surface.** A conversation
   scroller painting itself `bg-background` sits on a card tone where it
   probably wants `app-bg`. Decide this per component rather than accepting the
   default.

4. **The install path is not ours.** AI Elements writes to
   `@/components/ai-elements/` by default. This repo has no `src/components/`,
   and the alias points at `#/modules`. Expect to move files on first install.
   Settle on `src/modules/chat/elements/` before importing from anywhere.

### The component that decides whether this feels built

`InlineEntityCard`. A mission, client or export rendered inside a message,
clickable, using the same `StatusChip` and `MetricStat` as the rest of the app.
It is not part of AI Elements. It is the seam between the chat and the product.
When the agent mentions a mission it must render as the mission. Build this
early. It is what proves the tool-parts approach was worth the dependency.

---

## 8 · Home

### Why chat is home

A blank command center is intimidating to an operator who is not technical, and
a conversation is the most familiar entry point there is. `[hypothesis]`

Every other nav item is a noun you browse. Chat is where you start when you do
not yet know which noun you want.

### `/` is two pages sharing one file, and that is a trap

Signed in, `/` renders `<Shell><ChatHome /></Shell>`. Signed out, it renders
`<FrontDoor />`. It is the only route in the app where two entirely different
pages share one URL and one file, **and the signed-out one is the one that reads
as "the home page" when you open the source.** `[built]`

The failure mode is silent in the worst way: you edit the wrong half, it
typechecks, the tests pass, and the operator sees nothing change. Thirteen real
polish changes landed on `FrontDoor` and were invisible to a signed-in operator.
Two sessions have now walked into this split from opposite directions — the same
file also nearly lost the front door's own `<h1>` when the duplicate-title fix
over-generalised.

Anyone editing "the home page" states which half first.

### Why chat alone is not enough

A pure conversation hides the system's state behind having to ask for it. If a
gate is blocking a delivery, the operator should not have to think of the
question first.

```
+-------------------------------------------------------------------+
|  2 missions running   ·   1 gate blocking   ·   last export 2d    |  <- always
+-------------------------------------------------------------------+
|                                                                   |
|    What would you like to do?                                     |
|                                                                   |
|    [ New request for a client ]  [ Check on a mission ]           |  <- Suggestion
|    [ What is blocking me?     ]  [ Show recent work   ]           |     elements
|                                                                   |
|  ---------------------------------------------------------------  |
|  [ Ask the Command Center                              stop / ^ ] |  <- PromptInput
+-------------------------------------------------------------------+
```

The status strip is `MetricStat`s and each one navigates. It answers "what
should I do next" before the question is asked. Today that is answered only by
`STATE.md`, in prose.

The agent can see what the strip shows. Asking "what is blocking me" and getting
an answer with a working link is the feature. A chat that cannot read the
database is a worse version of the nav.

### Open

- **Is the thread persisted?** If yes it is a table, carrying the same weight as
  the intake table, and the AI SDK's message-persistence pattern via `onFinish`
  on the server is the hook for it. If no, say so in the UI. An operator who
  assumes their history is saved and loses it is a worse outcome than one who
  knows it is ephemeral.
- **Which model, and where does the key live?** This is the same unresolved
  security question as `credential_ref` for GitHub tokens. Resolve it once, for
  both.
- **Cost.** `cost_entries` exists and the chat is a cost source. Whether chat
  usage lands in that table is a decision.

---

## 9 · The sidebar

The reference is the ArcGPT screenshot. Its most important move is the one
section 1 already rules on: its sidebar is not a raised panel. Ours is.
`sidebar.tsx:149` paints `bg-app-panel`, which is why it reads too light. That
one class is the fix. `[built]`

### What to take

| | Element | AVEL adaptation |
|---|---|---|
| 1 | Sidebar on the app background | `bg-app-bg`. The border does the separating. |
| 2 | Active item carries an underglow | A soft accent gradient bleeding below the item, in place of a filled pill. It reads as illumination. It is the one piece of personality the shell has none of today. |
| 3 | A real brand block | Mark, name, and a true second line. The reference says "Newer version". Ours should say something true: the workspace, or the Neon branch it points at. A decorative subtitle is the same failure as a dropdown that does nothing. |
| 4 | Search with a visible key badge | Polish item 4 given an affordance. The badge must read the shortcut it actually binds. |
| 5 | A recents list grouped by time | Today, Yesterday, Last week. The most valuable adaptation in the reference. |
| 6 | A fade mask at the bottom of the scroller | Polish item 6. Content fades rather than being cut, so it is visible that the list continues. |
| 7 | Account footer | Already exists. Keep it, and keep theme and collapse beside it. |

### The recents list

The reference lists chat threads. AVEL should list recent work: missions opened,
clients touched, exports delivered, requests reviewed. Mixed, time-grouped, each
with its `StatusChip`.

That turns the sidebar into a history. For a single operator, navigation happens
by "what was I doing" rather than by "which section holds this". It is also the
cheapest answer to "where was I" on a Monday morning. `[hypothesis]`

### What to leave

- **The dot-grid content background.** It competes with data-dense tables and
  the blast-radius diff, which are the screens that matter most.
- **Two glows at once.** The reference lights the active nav item and the
  composer. One accent focal point per screen. If the composer glows, the nav
  does not.

### Implementation notes

- **Tokenise the glow.** `check-tokens.mjs` rejects hex literals and `rgba()` in
  `src/`. Build it from `--color-accent` with `color-mix()`. `[built]`
- **Tune it once the ramp has landed.** Dropping the sidebar to `app-bg` at
  `L* 8.2` increases the contrast the glow sits against.
- **Keep it static.** A pulsing glow needs a `prefers-reduced-motion` escape and
  competes with the live dot, which is the one element that has earned the right
  to animate.
- **shadcn ships a `Sidebar`** with collapsible rail, mobile sheet and a
  keyboard shortcut. It is where the `--color-sidebar-*` tokens from polish item
  10 come from. Ours already has collapse, drawer, tooltips and `aria-current`
  working. Adopting theirs means rewriting what works. Keep ours and take the
  tokens.

---

## 10 · The composer

```
+-------------------------------------------------------------+
|  Ask, plan, or deliver     /  @ for context                 |
|                                                             |
|  [+]   [ Ask  v ]   [ * Sonnet 5  v ]            [mic] [ ^ ] |
+-------------------------------------------------------------+
```

The second reference is a composer with a control row: an attach button, two
morphing dropdown pills, and a send control. Most of it is straightforward. One
part of it is the most useful idea in either image.

### The mode pill is the permission gate

Section 6 rules that read-only tools ship first and write tools do not ride
along. That reads as a limitation. The mode pill makes it a feature.

| Mode | Tools available | Confirmation |
|---|---|---|
| Ask | read-only | none needed |
| Plan | read-only, and proposes | shows what it would do, which is the preview idiom again |
| Act | write | every mutation through `ConfirmAction` |

The default is `Ask`. The operator can see what the agent is permitted to do
without reading a system prompt, and raising the permission is a deliberate
action rather than a hidden capability. That is section 12's rule applied in the
other direction: never let a control do more than it appears to.

It also gives the write-tools work a home. `Act` stays disabled with a reason
until the confirmation path exists. A mode you cannot yet select is honest. A
tool that is silently unwired is not.

### `@` for context

`@` opens a picker over missions, clients, agents and exports. It is the input
side of `InlineEntityCard`. Mention a mission, the composer holds a chip, and
the tool call receives a real id instead of the model inferring one from a name
in prose. Build it for correctness. It is the difference between the agent
looking up the right mission and the agent looking up a mission.

### The one morph that must ship

The reference's subject is buttons morphing into dropdown lists. Most of that is
decoration. The send and stop swap is not.

`useChat` returns `status` and `stop()`. The same button is send when `ready`
and stop when `streaming`. A stream the operator cannot cancel is a hang, and a
hang is indistinguishable from a broken app. Ship the swap. Treat the mode and
model morphs as optional.

### Motion budget

`patch.css:114-117` defines `--duration-micro` at 120ms, `--duration-state` at
200ms, `--duration-enter` at 320ms, and `--ease-avel`. A motion system exists.
`[built]`

Any morph uses those tokens rather than the timings a component library ships
with. Otherwise the composer animates on a different clock from the rest of the
shell, which is what reads as bolted on.

---

## 11 · Where components come from

Five sources, assessed against what this repo can absorb.

| Source | What it is | What to take | Verdict |
|---|---|---|---|
| **shadcn/ui** | 80+ components. Already configured here. | `Command`, `Data Table`, `Scroll Area`, `Collapsible`, `Separator`, `Sheet`, `Avatar`, `Popover`, `Select`, `Kbd`, `Empty`, `Spinner` | The default. Nothing else is reached for until shadcn has been ruled out for a specific component. |
| **beautifului.dev** | 20 primitives for AI-native interfaces. MIT, copy-paste, built by Turbo. | Approval Card, Tool Chips, Task Rows, Prompt Bar, Context Cards, Diff Table, Records Table, Filter Table, Streaming Text, Thinking, Insight Cards | The closest fit. Its component list reads like a description of this plan. Approval Card is the request review, Diff Table is blast radius, Context Cards is `InlineEntityCard`. Its stack is not stated on the page. **Verify React and Tailwind versions before committing.** |
| **beUI** | 112 animated components. React 19, Tailwind 4, Framer Motion, distributed through the shadcn registry. | `Command Palette`, `Action Swap`, `Expandable Action Bar`, `Morphing Modal`, `Theme Toggle` | Requires a new dependency. The stack matches exactly, and it is built on Framer Motion, which is not installed. Take it only if the composer morph justifies `motion`, and take those five rather than the dock and orb and tilt set. |
| **transitions.dev** | Animation recipes for agent interfaces. CSS and React, copy-paste, freemium. | Text states swap, Shimmer text, Skeleton loader and reveal, Number pop-in, Card resize, Toast open/close | Best value per unit of risk. CSS recipes carry no dependency cost. Map them onto `--duration-*` and `--ease-avel` rather than pasting their timings. |
| **rareui.com** | 14 free animated components. | — | Skip. Fluid Orb, Gravity Letters and Folder are decorative, and nothing maps onto a screen in this plan. Revisit if the landing page wants personality. |

### The dependency decision, made once

Everything expressive in the composer reference is a Framer Motion idiom, and no
animation library is installed. No `motion`, `framer-motion`, `gsap`, `cmdk`,
`vaul` or `sonner`. Verified. `[built]`

Two paths:

- **Add `motion`.** beUI drops straight in, the morphs are free, and every
  future interaction has a real tool. The cost is a substantial runtime
  dependency and a second animation vocabulary alongside the CSS tokens that
  already exist.
- **Stay CSS-only.** Use transitions.dev recipes on the existing tokens and
  hand-build the send and stop swap, which is a crossfade and does not need a
  library.

Recommendation: stay CSS-only for the first cut. Revisit when a morph fails to
look right in CSS, which is a real possibility for the expandable pills and is a
better reason to add a dependency than anticipation.

`cmdk` is a smaller, separate question. shadcn's `Command` is built on it, so a
command palette brings it either way.

### One warning that applies to all five

Copy-in source becomes our source. Every one of these ships hex literals and
arbitrary radii. `check-tokens.mjs` scans `src/modules`, `src/ui` and
`src/routes` and fails on both. The first `pnpm check` after any paste will go
red. `[built]`

That is the mechanism working. Budget one conversion pass covering every
component taken, rather than a scramble per paste. Never weaken the rule or add
an ignore to accommodate a paste. The checker is the only thing standing between
a five-source component diet and five competing colour vocabularies.

---

## 12 · Designing for a non-technical operator

The constraint is unusual. Single user, designed for legibility. No sharing, no
permissions, no collaboration affordances. That budget goes into explaining
state.

1. **Every screen answers "what is this, and what do I do next" in its first
   line.** That is what the header subtitle is for.
2. **Error codes are for the log. The screen says what happened and what to
   do.** The error map already does this. Extend the discipline rather than
   re-deciding it per screen.
3. **Nothing irreversible without a preview.** Already the export pattern.
   Request approval is the next case, and agent write-tools the one after.
4. **Empty states say why.** "No requests yet. Requests are how new work starts"
   beats "Nothing here."
5. **Name the jargon once, where it is first met.** `blast radius` is good.
   `roster entry`, `playbook`, `preset` and `cut` each need one plain sentence
   at first encounter, on the section header, rather than in a glossary nobody
   opens.
6. **Never show a control that does not work.** Section 2's finding promoted to
   a rule, because it is the one already violated. Sections 6 and 10 are where
   it would be violated next.
7. **A screen with no query behind it says it is not built, in plain words.** It
   does not borrow the empty state, and it never renders fixtures. An empty
   state means "there is nothing here yet"; a missing endpoint means "this does
   not work yet". A screen that confuses the two tells the operator their
   catalogue is empty when it is actually unreachable. Fixtures are worse again:
   a screen of invented rows looks finished, which is the failure `CLAUDE.md`
   opens with. The pre-flight screen already does this correctly and three
   sessions reinvented it independently, which is why it is a rule rather than a
   note. Raised by avel-fa.

   **Its hazard, found by rendering:** a screen that correctly says "not built"
   can still be anonymous. The catalog screens put the `PageHeader` inside the
   four-state boundary, reasoning that the subtitle carries counts and a count is
   unknowable until the read resolves. That was right about the counts and wrong
   about the header, so every catalog page rendered as one grey sentence with no
   title, on a shell whose header does not carry the page name yet either. **A
   screen's title and definition are static facts and render in every state.**
   Only the counts wait. `[built]`

---

## 13 · Suggested order

| | Work | Why here |
|---|---|---|
| 1 | Theme ramps (section 1) | Everything below is judged in these colours. Doing it last means evaluating every new screen against surfaces already known to be wrong. |
| 2 | Fill the shadcn alias holes | Two lines of CSS that prevent a silent, themed-looking failure in step 11. |
| 3 | Delete the dead top-bar controls | Small, independent, and it removes a control that lies. |
| 4 | Shell polish 1 to 3 | Theme flash, reduced motion, focus ring. Highest visibility per line changed. All three are global and touch no feature code. |
| 5 | `PageHeader` and `ActionSlot` | Every new view needs it, and it turns the divider into a header. |
| 6 | `SectionCard`, `SectionRail`, `DefinitionList`, `StatusChip`, `EmptyState`, `MetricStat` | The shared vocabulary the clients page and the chat status strip are both built from. |
| 7 | Intake table and migration | Landed 2026-08-30 as `0016` and `0017`. Not applied to Neon. |
| 8 | Client detail: masthead and sections 1 to 4 | The half that answers real questions. Sections 5 to 9 follow. |
| 9 | Request review, `/intake` deleted, nav updated, `shell.tsx:86` comment fixed | The nav change and the route deletion land in one commit, or the nav points at nothing. |
| 10 | Chat: dependencies, `/api/chat`, read-only tools | Backend first, verified against the method-guard and envelope mechanisms before any UI. |
| 11 | Sidebar redesign (section 9) | Independent of the chat. One background class, the underglow, the fade mask, then the recents list. |
| 12 | Chat UI: composer, AI Elements, `InlineEntityCard`, status strip | The mode pill in section 10 is what makes step 10's read-only cut legible. |
| 13 | **Catalog procedures** | Missing from this table entirely rather than deferred. The Library group is five nav items and four have no endpoints: skills, agent templates, skill sources, presets. Those screens are built and render "not built" until these exist. Preset is the hard one — the only entity in `DATA-CONTRACTS-V2` with no field block at all. Raised by avel-fa. |
| 14 | Remaining shell polish, items 4 to 9 | Command palette, content width, scroll affordance, pending states, frame height, header wrap. |

### One-commit rules need a mechanism, not a promise

Step 9 requires the nav change and the route deletion to land together. It did
not hold, and nobody disagreed with it. The deletion was `git rm`'d and held
STAGED waiting on a blocking fix, and a broad `git add` in another session swept
it into an unrelated commit — **in a shared tree the index is shared**, so
"I will hold this staged" is unholdable by construction. `HEAD` then carried a
nav entry pointing at a route that did not exist, which is verbatim the state the
one-commit rule exists to prevent. `[built]`

`CLAUDE.md` names this exactly: `[attestation]` marks anything enforced by a
claim rather than a mechanism, and it is this project's recurring failure mode.
The rule was an attestation. So is every other cross-session sequencing promise
in this document.

The cheap discipline: stage by path, and read `git status --short` for entries
you did not create before committing. The same root cause produced the
`routeTree.gen.ts` merge blocks. Raised by avel-c2.

Steps 1 to 6 are shell work and touch no data. Step 7 is a schema change and
belongs to whoever owns the schema. Soft-delete and append-only conventions
apply to a new table and are easy to miss from outside that module.

---

## 14 · Still open

- **Chat thread persistence.** Table or ephemeral. Blocks step 12, nothing else.
- **Model choice and where the API key lives.** The same unresolved question as
  `credential_ref`. Resolve once, for both.
- **Whether chat usage is written to `cost_entries`.**
- **What the agent may write, and through what confirmation.**
- **`motion` or CSS-only** (section 11). CSS-only is recommended for the first
  cut. It is a decision, and it gates how much of beUI is reachable.
- **What the sidebar recents list queries.** Mixing missions, clients and
  exports into one time-ordered feed is a query nothing currently serves.
- **`app-recessed` in dark equals `app-bg` today.** The proposal separates them.
  Confirm that inputs and code blocks should read as wells.
- **The nine unsourced `RenderMission` fields** are outside this document. They
  will surface in section 5's *Brief & documents*, which is where they would
  eventually be edited.
