# Sandbox

Status: specced. Tier 0 is buildable today at no cost. This document answers H1 through H3 in PRIOR-ART.md.

This document defines where agents execute, what they can reach, and how boundaries are enforced. The per-agent mount table is in ROSTER-V2.md.

## Current state

There is no sandbox.

Version 1 runs agents as files in a private `avel-system` repository, symlinked into the client project, executing in Claude Code on the operator's machine. This means:

- Every agent runs with the operator's full user privileges.
- The GitHub credential is present in that environment.
- Every client's code sits on one filesystem.
- Every rule in the roster is enforced only by the agent's willingness to comply.

The last point is the one that matters most, and it is not primarily a security finding.

## What the sandbox is actually for

The sandbox is not primarily a security feature. It is what turns the roster's boundaries from prose into physics.

ROSTER-V2.md establishes that a boundary is only real if it can be written as paths. This document is the other half: `writable_paths` is a mount, not a rule.

If Leon can only write to `components/`, then mount only `components/` as writable in Leon's environment. Leon does not choose not to touch the data layer. Leon cannot. The same applies to Kel and `services/`, to every phase C and D agent and source code, and to Blair and active-mission git.

One change makes every instruction in the roster an enforced invariant. It also produces `verification.ownership` for free, because a write outside the mount fails at the filesystem rather than at review time.

## Two kinds of isolation

Conflating these is what makes a sandbox seem expensive.

| | Isolation for correctness | Isolation for security |
|---|---|---|
| Question | Can an agent write where it should not? | Can hostile code escape and steal credentials? |
| Threat | An agent ignoring an instruction | A malicious dependency in a client's tree |
| Sufficient | Mounts, worktrees, containers | VM-level isolation, or no secrets to steal |
| Cost | None | Modest, and only for one component |

Agent authoring sessions are not hostile code. An agent writing TypeScript is your own tooling operating on your own machine. Correctness isolation is enough.

The verification runner is different. It executes `npm install` and `npm test` against a client's dependency tree, which is third-party code you did not audit. That is the one component where the security question is real.

Even there, the decisive mitigation is not a VM. If the runner holds no credential and has no network egress, a container escape yields a container on your laptop with nothing worth taking. The credential boundary is worth more than the isolation technology, and it costs nothing.

## Tier 0: now, no cost, worktree and container

This is the right answer for a solo operator at AVEL's current stage. See STATE.md. It is not a compromise. It is correctly scoped.

| Scope | Environment |
|---|---|
| Per mission | One container with the client repo mounted |
| Per agent | One git worktree, only its declared paths writable |
| Verification runner | A separate container with no credential and no egress except the package registry |

What this provides:

- Every roster boundary mechanically enforced
- Agents unable to overwrite each other's work
- Ownership violations detected at write time
- Per-mission isolation between clients
- The credential boundary in place from day one

What it does not provide: containers share a host kernel, so this is isolation for correctness rather than a guarantee against hostile code. On macOS and Windows, Docker Desktop already runs containers inside a virtual machine, so there is a hypervisor boundary between container and host. Tier 0 is stronger on those platforms than on Linux.

The worktree half is already solved by `treehouse`, which provides a pool, leases with per-acquisition identity, in-use detection, and safe teardown with per-risk opt-in flags. Adopt the design at minimum. See PRIOR-ART.md, question T3.

## Mounts and the choice of cut

An earlier version of this section reported that NestJS co-locates a module's controller and service, concluded that the layer boundary was a file-suffix pattern no mount could enforce, and proposed diff checking as a second enforcement path.

That was the right observation and the wrong conclusion. It is a decomposition problem, not an enforcement problem. See ROSTER-V2.md.

The correct reading:

> If a boundary cannot be mounted, the cut is wrong for that codebase.

A layer cut on a layer-organized codebase mounts cleanly. A feature cut on a feature-organized codebase mounts cleanly. The suffix problem only appears when a layer cut is forced onto a feature-organized framework, and the fix is to change the cut rather than to add a second enforcement mechanism.

This makes the mount the arbiter rather than a convenience. **If you find yourself needing diff enforcement to hold a boundary, you have chosen the wrong decomposition for the stack.** Read the client's directory structure and choose the cut whose boundary is a directory.

Diff enforcement at phase close remains useful as a backstop, since a mount cannot catch everything and `verification.ownership` needs the data regardless. It is not a substitute for choosing correctly.

## Tier 1: at the first paying client, roughly four dollars per mission

Move only the verification runner to a real VM sandbox. Agent sessions stay local.

Use ComputeSDK so the provider is not a lock-in. E2B publishes $0.0504 per vCPU-hour and $0.0162 per GiB-hour, so a 2-vCPU, 4 GiB sandbox costs about $0.166 per hour. Daytona matches those rates and starts with $200 of credit and no subscription floor. Northflank is cheaper at $0.01667 per vCPU-hour, billed per second.

| Workload | Estimate |
|---|---|
| One verification run: build, tests, changed-file mutation, about 20 minutes | $0.06 |
| One agent session, one hour | $0.17 |
| A full mission: 15 agents plus about 20 exports | $4 |

Watch the floor rather than the rate. E2B's Pro tier is $150 per month. Its free Hobby tier gives a one-time $100 credit with one-hour session limits and up to 20 concurrent sandboxes. For a solo operator, Daytona's $200 credit with no monthly floor is the better starting point, and free tiers cover Tier 1 entirely for the first several missions.

The number that matters: sandbox compute is negligible next to token spend. A multi-agent mission runs at roughly fifteen times a chat session's tokens at frontier rates, which costs tens to hundreds of dollars. The sandbox costs four. Keep the attention on tokens. See COST-LOG.md.

## Tier 2: multiple concurrent clients, everything remote

Agent sessions and runners both move remote. Per-client isolation is enforced by the provider, and per-client concurrency caps prevent one mission from starving another.

Trigger: two clients running simultaneously, or the first client whose contract carries security requirements you have to answer for in writing.

## What must not wait for Tier 1

Three things cost nothing today and are expensive to retrofit. These are one-way doors.

**The runner never holds the credential.** Render and verify in one process, deliver from another. `Connection.credential_ref` already names where the token lives rather than storing it. Make that a deployment topology boundary rather than a convention. The gateway resolves the token, and the gateway is not the runner.

**Egress is denied by default in the runner.** Allowlist the package registry and deny everything else. Most supply-chain payloads need to reach the network, so this defeats the common case for almost nothing. In Docker, use `--network=none` for the test phase, or a bridge with an egress filter during install.

**Per-agent writable mounts.** This is the point of the whole document. It costs nothing at Tier 0 and it is what makes ROSTER-V2.md true rather than aspirational.

## Answers to PRIOR-ART.md H1 through H5

**H1. Where does the verification runner execute?** At Tier 0, a local container with no credential and no egress. At Tier 1, a remote VM sandbox through ComputeSDK, with the provider chosen on free-tier terms rather than benchmark rank. Answered.

**H2. Is egress denied by default with a registry allowlist?** Yes, from Tier 0. Non-negotiable and free. Answered.

**H3. Is it architecturally guaranteed that the runner never accesses the credential?** Yes. Different process, different environment, no shared secret store. Enforced by deployment topology rather than by code review. Answered.

**H4. Cost per export at realistic client-repo size?** Estimated above. Needs a real number from CounselOS Slice 0. Log it in COST-LOG.md.

**H5. Does pg-boss still win once verification runs remotely?** Open. Deferred until a Tier 1 run produces real timings.

## Build order

1. Credential and egress boundary. Free, a one-way door, do it first.
2. Per-agent worktree with declared mounts. This is what makes ROSTER-V2.md real.
3. Ownership violation detection at write time, feeding `verification.ownership`.
4. Measure one CounselOS slice and put the number in COST-LOG.md.
5. Then decide Tier 1.

Steps 1 and 2 need no provider account, no spend, and no architectural commitment.

## Open questions

| Question | Blocking |
|---|---|
| Concrete mount globs per agent for the CounselOS stack | Yes. Blocks step 2. |
| One container image per phase, or one image for all agents? | Before step 2. |
| Where do worktrees live, and what prunes them? | Before step 2. `treehouse` has the answer. |
| H4: real cost per export | After Slice 0. |
| H5: pg-boss versus an external durable runtime | After a Tier 1 run. |
