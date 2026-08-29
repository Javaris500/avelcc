import type { RemoteTree } from "#/modules/export/blast/types";
import type { GitHubTreeResponse } from "#/modules/export/gateway/types";

export type ParseOptions = {
	/** Set when the response came from a path-scoped call. */
	prefix?: string;
	/** Overrides res.sha, which is the subtree's sha on a scoped call. */
	commitSha?: string;
};

/**
 * PURE. The whole point of splitting this out.
 *
 * The architecture is "pure core, IO at the edge" everywhere else, and there is
 * no reason a tree parser should need a network to be tested. Everything below
 * is a decision about SHAPE, and every one of those decisions is a place a bug
 * would be invisible against a live API — because a live API rarely returns the
 * awkward case on the day you are looking.
 */

/**
 * Directory entries are DROPPED.
 *
 * `computeBlastRadius` classifies FILES: a rendered path either exists remotely
 * or it does not. A `tree` entry is a container, not a file, and leaving them in
 * would inflate preserveSummary.fileCount — which is the number an operator
 * reads as "how much of my repository is untouched". Session 2 already excluded
 * mode 040000 from that count for the same reason; dropping them here means the
 * exclusion is not something two places have to remember.
 *
 * `commit` entries (mode 160000, submodules) are KEPT. They are not files
 * either, but a package path colliding with one is a SPECIAL_FILE_COLLISION
 * violation, and the classifier can only raise that if it can see the entry.
 * Dropping them would silently downgrade a violation to a CREATE.
 */
export function parseTree(
	res: GitHubTreeResponse,
	opts: ParseOptions = {},
): RemoteTree {
	const entries = new Map<string, { sha: string; mode: string }>();

	for (const e of res.tree) {
		if (e.type === "tree") continue;
		// A PATH-SCOPED call returns paths RELATIVE TO THE REQUESTED SUBTREE.
		// Verified against the live API: `master:lib` on expressjs/express
		// returns "application.js", NOT "lib/application.js". Storing those
		// unprefixed means computeBlastRadius looks up ".avel/MISSION.md",
		// finds nothing, and reports an OVERWRITE as a CREATE — precisely the
		// failure the truncation guard exists to prevent.
		const path = opts.prefix ? `${opts.prefix}/${e.path}` : e.path;
		entries.set(path, { sha: e.sha, mode: e.mode });
	}

	// A scoped call's `sha` is the SUBTREE's, not the commit's — also verified
	// live. baseCommitSha feeds staleness detection, so silently substituting a
	// subtree sha would make every PREVIEW_STALE comparison meaningless. The
	// caller passes the commit sha it already has from the root call.
	return { commitSha: opts.commitSha ?? res.sha, entries };
}

/**
 * An empty repository has no tree at all. BLAST-RADIUS.md is explicit that this
 * is "not an error": every rendered file is simply a CREATE.
 *
 * commitSha is the empty string rather than null because RemoteTree types it as
 * string. The envelope carries `baseCommitSha: string | null`, which is where
 * the nullability actually belongs — a tree that does not exist has no SHA, but
 * a parsed tree object still needs a field.
 */
export function emptyTree(): RemoteTree {
	return { commitSha: "", entries: new Map() };
}
