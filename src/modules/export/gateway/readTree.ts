import type { RemoteTree } from "#/modules/export/blast/types";
import { emptyTree, parseTree } from "#/modules/export/gateway/parseTree";
import {
	type FetchLike,
	GatewayError,
	type GitHubTreeResponse,
	type ReadTreeOptions,
} from "#/modules/export/gateway/types";

const API = "https://api.github.com";

/**
 * Read a repository tree. The IO edge — everything shape-related lives in
 * parseTree, which is pure.
 *
 * ONE REQUEST GIVES A COMPLETE CONTENT DIFF. Every entry carries a blob SHA,
 * and a git blob SHA is computable locally from rendered bytes. So a 20-file
 * package against a 3,000-file repository costs one request and downloads no
 * file. That is the whole reason the pre-flight screen can be honest about what
 * delivery would do without a backend.
 */
export async function readTree(opts: ReadTreeOptions): Promise<RemoteTree> {
	const { owner, repo, ref, token, scopePrefix, commitSha, fetchImpl } = opts;
	const doFetch: FetchLike =
		fetchImpl ?? (globalThis.fetch as unknown as FetchLike);

	const headers: Record<string, string> = {
		Accept: "application/vnd.github+json",
		"X-GitHub-Api-Version": "2022-11-28",
	};
	// Absent is legal. A public repository needs no token, which is what makes
	// this reachable with no credential boundary at all.
	if (token) headers.Authorization = `Bearer ${token}`;

	const target = scopePrefix ? `${ref}:${scopePrefix}` : ref;
	const url = `${API}/repos/${owner}/${repo}/git/trees/${encodeURIComponent(target)}?recursive=1`;

	let res: Awaited<ReturnType<FetchLike>>;
	try {
		res = await doFetch(url, { headers });
	} catch (cause) {
		// A DNS failure or a dropped connection is retryable and is not a
		// statement about the repository.
		throw new GatewayError(
			"EXTERNAL_GITHUB",
			`request failed: ${String(cause)}`,
		);
	}

	if (!res.ok) throw toGatewayError(res, owner, repo, ref);

	let body: GitHubTreeResponse;
	try {
		body = (await res.json()) as GitHubTreeResponse;
	} catch (cause) {
		// A proxy or maintenance page can return HTML with status 200. Letting a
		// SyntaxError escape breaks the contract: the pre-flight error map is
		// keyed on ErrorCode and has nothing to render for a raw parse failure.
		throw new GatewayError(
			"EXTERNAL_GITHUB",
			`response was not JSON: ${String(cause)}`,
		);
	}

	if (!body.truncated)
		return parseTree(body, { prefix: scopePrefix, commitSha });

	// TRUNCATED. GitHub caps a recursive tree at roughly 100k entries or 7MB and
	// then returns a PARTIAL list with truncated: true. Parsing it anyway would
	// be the worst possible failure here: missing entries read as "path does not
	// exist remotely", so every absent file classifies as CREATE and the operator
	// is told a destructive overwrite is a new file. A wrong preview is worse
	// than no preview, because it manufactures confidence.
	if (scopePrefix) {
		throw new GatewayError(
			"TREE_TOO_LARGE",
			`the tree is truncated even scoped to ${scopePrefix}, so what delivery would change cannot be computed`,
		);
	}

	// Retry scoped to the package directory only. Almost always well under the cap.
	// The COMMIT SHA IS CARRIED FROM THIS CALL: a scoped response's `sha` is the
	// subtree's, and baseCommitSha feeds staleness detection.
	return readTree({ ...opts, scopePrefix: DEFAULT_SCOPE, commitSha: body.sha });
}

/** The only directory AVEL writes. BLAST-RADIUS's fallback is scoped to it. */
export const DEFAULT_SCOPE = ".avel";

function toGatewayError(
	res: { status: number; headers: { get: (k: string) => string | null } },
	owner: string,
	repo: string,
	ref: string,
): GatewayError {
	if (res.status === 404) {
		// GitHub returns 404 both for "no such repository" and for "repository
		// exists but this token cannot see it" — deliberately, so a private repo
		// is not confirmed to exist by its error code. It also returns 404 for a
		// ref that does not exist in a repo we CAN see. We cannot distinguish
		// them from the status alone and do not guess.
		return new GatewayError(
			"REPO_NOT_FOUND",
			`no tree at ${owner}/${repo}@${ref} — the repository, the branch, or read access to it is missing`,
		);
	}
	if (res.status === 403 || res.status === 401) {
		const remaining = res.headers.get("x-ratelimit-remaining");
		// The SECONDARY (abuse) limit returns 403 with Retry-After and a NON-ZERO
		// remaining, so checking remaining alone sends the operator to rotate a
		// token that is fine — the exact misdirection the comment below forbids.
		const retryAfter = res.headers.get("retry-after");
		if (remaining === "0" || retryAfter) {
			const reset = res.headers.get("x-ratelimit-reset");
			// Rate limiting is not an access problem and must not read as one, or
			// the operator goes and checks a credential that is fine.
			return new GatewayError(
				"EXTERNAL_GITHUB",
				`rate limited${reset ? `, resets at ${new Date(Number(reset) * 1000).toISOString()}` : ""}`,
			);
		}
		return new GatewayError(
			"REPO_NO_ACCESS",
			`the credential in use cannot read ${owner}/${repo}`,
		);
	}
	if (res.status === 409) {
		// GitHub's answer for an empty repository. Not an error: everything is
		// a CREATE and the screen says so.
		return new GatewayError(
			"EMPTY_REPOSITORY",
			`${owner}/${repo} has no commits`,
		);
	}
	return new GatewayError("EXTERNAL_GITHUB", `GitHub returned ${res.status}`);
}

/**
 * The convenience wrapper the screen actually calls: an empty repository is a
 * STATE, not a failure, so it resolves to an empty tree rather than throwing.
 * Every other GatewayError still propagates with its contract code.
 */
export async function readTreeOrEmpty(
	opts: ReadTreeOptions,
): Promise<RemoteTree> {
	try {
		return await readTree(opts);
	} catch (e) {
		if (e instanceof GatewayError && e.code === "EMPTY_REPOSITORY")
			return emptyTree();
		throw e;
	}
}

export { emptyTree };
