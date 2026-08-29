import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { MODE } from "#/modules/export/blast/types";
import {
	type FetchLike,
	GatewayError,
	type WriteFetchLike,
} from "#/modules/export/gateway/types";
import {
	createBlob,
	createCommit,
	createPullRequest,
	createRef,
	createTree,
	isRefAlreadyExists,
	toBase64,
	updateRef,
} from "#/modules/export/gateway/write";
import { gitBlobSha } from "#/modules/export/git/gitBlobSha";

/**
 * NO LIVE WRITES, ENFORCED RATHER THAN INTENDED.
 *
 * Every function under test mutates somebody else's repository. Passing a fake
 * fetch to each call is discipline, and discipline is what this project is a
 * defense against, so the real one is removed for the duration of this file: a
 * call that forgets its fetchImpl fails loudly instead of reaching GitHub.
 *
 * Fixture provenance is in __fixtures__/write/provenance.md. Those responses are
 * CONSTRUCTED from GitHub's documented schemas, not recorded, because recording
 * one would mean performing the write. The blob SHAs are the exception and come
 * from `git hash-object`.
 */
const realFetch = globalThis.fetch;
beforeAll(() => {
	globalThis.fetch = (() => {
		throw new Error("network disabled in write.test.ts");
	}) as typeof globalThis.fetch;
});
afterAll(() => {
	globalThis.fetch = realFetch;
});

const fixture = (n: string): unknown =>
	JSON.parse(
		readFileSync(
			`src/modules/export/gateway/__fixtures__/write/${n}.json`,
			"utf8",
		),
	);

const base = { owner: "o", repo: "r", token: "t" } as const;

type Call = {
	url: string;
	init?: { method?: string; headers?: Record<string, string>; body?: string };
};

/** Replay a response and keep what was sent. No network in any test here. */
function replay(
	body: unknown,
	status = 200,
	headers: Record<string, string> = {},
) {
	const calls: Call[] = [];
	const fetchImpl: WriteFetchLike = async (url, init) => {
		calls.push({ url, init });
		return {
			ok: status >= 200 && status < 300,
			status,
			json: async () => body,
			headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
		};
	};
	return { fetchImpl, calls };
}

const sentBody = (calls: Call[]): Record<string, unknown> =>
	JSON.parse(calls[0]?.init?.body ?? "{}");

/* ── bytes ───────────────────────────────────────────────────────────────── */

/**
 * Written as codepoint escapes, and constructed in the test rather than read
 * from disk. Both are deliberate. A CRLF fixture ON DISK is what core.autocrlf
 * rewrote the last time this repo lost a day to encoding, and a literal
 * non-ASCII character in a source file is what a shell codepage turned into
 * U+FFFD the time before that. Escapes state the exact bytes under test and no
 * tool in between can normalize them.
 *
 * UTF8_TEXT is: h, e-acute, space, em dash, space, the two CJK characters for
 * "world", space, the rocket (astral, so a surrogate pair), newline.
 */
const CRLF_TEXT = "line one\r\nline two\r\n";
const UTF8_TEXT = "héllo — 世界 \u{1f680}\n";

const CRLF = new TextEncoder().encode(CRLF_TEXT);
const UTF8 = new TextEncoder().encode(UTF8_TEXT);

/**
 * U+FFFD, built rather than typed. A literal replacement character in source
 * is indistinguishable from source that has itself already been corrupted,
 * which is precisely the failure this assertion is looking for.
 */
const REPLACEMENT_CHAR = String.fromCodePoint(0xfffd);

// From `git hash-object`, not from this codebase. See provenance.md.
const CRLF_SHA = "cf9b2a85b62bc2fd67c5ed43a1d0009df848ac8a";
const UTF8_SHA = "86a7b568d11a87bab070e35ccda8ee4eb12a2a43";

describe("base64 for the Blobs API", () => {
	it("round-trips CRLF without eating the carriage returns", () => {
		expect(CRLF.byteLength).toBe(20);
		// Decoded by Buffer, which is a DIFFERENT implementation from toBase64. A
		// round trip through one library only proves that library agrees with
		// itself.
		const back = new Uint8Array(Buffer.from(toBase64(CRLF), "base64"));
		expect([...back]).toEqual([...CRLF]);
		expect(new TextDecoder().decode(back)).toBe(CRLF_TEXT);
	});

	it("round-trips multi-byte and astral characters", () => {
		// THREE DIFFERENT NUMBERS for one string, which is the whole hazard:
		// 14 UTF-16 code units, 13 codepoints, 23 bytes. The rocket is a surrogate
		// pair, so .length and [...s].length disagree with each other before either
		// disagrees with the byte count. Any implementation that reaches for a
		// length other than the byte count produces something well-formed and
		// wrong. gitBlobSha's own comment cites the first and the third.
		expect(UTF8_TEXT.length).toBe(14);
		expect([...UTF8_TEXT].length).toBe(13);
		expect(UTF8.byteLength).toBe(23);
		const back = new Uint8Array(Buffer.from(toBase64(UTF8), "base64"));
		expect([...back]).toEqual([...UTF8]);
		expect(new TextDecoder().decode(back)).toBe(UTF8_TEXT);
		// And no replacement character survived the trip, which is the shape the
		// codepage fault took.
		expect(new TextDecoder().decode(back)).not.toContain(REPLACEMENT_CHAR);
	});

	it("agrees with git on the sha of those exact bytes", () => {
		expect(gitBlobSha(CRLF)).toBe(CRLF_SHA);
		expect(gitBlobSha(UTF8)).toBe(UTF8_SHA);
	});

	it("does not overflow on content larger than one chunk", () => {
		const big = new Uint8Array(0x8000 * 2 + 17).fill(0x61);
		expect(Buffer.from(toBase64(big), "base64").byteLength).toBe(big.length);
	});
});

/* ── createBlob ──────────────────────────────────────────────────────────── */

describe("createBlob", () => {
	it("sends the exact bytes base64-encoded and returns the sha", async () => {
		const { fetchImpl, calls } = replay(fixture("blob-utf8"));
		const out = await createBlob({ ...base, content: UTF8, fetchImpl });

		expect(out.sha).toBe(UTF8_SHA);
		expect(calls[0]?.url).toBe("https://api.github.com/repos/o/r/git/blobs");
		expect(calls[0]?.init?.method).toBe("POST");

		const body = sentBody(calls);
		expect(body.encoding).toBe("base64");
		// What went over the wire decodes back to what went in. Byte for byte.
		const sent = new Uint8Array(Buffer.from(String(body.content), "base64"));
		expect([...sent]).toEqual([...UTF8]);
	});

	it("carries CRLF through unchanged", async () => {
		const { fetchImpl, calls } = replay(fixture("blob-crlf"));
		const out = await createBlob({ ...base, content: CRLF, fetchImpl });
		expect(out.sha).toBe(CRLF_SHA);
		const sent = new Uint8Array(
			Buffer.from(String(sentBody(calls).content), "base64"),
		);
		expect([...sent]).toEqual([...CRLF]);
	});

	it("refuses a blob whose returned sha disagrees with the bytes sent", async () => {
		// The encoding-fault detector. If GitHub stored something other than what
		// we rendered, the blob must not reach a tree.
		const { fetchImpl } = replay({ sha: "0".repeat(40) });
		const err = await createBlob({ ...base, content: UTF8, fetchImpl }).catch(
			(e) => e,
		);
		expect(err).toBeInstanceOf(GatewayError);
		expect(err.detail).toContain(UTF8_SHA);
		expect(err.detail).toContain("disagrees");
	});

	it("always sends the credential", async () => {
		const { fetchImpl, calls } = replay(fixture("blob-utf8"));
		await createBlob({ ...base, content: UTF8, fetchImpl });
		expect(calls[0]?.init?.headers?.Authorization).toBe("Bearer t");
		expect(calls[0]?.init?.headers?.["Content-Type"]).toBe("application/json");
	});

	it("accepts a read-side FetchLike, so one fake serves both sides", async () => {
		// WriteFetchLike's comment CLAIMS this assignment compiles. A claim in a
		// comment is an attestation, so it is checked here instead: if the two
		// types ever stop being compatible, this line fails the build rather than
		// the comment quietly becoming false.
		const readOnly: FetchLike = async () => ({
			ok: true,
			status: 200,
			json: async () => fixture("blob-utf8"),
			headers: { get: () => null },
		});
		const asWrite: WriteFetchLike = readOnly;
		const out = await createBlob({
			...base,
			content: UTF8,
			fetchImpl: asWrite,
		});
		expect(out.sha).toBe(UTF8_SHA);
	});
});

/* ── createTree ──────────────────────────────────────────────────────────── */

describe("createTree", () => {
	const entries = [
		{ path: ".avel/MISSION.md", mode: MODE.blob, sha: CRLF_SHA },
	];
	const TREE = "cd8274d15fa3ae2ab983129fb037999f264ba9a7";

	it("sends base_tree when one is given, so untouched files survive", async () => {
		const { fetchImpl, calls } = replay(fixture("tree-created"));
		const out = await createTree({
			...base,
			baseTree: TREE,
			entries,
			fetchImpl,
		});

		expect(out.sha).toBe(TREE);
		expect(out.truncated).toBe(false);
		const body = sentBody(calls);
		expect(body.base_tree).toBe(TREE);
		expect(body.tree).toEqual([
			{ path: ".avel/MISSION.md", mode: "100644", type: "blob", sha: CRLF_SHA },
		]);
	});

	it("omits base_tree entirely when it is null, never sends null", async () => {
		// Correct only for a first commit into an empty repository, and the caller
		// has to say so. GitHub rejects an explicit null.
		const { fetchImpl, calls } = replay(fixture("tree-created"));
		await createTree({ ...base, baseTree: null, entries, fetchImpl });
		expect("base_tree" in sentBody(calls)).toBe(false);
	});

	it("uses MODE.blob rather than a restated literal", () => {
		expect(MODE.blob).toBe("100644");
	});
});

/* ── createCommit ────────────────────────────────────────────────────────── */

describe("createCommit", () => {
	it("sends message, tree and parents", async () => {
		const { fetchImpl, calls } = replay(fixture("commit-created"));
		const out = await createCommit({
			...base,
			message: "avel: mission 4 sprint 2",
			tree: "cd8274d15fa3ae2ab983129fb037999f264ba9a7",
			parents: ["a3f9c2107f0f4b1b3a1f0e6a1c2d3e4f5a6b7c8d"],
			fetchImpl,
		});

		expect(out.sha).toBe("7638417db6d59f3c431d3e1f261cc637155684cd");
		expect(calls[0]?.url).toBe("https://api.github.com/repos/o/r/git/commits");
		expect(sentBody(calls)).toEqual({
			message: "avel: mission 4 sprint 2",
			tree: "cd8274d15fa3ae2ab983129fb037999f264ba9a7",
			parents: ["a3f9c2107f0f4b1b3a1f0e6a1c2d3e4f5a6b7c8d"],
		});
	});
});

/* ── createRef ─────────────────────────────────────────────── */

describe("createRef", () => {
	const make = {
		...base,
		ref: "heads/avel/mission-4-sprint-2",
		sha: "7638417db6d59f3c431d3e1f261cc637155684cd",
	};

	it("sends the FULLY QUALIFIED ref, which is the opposite of updateRef", async () => {
		// The asymmetry worth absorbing: POST /git/refs rejects the short form in
		// its body, PATCH /git/refs/{ref} 404s on the long one in its path. A
		// caller passes whichever spelling they have and each call sends what its
		// own endpoint wants.
		const { fetchImpl, calls } = replay(fixture("ref-created"), 201);
		await createRef({ ...make, fetchImpl });

		expect(calls[0]?.url).toBe("https://api.github.com/repos/o/r/git/refs");
		expect(calls[0]?.init?.method).toBe("POST");
		expect(sentBody(calls)).toEqual({
			ref: "refs/heads/avel/mission-4-sprint-2",
			sha: "7638417db6d59f3c431d3e1f261cc637155684cd",
		});
	});

	it("leaves an already-qualified ref alone rather than doubling the prefix", async () => {
		const { fetchImpl, calls } = replay(fixture("ref-created"), 201);
		await createRef({ ...make, ref: "refs/heads/main", fetchImpl });
		expect(sentBody(calls).ref).toBe("refs/heads/main");
	});

	it("returns the ref and the commit it points at", async () => {
		const { fetchImpl } = replay(fixture("ref-created"), 201);
		const out = await createRef({ ...make, fetchImpl });
		expect(out).toEqual({
			ref: "refs/heads/avel/mission-4-sprint-2",
			sha: "7638417db6d59f3c431d3e1f261cc637155684cd",
		});
	});

	it("does NOT read an existing ref as PREVIEW_STALE or BRANCH_NOT_FOUND", async () => {
		// A third meaning of 422 on these endpoints. PREVIEW_STALE would send the
		// operator to re-preview a repository that has not moved, and
		// BRANCH_NOT_FOUND is the exact opposite of what happened.
		const { fetchImpl } = replay(fixture("error-ref-exists"), 422);
		const err = await createRef({ ...make, fetchImpl }).catch((e) => e);
		expect(err.code).not.toBe("PREVIEW_STALE");
		expect(err.code).not.toBe("BRANCH_NOT_FOUND");
		expect(err.detail).toContain("already present");
	});

	it("is recognisable by predicate, so no caller parses GitHub's wording", async () => {
		// A retried delivery finds the branch its own first attempt created. That
		// is a state the orchestration has to branch on, and the only signal
		// GitHub gives is a message — so the message is read once, in the
		// classifier, and callers read this instead.
		const { fetchImpl } = replay(fixture("error-ref-exists"), 422);
		const err = await createRef({ ...make, fetchImpl }).catch((e) => e);
		expect(isRefAlreadyExists(err)).toBe(true);
	});

	it("does not claim every failure is an existing ref", async () => {
		const { fetchImpl } = replay(fixture("error-unmapped"), 422);
		const err = await createRef({ ...make, fetchImpl }).catch((e) => e);
		expect(isRefAlreadyExists(err)).toBe(false);
		expect(isRefAlreadyExists(new Error("Reference already exists"))).toBe(
			false,
		);
		expect(isRefAlreadyExists(undefined)).toBe(false);
	});

	it("still maps the ordinary failures like every other call", async () => {
		const { fetchImpl } = replay({}, 404);
		await expect(createRef({ ...make, fetchImpl })).rejects.toMatchObject({
			code: "REPO_NOT_FOUND",
		});
	});
});

/* ── updateRef ───────────────────────────────────────────────────────────── */

describe("updateRef", () => {
	const ok = () => replay(fixture("ref-updated"));
	const move = {
		...base,
		ref: "heads/avel/mission-4-sprint-2",
		sha: "7638417db6d59f3c431d3e1f261cc637155684cd",
	};

	it("does not force unless asked, and says so on the wire", async () => {
		// The single most destructive option in the module. Absent must mean false
		// HERE, not "whatever GitHub's default is this year".
		const { fetchImpl, calls } = ok();
		await updateRef({ ...move, fetchImpl });
		expect(sentBody(calls).force).toBe(false);
		expect(calls[0]?.init?.method).toBe("PATCH");
	});

	it("does not force on any value that merely looks true", async () => {
		const { fetchImpl, calls } = ok();
		await updateRef({
			...move,
			// @ts-expect-error a caller reaching for force must pass a real boolean
			force: "yes",
			fetchImpl,
		});
		expect(sentBody(calls).force).toBe(false);
	});

	it("forces only on an explicit true", async () => {
		const { fetchImpl, calls } = ok();
		await updateRef({ ...move, force: true, fetchImpl });
		expect(sentBody(calls).force).toBe(true);
	});

	it("strips a leading refs/, which GitHub 404s on", async () => {
		const { fetchImpl, calls } = ok();
		await updateRef({ ...move, ref: "refs/heads/main", fetchImpl });
		expect(calls[0]?.url).toBe(
			"https://api.github.com/repos/o/r/git/refs/heads/main",
		);
	});

	it("keeps a branch name's slashes structural and escapes the rest", async () => {
		const { fetchImpl, calls } = ok();
		await updateRef({ ...move, ref: "heads/feature/a b", fetchImpl });
		expect(calls[0]?.url).toBe(
			"https://api.github.com/repos/o/r/git/refs/heads/feature/a%20b",
		);
	});

	it("returns the ref and the commit it now points at", async () => {
		const { fetchImpl } = ok();
		const out = await updateRef({ ...move, fetchImpl });
		expect(out.ref).toBe("refs/heads/avel/mission-4-sprint-2");
		expect(out.sha).toBe("7638417db6d59f3c431d3e1f261cc637155684cd");
	});

	it("maps a non-fast-forward to PREVIEW_STALE, not to a generic failure", async () => {
		// Somebody pushed between the preview and this write. BLAST-RADIUS.md's
		// TOCTOU guard, arriving from the far end: refuse and re-preview.
		const { fetchImpl } = replay(fixture("error-not-fast-forward"), 422);
		const err = await updateRef({ ...move, fetchImpl }).catch((e) => e);
		expect(err.code).toBe("PREVIEW_STALE");
		expect(err.detail).toContain("re-run the preview");
	});

	it("maps a missing reference to BRANCH_NOT_FOUND", async () => {
		const { fetchImpl } = replay(fixture("error-reference-missing"), 422);
		await expect(updateRef({ ...move, fetchImpl })).rejects.toMatchObject({
			code: "BRANCH_NOT_FOUND",
		});
	});
});

/* ── createPullRequest ───────────────────────────────────────────────────── */

describe("createPullRequest", () => {
	const pr = {
		...base,
		head: "avel/mission-4-sprint-2",
		base: "main",
		title: "AVEL: mission 4, sprint 2",
	};

	it("returns the number and the html url", async () => {
		const { fetchImpl, calls } = replay(fixture("pull-created"));
		const out = await createPullRequest({ ...pr, body: "rendered", fetchImpl });
		expect(out).toEqual({
			number: 1347,
			url: "https://github.com/o/r/pull/1347",
		});
		expect(calls[0]?.url).toBe("https://api.github.com/repos/o/r/pulls");
		expect(sentBody(calls)).toEqual({
			title: "AVEL: mission 4, sprint 2",
			head: "avel/mission-4-sprint-2",
			base: "main",
			body: "rendered",
		});
	});

	it("omits the body rather than sending undefined", async () => {
		const { fetchImpl, calls } = replay(fixture("pull-created"));
		await createPullRequest({ ...pr, fetchImpl });
		expect("body" in sentBody(calls)).toBe(false);
	});

	it("maps an invalid head to BRANCH_NOT_FOUND", async () => {
		const { fetchImpl } = replay(fixture("error-invalid-head"), 422);
		await expect(createPullRequest({ ...pr, fetchImpl })).rejects.toMatchObject(
			{ code: "BRANCH_NOT_FOUND" },
		);
	});
});

/* ── failure mapping, shared by every call ───────────────────────────────── */

describe("write failure mapping", () => {
	const blob = (fetchImpl: WriteFetchLike) =>
		createBlob({ ...base, content: UTF8, fetchImpl });

	it("maps 404 to REPO_NOT_FOUND without guessing which cause", async () => {
		await expect(blob(replay({}, 404).fetchImpl)).rejects.toMatchObject({
			code: "REPO_NOT_FOUND",
		});
	});

	it("maps 401 to REPO_NO_ACCESS", async () => {
		await expect(blob(replay({}, 401).fetchImpl)).rejects.toMatchObject({
			code: "REPO_NO_ACCESS",
		});
	});

	it("maps a plain 403 to REPO_NO_ACCESS", async () => {
		const { fetchImpl } = replay({ message: "Resource not accessible" }, 403, {
			"x-ratelimit-remaining": "58",
		});
		await expect(blob(fetchImpl)).rejects.toMatchObject({
			code: "REPO_NO_ACCESS",
		});
	});

	it("maps a rate limit to EXTERNAL_GITHUB, not to REPO_NO_ACCESS", async () => {
		const { fetchImpl } = replay({}, 403, {
			"x-ratelimit-remaining": "0",
			"x-ratelimit-reset": "1900000000",
		});
		const err = await blob(fetchImpl).catch((e) => e);
		expect(err.code).toBe("EXTERNAL_GITHUB");
		expect(err.detail).toContain("rate limited");
	});

	it("maps a secondary rate limit the same way", async () => {
		const { fetchImpl } = replay({}, 403, {
			"x-ratelimit-remaining": "42",
			"retry-after": "60",
		});
		await expect(blob(fetchImpl)).rejects.toMatchObject({
			code: "EXTERNAL_GITHUB",
		});
	});

	it("maps 409 to EMPTY_REPOSITORY", async () => {
		await expect(blob(replay({}, 409).fetchImpl)).rejects.toMatchObject({
			code: "EMPTY_REPOSITORY",
		});
	});

	it("maps 5xx to EXTERNAL_GITHUB", async () => {
		await expect(blob(replay({}, 502).fetchImpl)).rejects.toMatchObject({
			code: "EXTERNAL_GITHUB",
		});
	});

	it("labels an unmapped 422 as unmapped and not retryable", async () => {
		// ERROR_CODES is closed and holds nothing meaning "rejected as invalid".
		// The detail carries what the code cannot, rather than a code being
		// invented to carry it.
		const { fetchImpl } = replay(fixture("error-unmapped"), 422);
		const err = await blob(fetchImpl).catch((e) => e);
		expect(err.code).toBe("EXTERNAL_GITHUB");
		expect(err.detail).toContain("unmapped 422");
		expect(err.detail).toContain("NOT retryable");
		expect(err.detail).toContain("tree.sha is not a valid tree");
	});

	it("survives an error body that will not parse", async () => {
		const fetchImpl: WriteFetchLike = async () => ({
			ok: false,
			status: 500,
			json: async () => {
				throw new SyntaxError("Unexpected token <");
			},
			headers: { get: () => null },
		});
		await expect(blob(fetchImpl)).rejects.toMatchObject({
			code: "EXTERNAL_GITHUB",
		});
	});

	it("maps a non-JSON 2xx to a code and names the call", async () => {
		// The write happened and we cannot say what it produced. Letting a
		// SyntaxError escape leaves the caller with neither a code nor a hint.
		const fetchImpl: WriteFetchLike = async () => ({
			ok: true,
			status: 201,
			json: async () => {
				throw new SyntaxError("Unexpected token <");
			},
			headers: { get: () => null },
		});
		const err = await blob(fetchImpl).catch((e) => e);
		expect(err.code).toBe("EXTERNAL_GITHUB");
		expect(err.detail).toContain("/git/blobs");
	});

	it("maps a thrown request to EXTERNAL_GITHUB", async () => {
		const fetchImpl: WriteFetchLike = async () => {
			throw new Error("ECONNRESET");
		};
		await expect(blob(fetchImpl)).rejects.toMatchObject({
			code: "EXTERNAL_GITHUB",
		});
	});
});

describe("the network guard", () => {
	it("fails rather than reaching GitHub when no fetchImpl is given", async () => {
		// Proves both that the default path uses globalThis.fetch and that this
		// file's guard is actually installed.
		const err = await createBlob({ ...base, content: UTF8 }).catch((e) => e);
		expect(err).toBeInstanceOf(GatewayError);
		expect(err.code).toBe("EXTERNAL_GITHUB");
		expect(err.detail).toContain("network disabled");
	});
});
