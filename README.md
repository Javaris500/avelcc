# AVEL — Command Center

The operator interface for AVEL. It turns a client brief into a deterministic
`.avel/` package — mission, roster, conventions, process — then renders,
freezes, gates and delivers it into a client repository.

**Status:** frontend only. There is no backend, no database and no export
engine. See *What is actually built* below before assuming a screen works.

---

## Running it

```bash
pnpm install
pnpm dev            # http://localhost:3000, bound to all interfaces for WSL
```

Node 24 (`.nvmrc`). Auth is bypassed in development — the account reads `dev`
so it is never mistaken for a real session. To exercise the session gate
itself:

```bash
VITE_AUTH_BYPASS=0 pnpm dev
```

## Checks

```bash
pnpm check          # biome + the token lint
npx tsc --noEmit
npx vitest run      # 104 unit tests
npx playwright test # browser tests, serial by design
```

The browser suite runs serially on purpose. Parallel workers start runs
mid-rebuild against the dev server and produce failures that look real and are
not. A suite that cries wolf gets ignored.

---

## What is actually built

| | |
|---|---|
| App shell, sidebar, nav, both themes | built |
| Login, GitHub OAuth seam, session gate | built, identity source is a stub |
| `gitBlobSha`, `computeBlastRadius` | built and tested, **wired to no screen** |
| `computeCoherence` | built and tested, **wired to no screen** |
| Golden fixture, 20 files | built, hash reproduced independently |
| Pre-flight screen | gates section only |
| Everything else | routes exist, each renders an empty state |

Of 13 routes, 11 are empty states. Most are empty not because nothing has
happened but because the contract defines no procedures for them — those gaps
are tracked in `docs/ROUTES.md`.

The engine and the interface both exist and **nothing connects them**. The join
is a gateway `readTree` call against a public repository: no database, no auth,
no export engine required.

---

## Layout

```
src/
  components/
    ui/        primitives — shadcn, adapted once at generation
    shell/     the frame: sidebar, top bar, window chrome
    nav/       the nav tree, behind a declared seam
    gate/      domain — gate rows and verdicts
    auth/      login form, GitHub button
    device/    the capture/construction boundary
    theme/     one theme hook, shared by shell and login
  contract/    types, error maps, computeCoherence — imported by both sides
  lib/         gitBlobSha, computeBlastRadius — pure, no IO
  routes/      file-based, TanStack Router
scripts/
  check-tokens.mjs   fails on a literal where a token belongs
fixtures/golden/     the package the renderer must reproduce byte-for-byte
docs/                the specification. START-HERE.md first.
```

## Design system

Tokens live in `src/styles/`. `tokens.css` is the base layer; `patch.css` is
`docs/patches/globals-patch.css` applied with its corrections recorded in the
file header.

Four axes are enforced by `scripts/check-tokens.mjs`, not by convention:
**colour, type size, radius, spacing**. A literal in a component fails the
check. Layout escape hatches are allowed — the rule is that a `className` may
adjust layout, never appearance.

Two more rules are enforced by the compiler rather than by memory: `<Surface>`
does not compile without all four states, and interactive primitives do not
compile without a `data-testid`.

## Conventions

- Types come from the contract. A screen needing a shape the contract does not
  define is a contract change, not a local interface.
- `data-testid` ships in the same commit as the component.
- Browser specs are `*.e2e.spec.ts`, beside the code they cover.
- Verify the output, not the exit code. Several defects here passed a green
  build: a stylesheet disabled by a stray comment terminator, every dark-theme
  token tree-shaken away, a route that rendered nothing while typechecking
  perfectly.

---

Pinned: `@tanstack/react-start` 1.168.49. Its API has moved between versions —
read release notes before upgrading.
