import picomatch from "picomatch";

/**
 * computeCoherence — pure. No database, no network, no clock.
 *
 * DATA-CONTRACTS-V2.md:383: "The frontend calls it for live feedback on the
 * loadout screen; the export gate calls it for permission. Shared code, single
 * authority: a client that lies about coherence still cannot ship."
 *
 * DELIBERATELY VOCABULARY-AGNOSTIC. The playbook declares its own wave
 * sequence and this function takes waves[0] as the earliest. Whether a wave is
 * named "A" or "phase1" is data, not logic. That is what keeps this function
 * correct while D2 is unresolved: GOLDEN-FIXTURE.md says the full-build waves
 * are A/B/C/D, DATA-CONTRACTS-V2.md:391 says full-build "resolves to phase1",
 * and this implementation is right either way. It does NOT decide D2 — a
 * roster whose phases are A..D against a playbook declaring phase1 still
 * blocks, correctly, because no agent is in the earliest declared wave.
 */

export type AgentKind = "feature" | "horizontal";
export type AgentRuntime = "model" | "human" | "code";

export type CoherenceAgent = {
	slug: string;
	wave: string;
	kind: AgentKind;
	runtime: AgentRuntime;
	active: boolean;
	writable: string[];
};

export type CoherencePlaybook = {
	/** Ordered. Position 0 is the earliest wave. Never sorted. */
	waves: string[];
};

export type CoherenceBlock = {
	code: "no_agents_in_first_wave";
	reason: string;
	wave: string;
};

export type CoherenceWarning =
	| { code: "no_foundations_role"; reason: string }
	| { code: "no_verification_role"; reason: string }
	| {
			code: "writable_overlap";
			reason: string;
			agents: [string, string];
			witness: string;
	  }
	| { code: "empty_wave"; reason: string; wave: string };

export type Coherence = {
	block?: CoherenceBlock;
	warnings: CoherenceWarning[];
};

/**
 * Find a concrete path that BOTH glob sets match, or null.
 *
 * Full glob intersection is not decidable in general, so this unifies the two
 * patterns segment by segment to propose a candidate, then VERIFIES the
 * candidate with picomatch against both sets. Verification is what makes it
 * safe: a bug in the unifier can only cause a missed overlap, never a
 * fabricated one. A missed warning is acceptable. A false accusation that two
 * agents share a file is not.
 */

/** Turn a wildcard segment into a concrete one: "*.test.tsx" -> "w.test.tsx". */
function concreteSegment(seg: string): string {
	return seg.replace(/\*/g, "w").replace(/\?/g, "w");
}

function hasWildcard(seg: string): boolean {
	return seg.includes("*") || seg.includes("?");
}

/** Unify one segment from each pattern into a literal satisfying both. */
function unifySegment(a: string, b: string): string | null {
	const aWild = hasWildcard(a);
	const bWild = hasWildcard(b);
	if (!aWild && !bWild) return a === b ? a : null;
	if (!aWild) return picomatch.isMatch(a, b, { dot: true }) ? a : null;
	if (!bWild) return picomatch.isMatch(b, a, { dot: true }) ? b : null;
	// Both wildcards. Try each one's own concrete form against the other.
	for (const cand of [concreteSegment(a), concreteSegment(b)]) {
		if (
			picomatch.isMatch(cand, a, { dot: true }) &&
			picomatch.isMatch(cand, b, { dot: true })
		) {
			return cand;
		}
	}
	return null;
}

/**
 * `**` may absorb zero or more segments from the other side, so this branches.
 * Inputs are mount globs — a handful of segments each — so the search is small
 * and bounded by pattern length rather than by anything the caller supplies.
 */
function unify(a: string[], b: string[]): string[] | null {
	if (a.length === 0 && b.length === 0) return [];
	if (a.length === 0) return b.every((s) => s === "**") ? [] : null;
	if (b.length === 0) return a.every((s) => s === "**") ? [] : null;

	if (a[0] === "**") {
		for (let take = 0; take <= b.length; take++) {
			const rest = unify(a.slice(1), b.slice(take));
			if (rest !== null)
				return [...b.slice(0, take).map(concreteSegment), ...rest];
		}
		return null;
	}
	if (b[0] === "**") {
		for (let take = 0; take <= a.length; take++) {
			const rest = unify(a.slice(take), b.slice(1));
			if (rest !== null)
				return [...a.slice(0, take).map(concreteSegment), ...rest];
		}
		return null;
	}

	const head = unifySegment(a[0] as string, b[0] as string);
	if (head === null) return null;
	const tail = unify(a.slice(1), b.slice(1));
	return tail === null ? null : [head, ...tail];
}

function matchesAny(path: string, globs: string[]): boolean {
	return globs.some((g) => picomatch.isMatch(path, g, { dot: true }));
}

/** The first path both sets match, or null. Explicit comparator, no locale. */
function firstOverlap(a: string[], b: string[]): string | null {
	const found: string[] = [];
	for (const ga of a) {
		for (const gb of b) {
			const segs = unify(ga.split("/"), gb.split("/"));
			if (segs === null) continue;
			const path = segs.join("/");
			// Verified, never trusted: the unifier proposes, picomatch decides.
			if (matchesAny(path, a) && matchesAny(path, b)) found.push(path);
		}
	}
	return found.length === 0 ? null : (found.sort(byCodepoint)[0] as string);
}

function byCodepoint(x: string, y: string): number {
	return x < y ? -1 : x > y ? 1 : 0;
}

export function computeCoherence(
	agents: CoherenceAgent[],
	playbook: CoherencePlaybook,
): Coherence {
	const warnings: CoherenceWarning[] = [];
	const active = agents.filter((a) => a.active);

	// ── The hard block ────────────────────────────────────────────────────
	// "the mission must contain at least one active agent in the earliest wave
	// its playbook declares." Rendered as a block, not a warning, and it is the
	// only thing on the loadout screen that can prevent export.
	const earliest = playbook.waves[0];
	let block: CoherenceBlock | undefined;
	if (earliest === undefined) {
		block = {
			code: "no_agents_in_first_wave",
			reason:
				"The playbook declares no waves, so no earliest wave exists to staff.",
			wave: "",
		};
	} else if (!active.some((a) => a.wave === earliest)) {
		block = {
			code: "no_agents_in_first_wave",
			reason: `No active agent is assigned to wave ${earliest}, the earliest wave this playbook declares.`,
			wave: earliest,
		};
	}

	// ── Empty waves, playbook-relative ────────────────────────────────────
	for (const wave of playbook.waves.slice(1)) {
		if (!active.some((a) => a.wave === wave)) {
			warnings.push({
				code: "empty_wave",
				reason: `Wave ${wave} is declared by the playbook and has no active agent.`,
				wave,
			});
		}
	}

	// ── Cut coherence, DATA-CONTRACTS-V2.md:385-389 ───────────────────────
	// "a foundations role and a verification role are both assigned, and each
	// one's writable set is disjoint from every feature agent's writable set."
	//
	// "Cut coherence is path arithmetic, not an assertion." The disjointness half
	// is the part that matters: it enforces CLAUDE.md's "Testers never modify
	// code under test. Enforced by the mount, not by discipline." An agent that
	// can write the code it tests can make a failing test pass by changing the
	// code instead of fixing the bug.
	const features = active.filter((a) => a.kind === "feature");
	const horizontals = active.filter((a) => a.kind === "horizontal");

	if (horizontals.length === 0) {
		warnings.push({
			code: "no_foundations_role",
			reason:
				"No horizontal agent is assigned, so no role owns the seams between features.",
		});
	}
	if (
		earliest !== undefined &&
		!active.some((a) => a.wave !== earliest && a.kind === "horizontal")
	) {
		warnings.push({
			code: "no_verification_role",
			reason:
				"No horizontal agent is assigned after the earliest wave, so nothing verifies the features.",
		});
	}

	for (const h of [...horizontals].sort((a, b) =>
		byCodepoint(a.slug, b.slug),
	)) {
		for (const f of [...features].sort((a, b) => byCodepoint(a.slug, b.slug))) {
			const witness = firstOverlap(h.writable, f.writable);
			if (witness !== null) {
				warnings.push({
					code: "writable_overlap",
					reason: `${h.slug} and ${f.slug} are both writable on ${witness}. Owning territory disqualifies you from judging a seam.`,
					agents: [h.slug, f.slug],
					witness,
				});
			}
		}
	}

	return block ? { block, warnings } : { warnings };
}
