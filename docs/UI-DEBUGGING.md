# UI Debugging — why the shell took nine attempts

*Written after a header crop took four rounds and a sidebar colour took three.
Every item here cost real time on 2026-08-29/30. None of it is hypothetical.*

---

## The one rule that would have saved most of it

**Screenshot before you reason. Every time, at the operator's viewport.**

The header crop was reported four times. The first three fixes were all *real
defects*, all correctly diagnosed from the markup, and none of them was the
cause. The fourth attempt started by launching a browser at 1440x700 and
printing bounding boxes, and the answer was obvious in one run.

The pattern is exact and worth internalising:

| approach | rounds | outcome |
|---|---|---|
| read markup, reason, fix | 3 | three correct fixes, symptom unchanged |
| launch browser, measure, look | 1 | root cause found |

A visual bug reported by someone looking at a screen cannot be closed by
someone reading a file. **If the operator says "still there", stop editing and
start measuring.** The second "still there" is already one too many.

```js
// The whole harness. Four minutes to write, and it ended a four-round loop.
import { chromium } from "@playwright/test";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 700 } });
await p.goto("http://localhost:3000/", { waitUntil: "networkidle" });
console.log(await p.evaluate(() => {
  const box = (sel) => {
    const el = document.querySelector(sel); if (!el) return null;
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    return { top: r.top|0, bottom: r.bottom|0, h: r.height|0,
             scrollH: el.scrollHeight, clientH: el.clientHeight,
             shrink: cs.flexShrink, overflowY: cs.overflowY };
  };
  return { window: box('[data-testid="app-window"]'),
           sidebar: box('[data-testid="sidebar"]'),
           main:    box('[data-testid="main"]') };
}));
await p.screenshot({ path: "shot.png" });   // then LOOK at it
```

---

## Measure at the operator's viewport, not yours

**The crop did not exist at 1440x900.** It appeared below roughly 830px of
viewport height — a laptop with browser chrome. Two sessions independently
measured at 900, got "not clipped", and were about to report *cannot
reproduce* on a defect that had been reported three times.

Content was 778px. At 900 the window is 848 and nothing shows. At 700 the
window is 648 and 131px is cut.

**Sweep heights.** `for h in 900 800 700 620 560 500` costs nothing and is the
difference between finding it and denying it exists.

---

## The four layout traps, in the order they bit

### 1. A fixed-height grid with no declared rows

```css
/* the bug */  grid h-[calc(100vh-52px)] grid-cols-[auto_1fr] overflow-hidden
/* the fix */  ... grid-rows-[minmax(0,1fr)]
```

No `grid-template-rows` means the implicit row is `auto` — **max-content**. The
container is 648px; the row is 778px; children get 778px and `overflow-hidden`
cuts them. `minmax(0, 1fr)` pins the row to the container AND gives it a min of
0, which is the half that matters: children finally have a definite size to
shrink within.

**This was the root.** Everything below it is real and was fixed first, and
none of it could work, because *a child cannot shrink into a row that was never
bounded.*

### 2. Flex children default to `flex-shrink: 1`

In a `flex flex-col overflow-hidden` column, exactly one child should shrink —
the one that scrolls. Every sibling needs `shrink-0`. The topbar had none, and
the sidebar had four blocks with none, so when space ran short *everything*
compressed together instead of the nav scrolling.

### 3. `mt-auto` in an overflowing column clips the TOP

This is why it did not read as ordinary overflow, and why fixing the bottom of
one column never helped. When a flex column overflows, an auto margin resolves
against **negative** free space and pushes content up past the container's top
edge. The symptom was a brand mark sliced in half at the top, not a footer
running off the bottom.

### 4. A comment can promise a class the file never had

```
/* RESERVED, NOT COLLAPSED. `min-h` and the auto margin keep the core
   group in the same place ... */
<div className="ml-auto flex shrink-0 flex-wrap items-center gap-2">
```

`min-h` appeared **nowhere in that file except inside the sentence claiming
it**. `ml-auto` fixes horizontal position and says nothing about vertical, so
the run pill had been drifting with the title block on every page.

### 4b. A scripted edit that silently does nothing

The instance above was found in someone else's code. Hours later I wrote a new
one into the same file, the same night, having already documented the pattern.

A script swapped the seam from neutral to accent. It changed the class and
tried to change the comment beside it:

```python
s = s.replace(old_class, new_class)     # asserted, and applied
s = s.replace(old_comment, new_comment) # NOT asserted, and silently no-opped
print("divider is now accent at 60%")   # true of the class, not the comment
```

The comment string had been reflowed by the formatter since it was written, so
it no longer matched. `str.replace` does not raise on a miss — it returns the
input unchanged. The commit therefore shipped a comment reading "NEUTRAL RATHER
THAN ACCENT, deliberately" directly above `var(--color-accent)`, and the success
message printed anyway.

**Every scripted replacement needs `assert old in s` before it runs.** One
unasserted `.replace()` in a script whose other replacements all succeed is
invisible: the diff looks right, the file compiles, the tests pass, and the
comment now lies. A print statement confirms the script ran, never that it
matched.

**Grep for the class a comment claims.** This is miss-pattern M2 from the
CounselOS corpus: *a load-bearing comment is a claim to verify, never
evidence.* It survived because it was specific and confident.

---

## Instrumentation that lies

### `getComputedStyle(el).backgroundColor` returns `rgba(0,0,0,0)` for inherited surfaces

An element with no `background` of its own reports **transparent**, not the
colour it visibly renders. A check like `sidebarBg === contentBg` returns false
for two elements that are pixel-identical on screen. Read the ancestor that
actually paints, or sample pixels.

### The theme class is on the shell element, not `documentElement`

```js
getComputedStyle(document.documentElement).getPropertyValue("--color-app-bg")
```

returns the **dark** ramp in both themes. A probe written this way reports light
mode wrongly and looks authoritative doing it. Read computed styles off the real
elements instead.

### A green unit suite is not a green tree

472 vitest tests passed through every one of these bugs. Not one of them is
visible to `tsc` or to a unit test — they are all geometry at a particular
viewport with particular content. **Playwright is the only suite that can see
them**, and it was silently unrunnable for weeks (see below).

---

## Environment traps

### Kill your dev servers

Sixteen vite processes were alive at once, started across two days. Two were
bound to the same port; one had stopped responding entirely. **Killing the
server a browser tab is attached to freezes that tab** — it becomes a snapshot
with a dead HMR socket and will never update, no matter how many times you
reload. After restarting a server, open a NEW TAB rather than reloading.

Check before debugging anything visual:

```bash
powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { \$_.CommandLine -like '*vite*dev*' }).Count"
```

### Confirm the server sends what the disk holds

```bash
curl -s http://localhost:3000/src/styles/patch.css | grep -c "242935"
```

Do this before concluding anything is stale. It was never stale once.

**One trap in that check:** TanStack Router code-splits routes. Fetching
`/src/routes/index.tsx` returns a *stub*; the component body is in
`?tsr-split=component`. Grepping the stub for your change finds nothing and
looks exactly like a stale server.

### `biome check` red on ~30 files is CRLF, not formatting

Git checks out with CRLF on Windows; biome wants LF. The diff shows `␍`. It is
environmental and pre-existing — do not "fix" it by rewriting line endings
across the repo mid-task.

---

## Design constraints specific to this app

- **`check-tokens` forbids colour literals** in components and routes. Every
  value comes from the ramp: `--color-app-bg / -recessed / -panel / -raised /
  -float`, `--elevation-border-rest / -raised`, `--color-accent`.
- **Light mode is where a tonal step collapses.** `app-raised` and `app-panel`
  are both `#ffffff` in light. Any control that sits on `app-raised` **vanishes**
  the moment its container also becomes white. This has now been reverted once
  (correction 5) and re-broken once. If you lighten a surface, check every
  control sitting on it — the fix is to recess the control, because *downward is
  the only direction light has left*.
- **No rules between panes.** Internal dividers are out. A hairline that fades
  to transparent at both ends is not a rule, because it has no endpoints — that
  is the technique the nav item and composer underglow already use, and reusing
  it keeps the shell to one piece of personality.
- **One accent focal point per screen** (UI-PLAN §9). The active nav item holds
  it. A permanent accent seam beside it is two — hold it back in opacity if the
  operator asks for brand colour there anyway.

---

## The shape of every one of these

Nine of the eleven items above share a structure: **something was true in the
code and false in the browser, and nothing in the toolchain could tell the
difference.** A comment claiming a class. A grid row sized by content rather
than container. A probe reading tokens off the wrong element. A server serving
correct bytes to a tab that had stopped listening.

`tsc` was green throughout. The unit suite was green throughout. The only
instrument that could see any of it was a browser at the right size, with a
screenshot someone actually looked at.
