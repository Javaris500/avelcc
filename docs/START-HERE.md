# Start Here

Which documents your task actually needs. Read this, load two or three, and stop. Loading all twenty-four wastes context and buries the two that matter.

**Always read `CLAUDE.md` first.** It is short and it is the rules.

---

## By task

| Doing this | Read |
|---|---|
| **Joining the project** | `STUDY-GUIDE.md` → `WHY-AVEL-EXISTS.md` |
| **Building the frontend** | `DAY-ONE-FRONTEND.md` → `ROUTES.md` → `DATA-CONTRACTS-V2.md` |
| **Setting up the project** | `STACK-AND-RESOURCES.md` → `TECH-STACK.md` |
| **The render or export engine** | `GOLDEN-FIXTURE.md` → `BLAST-RADIUS.md` → `DATA-CONTRACTS-V2.md` |
| **Schema or migrations** | `DATA-CONTRACTS-V2.md` → `DECISIONS-V2.md` |
| **Agents, mounts, or dispatch** | `ROSTER-V2.md` → `SANDBOX.md` |
| **Where agents execute** | `SANDBOX.md` |
| **Design or UI** | `patches/globals-patch.css` → `DESIGN-PLUGINS.md` |
| **Running a mission** | `MISSION-001-COUNSELOS-SLICE-0.md` → `SURPRISES.md` → `COST-LOG.md` |
| **Anything about CounselOS** | `COUNSELOS-STATE.md` |
| **Proposing a change** | `DECISIONS-V2.md` first, always |
| **Wondering if a tool already exists** | `PRIOR-ART.md` |

---

## By question

**"What is AVEL?"** → `PRODUCT.md`

**"Why does it work this way?"** → `DECISIONS-V2.md`

**"What state is it actually in?"** → `STATE.md`. Nothing else states status.

**"What shape is this entity?"** → `DATA-CONTRACTS-V2.md`

**"Which agent owns this file?"** → `ROSTER-V2.md`, mount table

**"Has someone already built this?"** → `PRIOR-ART.md`

**"How do I not break things?"** → `DEV-TIPS.md`

---

## The full set

### Core — the system
| File | Owns |
|---|---|
| `PRODUCT.md` | The external pitch |
| `STATE.md` | **All** build status, counts, gaps |
| `DECISIONS-V2.md` | Rationale, trades, rejected ideas |
| `DATA-CONTRACTS-V2.md` | Entity shapes, contract structure |
| `TECH-STACK.md` | The tool list |
| `DOC-OWNERSHIP.md` | Which doc owns which fact |

### Agents and execution
| File | Owns |
|---|---|
| `ROSTER-V2.md` | Roster shape, cuts, mounts, edges |
| `SANDBOX.md` | Where agents run, isolation tiers, credential boundary |

### The gate
| File | Owns |
|---|---|
| `BLAST-RADIUS.md` | The pre-delivery preview |
| `CLIENT-CONTRACT-CONFORMANCE.md` | The unbuilt half of the alignment gate |
| `GOLDEN-FIXTURE.md` | The package the renderer must reproduce |

### Building
| File | Owns |
|---|---|
| `DAY-ONE-FRONTEND.md` | Tomorrow's checklist |
| `STACK-AND-RESOURCES.md` | What to install and when |
| `ROUTES.md` | The frontend route tree |
| `DEV-TIPS.md` | Build practice |

### Learning and evidence
| File | Owns |
|---|---|
| `STUDY-GUIDE.md` | Onboarding curriculum |
| `WHY-AVEL-EXISTS.md` | The market research behind the thesis |
| `PRIOR-ART.md` | Existing tools, what to adopt vs build |

### Missions
| File | Owns |
|---|---|
| `MISSION-001-COUNSELOS-SLICE-0.md` | Mission capture template |
| `SURPRISES.md` | Unpredicted agent behaviour, one line each |
| `COST-LOG.md` | Tokens and spend, per agent, per mission |
| `COUNSELOS-STATE.md` | CounselOS current state |

### Design
| File | Owns |
|---|---|
| `patches/globals-patch.css` | Token patch — radius, elevation, states, z-scale, gates |
| `DESIGN-PLUGINS.md` | Using design plugins without breaking mounts |
| `LOGO-BRIEF.md` | Logo and motion direction |

### Tooling
| File | Owns |
|---|---|
| `scripts/check-docs.sh` | Mechanical doc consistency check |

---

## Two rules about reading

**Load two or three, not twenty-four.** Every doc you load is context you are not spending on the work.

**If a doc contradicts the code, the code wins** — and that is a finding. Write it down before you fix anything. See `CLAUDE.md` rule 3.
