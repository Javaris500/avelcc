/**
 * Types for the blast radius computation.
 *
 * Shapes come from docs/BLAST-RADIUS.md. Where this file departs from the
 * type sketch in that document, the departure is marked and the reason given.
 */

/** The six violation codes. BLAST-RADIUS.md, "Violations - the hard failures". */
export type ViolationCode =
	| "PATH_OUTSIDE_ALLOWED"
	| "PATH_TRAVERSAL"
	| "SPECIAL_FILE_COLLISION"
	| "CASE_COLLISION"
	| "PROTECTED_PATH"
	| "OWNERSHIP_VIOLATION";

/**
 * A file as REPORTED. `size` is a byte count.
 *
 * Deliberately NOT the same shape as RenderedFile. The two carry different
 * things and previously shared the field name `bytes`, which is where the
 * ambiguity came from.
 */
export type FileEntry = {
	path: string;
	/** Byte count, derived from the rendered content. Never a caller-supplied number. */
	size: number;
	blobSha: string;
};

/**
 * A file in the rendered package. `bytes` is the CONTENT.
 *
 * The blob SHA is computed by the caller, so classification stays a SHA
 * comparison and this function hashes nothing. Content is present on the input;
 * that does not make the function impure and does not make it recompute.
 */
export type RenderedFile = {
	path: string;
	bytes: Uint8Array;
	blobSha: string;
};

export type OverwriteEntry = FileEntry & {
	remoteBlobSha: string;
	/** Best-effort; one commits call, may be omitted. */
	remoteLastModified?: string;
};

export type Violation = {
	code: ViolationCode;
	path: string;
	detail: string;
};

/** Git tree entry modes, as returned by the GitHub Trees API. */
export const MODE = {
	tree: "040000",
	blob: "100644",
	executable: "100755",
	symlink: "120000",
	submodule: "160000",
} as const;

export type RemoteTreeEntry = { sha: string; mode: string };

export type RemoteTree = {
	commitSha: string;
	entries: Map<string, RemoteTreeEntry>;
};

/**
 * The default for `allowedPathPrefixes`, stated in BLAST-RADIUS.md.
 *
 * Exported rather than applied silently: an empty `allowedPathPrefixes` means
 * nothing is allowed, not everything. Safe by absence, per DECISIONS-V2.md.
 * A caller that wants the default passes it.
 */
export const DEFAULT_ALLOWED_PATH_PREFIXES = [".avel/"];

/** Always protected, regardless of policy. BLAST-RADIUS.md, PROTECTED_PATH. */
export const ALWAYS_PROTECTED_PREFIXES = [".git/", ".github/workflows/"];

export type BlastRadiusPolicy = {
	/** Empty means nothing is allowed. See DEFAULT_ALLOWED_PATH_PREFIXES. */
	allowedPathPrefixes: string[];
	/** Glob patterns, the roster's `writable` set. Empty means nothing is writable. */
	declaredWritablePaths: string[];
	/**
	 * EXTENSION, not in the BLAST-RADIUS.md sketch. PROTECTED_PATH is specified
	 * as ".git/, .github/workflows/, or a repo-policy denylist", and the sketched
	 * policy shape carries no denylist. Optional, so the two-field shape in the
	 * doc still satisfies this type. Filed rather than assumed.
	 */
	denylist?: string[];
};

export type PreserveSummary = {
	fileCount: number;
	/**
	 * Top-level entries of the untouched set. Includes root-level FILES as the
	 * doc's own example does (`package.json`). No trailing slash. Sorted by
	 * codepoint. The field name is imprecise and is a known, filed issue.
	 */
	topLevelDirs: string[];
};

export type BlastRadiusTotals = {
	create: number;
	overwrite: number;
	unchanged: number;
	/** Counts violation ENTRIES, not distinct paths. One path may earn several. */
	violations: number;
};

/**
 * What the pure function returns.
 *
 * DEPARTURE FROM THE DOC, and a deliberate one. BLAST-RADIUS.md's `BlastRadius`
 * also carries `computedAt`, `baseRef`, `baseCommitSha` and `target`, none of
 * which can be derived from (rendered, remote, policy). `computedAt` in
 * particular is a clock reading inside a function the same document forbids from
 * reading a clock. The core is what the function can honestly produce; the
 * caller composes the envelope.
 */
export type BlastRadiusCore = {
	create: FileEntry[];
	overwrite: OverwriteEntry[];
	unchanged: FileEntry[];
	preserveSummary: PreserveSummary;
	violations: Violation[];
	totals: BlastRadiusTotals;
};

/** The envelope, assembled at the IO edge. `baseCommitSha` is null for an empty repository. */
export type BlastRadius = BlastRadiusCore & {
	computedAt: string;
	baseRef: string;
	baseCommitSha: string | null;
	target: { owner: string; repo: string; branch: string };
};
