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
