# Stack & Resources

Everything needed before and during the build. Split by when you actually need it, so nothing gets provisioned six weeks early.

Decision record: `DECISIONS-V2.md`. Tool list: `TECH-STACK.md`.

---

## TanStack Start — confirmed

The router is identical either way. Start *is* TanStack Router plus a server. What decides it is that three things in the Command Center need a server:

| Need | Why |
|---|---|
| GitHub credential resolution | Must happen server-side. A client app either proxies through a separate backend or leaks the token. |
| The zip download | Streams frozen bytes from a route, outside the contract envelope. |
| The webhook receiver | GitHub posts to it. |

Without Start, all three force a second Node process — a second deployment target and a second place for the credential boundary to be wrong.

Start also gives you server functions for the blast radius, so the Trees API call and the blob-SHA computation run server-side and the client never sees a token.

**Trade accepted:** younger framework, smaller community, API has moved between versions. **Pin the version. Read release notes before upgrading.**

---

## Day one — needed tomorrow

Everything here is free or already installed.

### Runtime
- [ ] **Node 22 LTS or 24 LTS** — pin in `.nvmrc`
- [ ] **pnpm** — `npm i -g pnpm`
- [ ] **Docker Desktop** — needed later for the sandbox and testcontainers, not day one

### Scaffold
```bash
pnpm create @tanstack/start@latest avel-cc
cd avel-cc && pnpm install
```

### Core dependencies
```bash
# contract + validation
pnpm add @ts-rest/core @ts-rest/react-query zod

# data
pnpm add @tanstack/react-query

# ui
pnpm add tailwindcss @tailwindcss/vite lucide-react
pnpm add class-variance-authority clsx tailwind-merge

# the two pure functions
pnpm add -D @types/node
```

### Fonts
Already chosen and in use on the landing. Same four:

| Role | Face |
|---|---|
| Display | Space Grotesk 500/600/700 |
| Body | Inter |
| Mono | Geist Mono 400/500 |
| Emphasis | Fraunces italic 400/500 |

Self-host through `next/font` equivalent or Fontsource. Do not hotlink Google Fonts in the app shell — an internal tool should not depend on a third-party CDN to render.

### shadcn
```bash
pnpm dlx shadcn@latest init
```
Config already exists: `new-york` style, `neutral` base, CSS variables on, lucide icons. **Match the landing's `components.json` exactly** so components move between the two surfaces without translation.

### Tokens
- [ ] Apply `globals-patch.css`
- [ ] Confirm `.light` sits on the `/app` shell wrapper, never `<html>`
- [ ] Replace the `html, body` scrollbar block with the scoped version

---

## Week one — needed once something computes

### GitHub
- [ ] **A scratch organisation.** Not a personal repo. Every delivery path gets exercised here fifty times before a client repo is touched.
- [ ] **A fine-grained PAT**, contents read-only to start. Read-only is enough for the blast radius — the whole point is that it reads a tree and writes nothing.
- [ ] Put it in `.env`, never in client code, resolved only in a server function.

### Test repos
Pick three public repositories with different shapes for the blast-radius fixtures:
- A small one (~50 files) for fast iteration
- A large one (5,000+ files) to hit the tree-truncation path
- One with symlinks or submodules to exercise the violation classes

---

## Week two to three — the backend appears

### Database
- [ ] **Neon** — free tier is genuinely enough. Branching per feature branch is the reason to pick it, and it is on the free plan.
- [ ] Two connection strings: **pooled for the app, direct for `drizzle-kit`.** This trips people.
- [ ] `main` and `dev` branches on day one so branching is habit rather than retrofit.

```bash
pnpm add drizzle-orm @neondatabase/serverless
pnpm add -D drizzle-kit
```

- [ ] Enable **pgvector** immediately, unused. One line, free, and V2 retrieval then needs no migration.

### Server
```bash
pnpm add hono @hono/node-server
pnpm add @auth/core        # Auth.js, GitHub OAuth
pnpm add octokit
pnpm add pg-boss           # jobs — uses the Postgres you already have
```

### Observability
```bash
pnpm add pino pino-pretty
pnpm add @sentry/node
```
Sentry free tier: 5,000 errors a month. Ample.

---

## Week three onward — the gate

### Verification
```bash
pnpm add -D vitest @vitest/coverage-v8
pnpm add -D @playwright/test
pnpm add -D @stryker-mutator/core @stryker-mutator/vitest-runner
pnpm add -D testcontainers
```

- [ ] **oasdiff** in CI — a GitHub Action, exit 1 on breaking change
- [ ] **Stryker config: `--incremental`, changed files only.** Full-project mutation is for the sprint ship, not every export. This was resolved; do not let it default.

### Storage
- [ ] **Cloudflare R2** — 10 GB free, and no egress fees, which is the reason to pick it over S3.
```bash
pnpm add @aws-sdk/client-s3   # R2 is S3-compatible
```

---

## Deferred — do not provision yet

| Resource | Trigger |
|---|---|
| **Daytona or E2B sandboxes** | The first paying client. $200 free credit on Daytona, no monthly floor. Local Docker is correct until then. |
| **Anthropic API key for Canon** | Canon is a form in V1. Only needed when intake becomes an agent. |
| **A domain for the app** | `avelco.dev/app` is fine. |
| **Vercel or Cloud Run** | Local until something is worth deploying. |
| **BullMQ / Redis** | pg-boss removes the reason. |

---

## Cost

| | Now | With one client |
|---|---|---|
| Neon | free | free |
| Sentry | free | free |
| R2 | free | ~$0 |
| GitHub | free | free |
| Sandbox | $0, local Docker | ~$4/mission, free credit first |
| **Infrastructure total** | **$0** | **~$5/month** |
| **Token spend** | — | **$50–200/mission** |

Infrastructure is noise. **Tokens are the whole bill**, which is why the cost log matters more than any provider decision on this page.

---

## Accounts to open

**Now:** GitHub scratch org. That is the only one.

**Week two:** Neon, Sentry.

**Week three:** Cloudflare R2.

**When a client pays:** Daytona.

---

## The traps

**Two Neon connection strings.** Pooled for the app, direct for migrations. `drizzle-kit` will fail confusingly against the pooled string.

**Stryker defaults to the full project.** Set incremental on the first run or verification takes an hour and you will start routing around it.

**TanStack Start's API has moved between versions.** Pin it. Do not upgrade mid-build.

**Do not hotlink fonts in the app.** Self-host. An internal tool should not need a CDN to render text.

**Do not put the PAT anywhere the client bundle can reach.** Server function only. This is the one-way door — free today, expensive after the first client repo is connected.

---

## Confirm before `pnpm create`

- [ ] Same repo as the backend, or separate?
- [ ] If separate: contract goes in `packages/contract` today, not `src/contract` later
- [ ] TanStack Start version pinned in `package.json`
