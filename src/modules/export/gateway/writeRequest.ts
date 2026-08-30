import {
	GatewayError,
	type GitHubErrorBody,
	type WriteFetchLike,
	type WriteOptions,
} from "#/modules/export/gateway/types";

const API = "https://api.github.com";

/**
 * A STABLE MARKER, owned by this module, for the one 422 that is a state rather
 * than a fault: the ref a caller asked to create is already there.
 *
 * It exists because the caller genuinely needs to tell that case apart — a
 * retried delivery finds its own branch from the first attempt — and the only
 * signal GitHub gives is a message. Sniffing that message once, here, and
 * handing downstream a marker this project controls is the difference between
 * one place parsing GitHub's wording and every call site doing it. The code is
 * GITHUB_REJECTED: GitHub understood the request and refused it, and asking a
 * second time is refused identically. See isRefAlreadyExists in write.ts for
 * the predicate callers should branch on rather than reading this string.
 */
export const REF_ALREADY_EXISTS = "ref already exists";

/**
 * The write side's single IO edge, mirroring readTree's.
 *
 * Every call in this module goes through here, so the credential header, the
 * JSON encoding and the status-to-ErrorCode mapping exist once. A second copy
 * of the mapping is how two calls start disagreeing about what a 403 means.
 *
 * GET is allowed even though this module is the write side, for the one read
 * that exists only to feed a write: see getCommit. A GET carries no body and no
 * Content-Type, because a request that declares a JSON body and sends none is a
 * small lie that proxies occasionally take seriously.
 */
export async function githubRequest<T>(
	opts: WriteOptions,
	request: {
		method: "GET" | "POST" | "PATCH";
		path: string;
		body?: unknown;
	},
): Promise<T> {
	const doFetch: WriteFetchLike =
		opts.fetchImpl ?? (globalThis.fetch as unknown as WriteFetchLike);

	const url = `${API}/repos/${opts.owner}/${opts.repo}${request.path}`;
	const hasBody = request.body !== undefined;
	const headers: Record<string, string> = {
		Accept: "application/vnd.github+json",
		"X-GitHub-Api-Version": "2022-11-28",
		...(hasBody ? { "Content-Type": "application/json" } : {}),
		// Unconditional, unlike the read side. WriteOptions.token is required
		// because GitHub accepts no anonymous write.
		Authorization: `Bearer ${opts.token}`,
	};

	let res: Awaited<ReturnType<WriteFetchLike>>;
	try {
		res = await doFetch(url, {
			method: request.method,
			headers,
			...(hasBody ? { body: JSON.stringify(request.body) } : {}),
		});
	} catch (cause) {
		// A dropped connection before a response is the one case where we know
		// nothing was written, because nothing was acknowledged.
		throw new GatewayError(
			"EXTERNAL_GITHUB",
			`request failed: ${String(cause)}`,
		);
	}

	if (!res.ok) throw await toWriteGatewayError(res, opts, request);

	try {
		return (await res.json()) as T;
	} catch (cause) {
		// A 2xx whose body will not parse is worse here than on the read side: the
		// write HAPPENED and we cannot report what it produced. It still maps to a
		// contract code rather than escaping as a SyntaxError, and the detail says
		// which call it was so the operator can go and look.
		throw new GatewayError(
			"EXTERNAL_GITHUB",
			`${request.method} ${request.path} succeeded but its response was not JSON: ${String(cause)}`,
		);
	}
}

/** Best effort. An error body that will not parse must not mask the status. */
async function readErrorBody(res: {
	json: () => Promise<unknown>;
}): Promise<GitHubErrorBody> {
	try {
		const body = await res.json();
		return typeof body === "object" && body !== null
			? (body as GitHubErrorBody)
			: {};
	} catch {
		return {};
	}
}

/** Everything GitHub said, flattened for the detail string. Never parsed twice. */
function saidBy(body: GitHubErrorBody): string {
	return [body.message, ...(body.errors ?? []).map((e) => e.message)]
		.filter((s): s is string => Boolean(s))
		.join("; ");
}

async function toWriteGatewayError(
	res: {
		status: number;
		json: () => Promise<unknown>;
		headers: { get: (k: string) => string | null };
	},
	opts: WriteOptions,
	request: { method: string; path: string },
): Promise<GatewayError> {
	const body = await readErrorBody(res);
	const said = saidBy(body);
	const where = `${opts.owner}/${opts.repo}`;

	if (res.status === 404) {
		// The same non-distinction the read side makes and for the same reason:
		// GitHub returns 404 for a repository that does not exist AND for one this
		// credential cannot see, deliberately, so a private repo is not confirmed
		// to exist by its error code. We do not guess which.
		return new GatewayError(
			"REPO_NOT_FOUND",
			`no ${where} for ${request.method} ${request.path} — the repository, the object, or access to it, is missing`,
		);
	}

	if (res.status === 401 || res.status === 403) {
		const remaining = res.headers.get("x-ratelimit-remaining");
		const retryAfter = res.headers.get("retry-after");
		if (remaining === "0" || retryAfter) {
			const reset = res.headers.get("x-ratelimit-reset");
			return new GatewayError(
				"EXTERNAL_GITHUB",
				`rate limited${reset ? `, resets at ${new Date(Number(reset) * 1000).toISOString()}` : ""}`,
			);
		}
		return new GatewayError(
			"REPO_NO_ACCESS",
			`the credential in use cannot write to ${where}${said ? ` — ${said}` : ""}`,
		);
	}

	if (res.status === 409) {
		return new GatewayError("EMPTY_REPOSITORY", `${where} has no commits`);
	}

	if (res.status === 422) return classifyUnprocessable(said, where, request);

	return new GatewayError(
		"EXTERNAL_GITHUB",
		`GitHub returned ${res.status} for ${request.method} ${request.path}${said ? ` — ${said}` : ""}`,
	);
}

/**
 * 422 is the write side's only ambiguous status, and the only place in this
 * module that reads a message.
 *
 * That is against the project's own rule — "codes are the contract; messages
 * change freely" — and it is done because GitHub gives no machine-readable
 * discriminator here. One status covers "somebody pushed since you read the
 * tip", "that branch does not exist" and "that branch already exists", which
 * are a re-preview, a configuration error and a resumed delivery respectively.
 * The status alone cannot tell them apart.
 *
 * So: match on the phrases GitHub documents, and when nothing matches, fall
 * through to GITHUB_REJECTED rather than guess a specific code. Guessing sends
 * the operator to fix the wrong thing; GITHUB_REJECTED claims only what the
 * status itself already established, which is that the request was understood
 * and refused.
 */
function classifyUnprocessable(
	said: string,
	where: string,
	request: { method: string; path: string },
): GatewayError {
	const text = said.toLowerCase();

	if (text.includes("not a fast forward")) {
		// The tip moved between the preview and this write. This is exactly the
		// TOCTOU guard in BLAST-RADIUS.md, arriving from the far end instead of
		// from the staleness re-check: refuse and re-preview, never auto-retry.
		return new GatewayError(
			"PREVIEW_STALE",
			`${where} moved since the base commit was read, so the update was refused — re-run the preview against the current tip`,
		);
	}

	if (text.includes("reference already exists")) {
		// A THIRD meaning of 422 on the ref endpoints, distinct from the two above.
		// It must not reach either of them: it is the opposite of BRANCH_NOT_FOUND,
		// and reading it as PREVIEW_STALE would send the operator to re-run a
		// preview over a repository that has not moved.
		return new GatewayError(
			"GITHUB_REJECTED",
			`${REF_ALREADY_EXISTS}: the ref this request tried to create is already present in ${where}`,
		);
	}

	if (
		text.includes("reference does not exist") ||
		text.includes("field 'head' is invalid") ||
		text.includes("field 'base' is invalid")
	) {
		return new GatewayError(
			"BRANCH_NOT_FOUND",
			`a ref named in this request does not exist in ${where}${said ? ` — ${said}` : ""}`,
		);
	}

	// The ones this cannot name. GITHUB_REJECTED carries the meaning the detail
	// string used to have to spell out: understood, refused, and refused the same
	// way if sent again. The editorial is gone because the code says it now, and
	// the screen switches on the code and never reads this.
	return new GatewayError(
		"GITHUB_REJECTED",
		`GitHub refused ${request.method} ${request.path}: ${said || "no message given"}`,
	);
}
