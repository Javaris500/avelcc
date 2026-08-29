import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { computeBlastRadius } from "#/modules/export/blast/computeBlastRadius";
import { parseTree } from "#/modules/export/gateway/parseTree";
import {
	DEFAULT_SCOPE,
	readTree,
	readTreeOrEmpty,
} from "#/modules/export/gateway/readTree";
import {
	type FetchLike,
	GatewayError,
	type GitHubTreeResponse,
} from "#/modules/export/gateway/types";
import { gitBlobSha } from "#/modules/export/git/gitBlobSha";

const fixture = (n: string): GitHubTreeResponse =>
	JSON.parse(
		readFileSync(`src/modules/export/gateway/__fixtures__/${n}.json`, "utf8"),
	);

/** Replay a recorded response. No network in any test in this file. */
function replay(
	body: unknown,
	status = 200,
	headers: Record<string, string> = {},
): FetchLike {
	return async () => ({
		ok: status >= 200 && status < 300,
		status,
		json: async () => body,
		headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
	});
}

describe("parseTree", () => {
	it("drops directory entries and keeps every blob", () => {
		// Recorded from expressjs/express: 281 entries, 213 blob + 68 tree.
		const raw = fixture("express");
		const blobs = raw.tree.filter((e) => e.type === "blob").length;
		const trees = raw.tree.filter((e) => e.type === "tree").length;
		expect(blobs).toBe(213);
		expect(trees).toBe(68);

		const parsed = parseTree(raw);
		expect(parsed.entries.size).toBe(blobs);
		for (const [path] of parsed.entries) {
			expect(raw.tree.find((e) => e.path === path)?.type).not.toBe("tree");
		}
	});

	it("keeps submodules, because a collision with one is a violation", () => {
		// Dropping them would silently downgrade SPECIAL_FILE_COLLISION to CREATE.
		const parsed = parseTree({
			sha: "abc",
			truncated: false,
			tree: [
				{ path: "vendor/lib", mode: "160000", type: "commit", sha: "deadbeef" },
				{ path: "src", mode: "040000", type: "tree", sha: "cafe" },
			],
		});
		expect([...parsed.entries.keys()]).toEqual(["vendor/lib"]);
		expect(parsed.entries.get("vendor/lib")?.mode).toBe("160000");
	});

	it("carries the commit sha through", () => {
		const raw = fixture("octocat-hello-world");
		expect(parseTree(raw).commitSha).toBe(raw.sha);
		expect(raw.sha).toBe("7fd1a60b01f91b314f59955a4e4d4e80d8edf11d");
	});
});

describe("readTree failure mapping", () => {
	const base = { owner: "o", repo: "r", ref: "main" };

	it("maps 404 to REPO_NOT_FOUND without guessing which cause", async () => {
		// GitHub returns 404 for a missing repo AND for a private repo the token
		// cannot see, deliberately. We do not invent a distinction.
		await expect(
			readTree({ ...base, fetchImpl: replay({}, 404) }),
		).rejects.toMatchObject({
			code: "REPO_NOT_FOUND",
		});
	});

	it("maps a rate limit to EXTERNAL_GITHUB, not to REPO_NO_ACCESS", async () => {
		// Both arrive as 403. Reading a rate limit as an access problem sends the
		// operator to check a credential that is fine.
		const f = replay({}, 403, {
			"x-ratelimit-remaining": "0",
			"x-ratelimit-reset": "1900000000",
		});
		const err = await readTree({ ...base, fetchImpl: f }).catch((e) => e);
		expect(err).toBeInstanceOf(GatewayError);
		expect(err.code).toBe("EXTERNAL_GITHUB");
		expect(err.detail).toContain("rate limited");
	});

	it("maps a plain 403 to REPO_NO_ACCESS", async () => {
		const f = replay({}, 403, { "x-ratelimit-remaining": "58" });
		await expect(readTree({ ...base, fetchImpl: f })).rejects.toMatchObject({
			code: "REPO_NO_ACCESS",
		});
	});

	it("maps 409 to EMPTY_REPOSITORY", async () => {
		await expect(
			readTree({ ...base, fetchImpl: replay({}, 409) }),
		).rejects.toMatchObject({
			code: "EMPTY_REPOSITORY",
		});
	});

	it("treats an empty repository as a STATE, not a failure", async () => {
		// BLAST-RADIUS: "Not an error. All CREATE."
		const tree = await readTreeOrEmpty({ ...base, fetchImpl: replay({}, 409) });
		expect(tree.entries.size).toBe(0);
		expect(tree.commitSha).toBe("");
	});

	it("maps a SECONDARY rate limit to EXTERNAL_GITHUB, not REPO_NO_ACCESS", async () => {
		// GitHub's abuse limit returns 403 with Retry-After and a NON-ZERO
		// remaining. Checking remaining alone sends the operator to rotate a
		// token that is perfectly valid.
		const f = replay({}, 403, {
			"x-ratelimit-remaining": "42",
			"retry-after": "60",
		});
		await expect(readTree({ ...base, fetchImpl: f })).rejects.toMatchObject({
			code: "EXTERNAL_GITHUB",
		});
	});

	it("maps a non-JSON 200 to EXTERNAL_GITHUB rather than letting it escape", async () => {
		// A proxy or maintenance page. The pre-flight error map is keyed on
		// ErrorCode and has nothing to render for a raw SyntaxError.
		const f: FetchLike = async () => ({
			ok: true,
			status: 200,
			json: async () => {
				throw new SyntaxError("Unexpected token <");
			},
			headers: { get: () => null },
		});
		await expect(readTree({ ...base, fetchImpl: f })).rejects.toMatchObject({
			code: "EXTERNAL_GITHUB",
		});
	});

	it("maps a thrown request to EXTERNAL_GITHUB, which is retryable", async () => {
		const f: FetchLike = async () => {
			throw new Error("ECONNRESET");
		};
		await expect(readTree({ ...base, fetchImpl: f })).rejects.toMatchObject({
			code: "EXTERNAL_GITHUB",
		});
	});
});

describe("truncation", () => {
	const base = { owner: "o", repo: "r", ref: "main" };

	it("re-prefixes scoped paths, because GitHub returns them RELATIVE", async () => {
		// VERIFIED LIVE: `master:lib` on expressjs/express returns "application.js",
		// NOT "lib/application.js". The previous version of this test had the fake
		// return an already-prefixed path — which GitHub never does — so it passed
		// against a gateway that was broken in production. A fake that encodes the
		// author's assumption tests the assumption, not the code.
		const calls: string[] = [];
		const f: FetchLike = async (url) => {
			calls.push(url);
			const scoped = url.includes(encodeURIComponent(`main:${DEFAULT_SCOPE}`));
			return {
				ok: true,
				status: 200,
				json: async () => ({
					// A scoped response's sha is the SUBTREE's, not the commit's.
					sha: scoped ? "subtree-sha" : "commit-sha",
					truncated: !scoped,
					tree: scoped
						? [
								{
									path: "MISSION.md",
									mode: "100644",
									type: "blob",
									sha: "x",
								},
							]
						: [],
				}),
				headers: { get: () => null },
			};
		};
		const tree = await readTree({ ...base, fetchImpl: f });
		expect(calls).toHaveLength(2);
		expect(calls[1]).toContain(encodeURIComponent(`main:${DEFAULT_SCOPE}`));
		// Re-prefixed, so computeBlastRadius can match a rendered path at all.
		expect([...tree.entries.keys()]).toEqual([".avel/MISSION.md"]);
		// And the COMMIT sha survives, not the subtree's — baseCommitSha feeds
		// staleness detection, so swapping them makes PREVIEW_STALE meaningless.
		expect(tree.commitSha).toBe("commit-sha");
	});

	it("fails with TREE_TOO_LARGE when even the scoped call truncates", async () => {
		const f = replay({ sha: "s", truncated: true, tree: [] });
		await expect(readTree({ ...base, fetchImpl: f })).rejects.toMatchObject({
			code: "TREE_TOO_LARGE",
		});
	});
});

describe("the normal path", () => {
	it("does not prefix when the tree is not truncated", async () => {
		const f = replay({
			sha: "c",
			truncated: false,
			tree: [{ path: "src/a.ts", mode: "100644", type: "blob", sha: "x" }],
		});
		const tree = await readTree({
			owner: "o",
			repo: "r",
			ref: "main",
			fetchImpl: f,
		});
		expect([...tree.entries.keys()]).toEqual(["src/a.ts"]);
		expect(tree.commitSha).toBe("c");
	});
});

describe("the credential boundary", () => {
	it("sends no Authorization header when no token is given", async () => {
		let seen: Record<string, string> | undefined;
		const f: FetchLike = async (_u, init) => {
			seen = init?.headers;
			return {
				ok: true,
				status: 200,
				json: async () => fixture("octocat-hello-world"),
				headers: { get: () => null },
			};
		};
		await readTree({ owner: "o", repo: "r", ref: "main", fetchImpl: f });
		expect(seen?.Authorization).toBeUndefined();
	});

	it("sends one when it is", async () => {
		let seen: Record<string, string> | undefined;
		const f: FetchLike = async (_u, init) => {
			seen = init?.headers;
			return {
				ok: true,
				status: 200,
				json: async () => fixture("octocat-hello-world"),
				headers: { get: () => null },
			};
		};
		await readTree({
			owner: "o",
			repo: "r",
			ref: "main",
			token: "t",
			fetchImpl: f,
		});
		expect(seen?.Authorization).toBe("Bearer t");
	});
});

describe("the join: readTree feeds computeBlastRadius", () => {
	it("classifies rendered files against a REAL recorded tree", () => {
		// This is the whole point of the gateway. Everything upstream of this
		// assertion is real: the tree is a recorded GitHub response, and the
		// blob SHAs are computed by our own gitBlobSha from actual bytes.
		const remote = parseTree(fixture("express"));

		const readmePath = [...remote.entries.keys()].find((p) =>
			p.toLowerCase().startsWith("readme"),
		);
		expect(readmePath).toBeDefined();

		const bytes = new TextEncoder().encode("# not the real readme\n");
		const rendered = [
			// same path, different content -> OVERWRITE
			{ path: readmePath as string, bytes, blobSha: gitBlobSha(bytes) },
			// a path express does not have -> CREATE
			{ path: ".avel/MISSION.md", bytes, blobSha: gitBlobSha(bytes) },
		];

		const out = computeBlastRadius(rendered, remote, {
			allowedPathPrefixes: [],
			declaredWritablePaths: ["**"],
		});

		expect(out.overwrite.map((f) => f.path)).toEqual([readmePath]);
		expect(out.create.map((f) => f.path)).toEqual([".avel/MISSION.md"]);
		// Everything else in express is untouched, and reported as a count.
		expect(out.preserveSummary.fileCount).toBe(remote.entries.size - 1);
	});
});
