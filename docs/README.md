# AVEL — Documentation

Design and decision record for the AVEL Command Center and the agency that runs on it.

## Install

Drop this into the repo root:

```
your-repo/
├── CLAUDE.md          ← Claude Code reads this automatically
├── START-HERE.md      ← routing: which doc for which task
├── docs/              ← the set
├── scripts/
│   └── check-docs.sh
└── patches/
    └── globals-patch.css
```

Then:

```bash
chmod +x scripts/check-docs.sh
./scripts/check-docs.sh docs
```

Add to CI so doc drift fails the build:

```yaml
- name: Doc consistency
  run: ./scripts/check-docs.sh docs
```

## Reading order

1. `CLAUDE.md` — the rules. Short. Read it first, every session.
2. `START-HERE.md` — which two or three docs your task needs.
3. Those two or three. Not the rest.

## The one thing to know

Zero missions have run end to end through the platform. Every design claim in here is a hypothesis until measured.

`STATE.md` is the only document that states build status. Everything else links to it.
