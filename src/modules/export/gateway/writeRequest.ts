import {
	GatewayError,
	type GitHubErrorBody,
	type WriteFetchLike,
	type WriteOptions,
} from "#/modules/export/gateway/types";

const API = "https://api.github.com";

/**
 * The write side's single IO edge, mirroring readTree's.
 *
 * Every mutating call in this module goes through here, so the credential
 * header, the JSON encoding and the status-to-ErrorCode mapping exist once. A
 * second copy of the mapping is how two calls start disagreeing about what a
 * 403 means.
 */
export async function githubWrite<T>(
	opts: WriteOptions,
	request: { method: "POST" | "PATCH"; path: string; body: unknown },
): Promise<T> {
	const doFetch: WriteFetchLike =
		opts.fetchImpl ?? (globalThis.fetch as unknown as WriteFetchLike);

	const url = `${API}/repos/${opts.owner}/${opts.repo}${request.path}`;
	const headers: Record<string, string> = {
		Accept: "application/vnd.github+json",
		"X-GitHub-Api-Version": "2022-11-28",
		"Content-Type": "application/json",
		// Unconditional, unlike the read side. WriteOptions.token is required
		// because GitHub accepts no anonymous write.
		Authorization: `Bearer ${opts.token}`,
	};

	let res: Awaited<ReturnType<WriteFetchLike>>;
	try {
		res = await doFetch(url, {
			method: request.method,
			headers,
			body: JSON.stringify(request.body),
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
			`no ${where} for ${request.method} ${request.path} — the repository, or write access to it, is missing`,
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

	if (res.status === 422) return classifyUnprocessable(said, where);

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
 * tip" and "that branch does not exist", which are a re-preview and a
 * configuration error respectively. The status alone cannot tell them apart.
 *
 * So: match on the phrases GitHub documents, and when nothing matches, fall
 * through to EXTERNAL_GITHUB rather than guess a specific code. A wrong
 * specific code sends the operator to fix the wrong thing.
 */
function classifyUnprocessable(said: string, where: string): GatewayError {
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

	// UNMAPPED, and labelled as such rather than dressed up. ERROR_CODES is a
	// closed set with an exhaustiveness assertion behind it and holds no code
	// meaning "the request was rejected as invalid", so this borrows the only
	// catch-all there is. The detail says so, because EXTERNAL_GITHUB's own copy
	// promises the operator this is retryable and a 422 is not.
	return new GatewayError(
		"EXTERNAL_GITHUB",
		`unmapped 422 from GitHub, which is NOT retryable: ${said || "no message given"}`,
	);
}
