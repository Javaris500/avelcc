#!/usr/bin/env bash
# check-docs.sh — mechanical doc-consistency gate for AVEL.
#
# Replaces the manual reconciliation protocol. Catches stale terminology,
# wrong counts, and build status leaking outside STATE.md.
#
# Usage:  ./scripts/check-docs.sh [docs_dir]     (default: docs)
# CI:     exit 1 on any finding.
#
# It cannot catch semantic drift — two docs describing one mechanism
# differently in fresh words. That still needs reading.

set -uo pipefail

DOCS="${1:-docs}"
FAIL=0
SELF="$(basename "${BASH_SOURCE[0]}")"

# Files exempt from the denylist: they legitimately name stale terms.
EXEMPT_RE='(DOC-OWNERSHIP\.md|CHANGELOG\.md)$'

# Lines exempt anywhere. Two forms:
#   - a "Stale markers:" declaration line
#   - an explicit inline escape: <!--allow-stale-->
# The escape is deliberate and greppable. A doc that legitimately names a dead
# term (a decision record explaining what was replaced, a negation like
# 'never "25 AI agents"') marks the line; everything else fails.
LINE_EXEMPT_RE='(<!--allow-stale-->|[Ss]tale markers?:)'

red()  { printf '\033[31m%s\033[0m\n' "$1"; }
grn()  { printf '\033[32m%s\033[0m\n' "$1"; }
ylw()  { printf '\033[33m%s\033[0m\n' "$1"; }

fail() { red "  ✗ $1"; FAIL=1; }
pass() { grn "  ✓ $1"; }

if [[ ! -d "$DOCS" ]]; then
  red "docs directory not found: $DOCS"; exit 2
fi

# Collect target files once.
mapfile -t FILES < <(find "$DOCS" -name '*.md' -type f | grep -Ev "$EXEMPT_RE" | sort)
if [[ ${#FILES[@]} -eq 0 ]]; then
  red "no markdown files found in $DOCS"; exit 2
fi

# ---------------------------------------------------------------------------
# 1. Stale-term denylist
# ---------------------------------------------------------------------------
echo
echo "1. Stale terminology"

# term :: human-readable replacement
# NOTE: delimiter is '::' not '|' — '|' collides with regex alternation and
# silently truncated the count patterns when this was first written.
DENY=(
  'tRPC::ts-rest'
  'Supabase::Neon'
  'bytea::R2 / snapshot_key'
  'skippable::gates are mandatory|warn; bypass is gate_override'
  '25 AI agents::18 build + 1 human orchestrator + a support app'
  '\bADR-01[0-9]\b::decisions live in DECISIONS-V2.md, not numbered ADRs'
  '(thirteen|13) (core )?(V1 )?entities::twelve'
  '(nineteen|19) build agents::18 build agents (19 files, incl. the orchestrator)'
  '(ten|eleven|10|11) (core )?entities::twelve'
  'Capability(-as-an-entity| as its own entity)::Skill.type = .capability.'
)

for entry in "${DENY[@]}"; do
  term="${entry%%::*}"
  repl="${entry##*::}"
  hits=$(grep -rniE "$term" "${FILES[@]}" 2>/dev/null | grep -vE "$LINE_EXEMPT_RE" || true)
  if [[ -n "$hits" ]]; then
    fail "stale term /$term/ → should be: $repl"
    echo "$hits" | sed 's/^/      /'
  fi
done
[[ $FAIL -eq 0 ]] && pass "no stale terms"

# ---------------------------------------------------------------------------
# 2. Capability must be described as declarative
# ---------------------------------------------------------------------------
echo
echo "2. Capability framing"

cap_hits=$(grep -rniE 'capabilit(y|ies) (are|is) what' "${FILES[@]}" 2>/dev/null || true)
if [[ -n "$cap_hits" ]]; then
  # Any such sentence must be within 2 lines of 'declare' or 'not enforce'
  while IFS= read -r line; do
    f="${line%%:*}"
    if ! grep -qiE 'declar|does not enforce|not enforce' "$f"; then
      fail "$f describes Capability without stating it declares rather than enforces"
    fi
  done <<< "$cap_hits"
fi
grep -rqiE 'permission boundary|enforces a tool|restricts the tool' "${FILES[@]}" 2>/dev/null \
  && fail "a doc implies Capability enforces; it declares only" \
  || pass "Capability framed as declarative"

# ---------------------------------------------------------------------------
# 3. Build status must live only in STATE.md
# ---------------------------------------------------------------------------
echo
echo "3. Status containment"

STATUS_RE='(zero missions|no mission has run|export engine (is )?(un|not )started|[0-9]+ of (19|nineteen) agent|not started —|171 tests)'
status_leaks=$(grep -rniE "$STATUS_RE" "${FILES[@]}" 2>/dev/null \
  | grep -v 'STATE\.md' \
  | grep -vE 'STATE\.md|see .STATE|link' || true)

if [[ -n "$status_leaks" ]]; then
  ylw "  ! build status appears outside STATE.md:"
  echo "$status_leaks" | sed 's/^/      /'
  ylw "    (allowed in PRODUCT.md's status section; anywhere else, link to STATE.md)"
  # Warn-only unless it is in a shapes/stack doc, where it is always wrong.
  hard=$(echo "$status_leaks" | grep -E 'DATA-CONTRACTS|TECH-STACK' || true)
  [[ -n "$hard" ]] && fail "status in a shapes/stack doc — must link to STATE.md instead"
else
  pass "status contained"
fi

# ---------------------------------------------------------------------------
# 4. Required documents exist
# ---------------------------------------------------------------------------
echo
echo "4. Required documents"

REQUIRED=(PRODUCT.md STATE.md DECISIONS-V2.md DATA-CONTRACTS-V2.md TECH-STACK.md DOC-OWNERSHIP.md)
for r in "${REQUIRED[@]}"; do
  [[ -f "$DOCS/$r" ]] || fail "missing required doc: $r"
done

# Referenced-but-absent docs
refs=$(grep -rhoE '`[A-Z][A-Z0-9-]+\.md`' "${FILES[@]}" 2>/dev/null | tr -d '`' | sort -u)
for r in $refs; do
  if [[ ! -f "$DOCS/$r" ]]; then
    ylw "  ! referenced but absent: $r"
  fi
done
pass "required docs present"

# ---------------------------------------------------------------------------
# 5. Epistemic markers present
# ---------------------------------------------------------------------------
echo
echo "5. Epistemic markers"

for f in "$DOCS/PRODUCT.md"; do
  [[ -f "$f" ]] || continue
  if ! grep -qE '\[(built|specced|hypothesis|attestation|unspecified)\]' "$f"; then
    fail "$(basename "$f") carries no epistemic markers"
  else
    pass "$(basename "$f") marked"
  fi
done

# ---------------------------------------------------------------------------
# 6. Uncited statistics in PRODUCT.md
# ---------------------------------------------------------------------------
echo
echo "6. Uncited figures"

if [[ -f "$DOCS/PRODUCT.md" ]]; then
  # Numbers with % or 'x' outside the Sources section, without a nearby marker
  body=$(sed '/^## Sources/,$d' "$DOCS/PRODUCT.md")
  nums=$(echo "$body" | grep -nE '[0-9]+ ?%|[0-9]+×|[0-9]+ times' | grep -viE '\[hypothesis\]|pending citation' || true)
  if [[ -n "$nums" ]]; then
    fail "uncited figures in PRODUCT.md body:"
    echo "$nums" | sed 's/^/      /'
  else
    pass "no uncited figures"
  fi
fi

# ---------------------------------------------------------------------------
echo
if [[ $FAIL -eq 0 ]]; then
  grn "docs OK"
else
  red "docs check FAILED"
fi
exit $FAIL
