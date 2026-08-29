import type { ErrorCode } from "#/contract/shared/errors";

/**
 * The raw GitHub Git Trees response, narrowed to what we read.
 * https://docs.github.com/rest/git/trees#get-a-tree
 */
export type GitHubTreeEntry = {
	path: string;
	mode: string;
	type: "blob" | "tree" | "commit";
	sha: string;
	size?: number;
};

export type GitHubTreeResponse = {
	sha: string;
	tree: GitHubTreeEntry[];
	truncated: boolean;
};

/**
 * A gateway failure carries a CONTRACT error code, not an HTTP status.
 * BLAST-RADIUS.md: "Codes are the contract; messages change freely." The
 * pre-flight screen's error map is keyed on these, so a gateway that threw
 * raw statuses would force every screen to re-derive the mapping.
 */
export class GatewayError extends Error {
	readonly code: ErrorCode;
	/** Best-effort detail for the operator. Never parsed. */
	readonly detail: string;

	constructor(code: ErrorCode, detail: string) {
		super(`${code}: ${detail}`);
		this.name = "GatewayError";
		this.code = code;
		this.detail = detail;
	}
}

/** Injected so tests can replay a recorded response with no network. */
export type FetchLike = (
	url: string,
	init?: { headers?: Record<string, string> },
) => Promise<{
	ok: boolean;
	status: number;
	json: () => Promise<unknown>;
	headers: { get: (k: string) => string | null };
}>;

export type ReadTreeOptions = {
	owner: string;
	repo: string;
	/** A branch name or a commit SHA. */
	ref: string;
	fetchImpl?: FetchLike;
	/** Server-side only. Absent is legal: public repos need no token. */
	token?: string;
	/**
	 * Narrows the tree when the full one truncates. BLAST-RADIUS: "Fall back to
	 * a path-scoped tree call on `.avel/` only."
	 */
	scopePrefix?: string;
	/** Carried from the root call when retrying scoped; a scoped response`s sha is the subtree`s. */
	commitSha?: string;
};

/* ── the write side ──────────────────────────────────────────────────────── */

/**
 * The write side's injected fetch.
 *
 * A SEPARATE type from FetchLike, and only because FetchLike cannot express a
 * write: its init carries headers and nothing else, so there is no way to say
 * POST or to attach a body. FetchLike is unchanged and every existing caller is
 * untouched; a FetchLike is assignable to this, so one replay helper serves
 * both sides in tests. The response shape is identical on purpose.
 */
export type WriteFetchLike = (
	url: string,
	init?: {
		method?: string;
		headers?: Record<string, string>;
		body?: string;
	},
) => Promise<{
	ok: boolean;
	status: number;
	json: () => Promise<unknown>;
	headers: { get: (k: string) => string | null };
}>;

/**
 * Common to every write call. Mirrors ReadTreeOptions with one difference:
 * `token` is REQUIRED.
 *
 * ReadTreeOptions makes it optional because a public repository is readable
 * with no credential at all. No such case exists here — GitHub accepts no
 * anonymous write — so an optional token would be a shape that permits a call
 * which cannot succeed. The type refuses it instead of the server refusing it.
 */
export type WriteOptions = {
	owner: string;
	repo: string;
	/** Server-side only. Required: there is no anonymous write. */
	token: string;
	fetchImpl?: WriteFetchLike;
};

/** GitHub's error body, narrowed to the two fields it documents. */
export type GitHubErrorBody = {
	message?: string;
	errors?: Array<{ message?: string; field?: string; code?: string }>;
};

export type CreateBlobOptions = WriteOptions & {
	/** The bytes as rendered. Base64 encoding happens at the edge, not here. */
	content: Uint8Array;
};

export type CreatedBlob = { sha: string };

/** One entry in a tree write. `type` is always "blob"; AVEL writes files. */
export type TreeEntryInput = {
	path: string;
	/** MODE.blob for a normal file. Imported from the blast module, never restated. */
	mode: string;
	sha: string;
};

export type CreateTreeOptions = WriteOptions & {
	/**
	 * REQUIRED, and nullable rather than optional. This is the most dangerous
	 * field in the module.
	 *
	 * A tree written with no base contains ONLY the entries given, so the commit
	 * that points at it has lost every other file in the repository. That is not
	 * a corrupted write, it is a valid commit that deletes the client's codebase,
	 * and it is one forgotten property away. Optional would let a caller reach it
	 * by omission; `string | null` makes the caller say which one they mean.
	 *
	 * null is legitimate exactly once: the first commit in an empty repository.
	 */
	baseTree: string | null;
	entries: TreeEntryInput[];
};

export type CreatedTree = {
	sha: string;
	/**
	 * Describes GitHub's RESPONSE LISTING, not what was created. Surfaced rather
	 * than thrown on, because the tree is written either way and the caller is
	 * the one that knows whether it needed to read the entries back.
	 */
	truncated: boolean;
};

export type CreateCommitOptions = WriteOptions & {
	message: string;
	/** The tree sha from createTree. */
	tree: string;
	/**
	 * The commit shas this one descends from. An EMPTY array is a root commit
	 * with no history, correct only for the first commit in an empty repository.
	 */
	parents: string[];
};

export type CreatedCommit = { sha: string };

export type UpdateRefOptions = WriteOptions & {
	/** `heads/main`, or `refs/heads/main` — the leading `refs/` is normalized off. */
	ref: string;
	sha: string;
	/**
	 * FORCE DESTROYS HISTORY IN SOMEBODY ELSE'S REPOSITORY AND CANNOT BE UNDONE.
	 *
	 * Optional, defaulting to false, and never inferred from anything. The only
	 * way this reaches GitHub as true is a caller writing `force: true` at the
	 * call site, which is a line a reviewer can see.
	 */
	force?: boolean;
};

export type UpdatedRef = { ref: string; sha: string };

export type CreatePullRequestOptions = WriteOptions & {
	/** A branch in the SAME repository. Cross-repo `owner:branch` is not supported. */
	head: string;
	base: string;
	title: string;
	body?: string;
};

export type CreatedPullRequest = { number: number; url: string };

export type CreateRefOptions = WriteOptions & {
	/**
	 * `refs/heads/main`, or `heads/main` — the leading `refs/` is normalized ON.
	 *
	 * THE OPPOSITE OF UpdateRefOptions.ref, and not a mistake in either place.
	 * GitHub's two ref endpoints disagree: POST /git/refs takes the fully
	 * qualified name in its body and rejects the short form, while PATCH
	 * /git/refs/{ref} takes the short form in its path and 404s on the long one.
	 * Both calls accept either spelling here and each sends what its own endpoint
	 * wants, so the asymmetry is absorbed once rather than at every call site.
	 */
	ref: string;
	/** The commit the new ref points at. */
	sha: string;
};

/** Identical to UpdatedRef; named for the call that produced it. */
export type CreatedRef = UpdatedRef;

export type GetCommitOptions = WriteOptions & {
	/**
	 * A COMMIT SHA, not a ref. The git-database endpoint takes an object id and
	 * answers 404 for a branch name, which would surface as REPO_NOT_FOUND; the
	 * call guards the shape rather than letting that happen.
	 */
	sha: string;
};

/**
 * A commit, narrowed to the only field the delivery path needs.
 *
 * `treeSha` is lifted out rather than left nested at `tree.sha` so a caller
 * never reaches through GitHub's response shape to reach the one value it
 * wanted, and so the name says which kind of sha it is at every use site.
 */
export type FetchedCommit = { sha: string; treeSha: string };
