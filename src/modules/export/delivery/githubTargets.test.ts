import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	githubPrTarget,
	githubPushTarget,
	headBranchFor,
} from "#/modules/export/delivery/githubTargets";
import type { DeliveryContext } from "#/modules/export/delivery/types";
import type { WriteFetchLike } from "#/modules/export/gateway/types";
import { gitBlobSha } from "#/modules/export/git/gitBlobSha";

/**
 * No live call, ever. Removing the real fetch means a target that forgets its
 * injected one fails loudly here instead of writing to a real repository —
 * which is not a hypothetical for a module whose whole job is mutating
 * somebody else's code.
 */
beforeEach(() => {
	vi.stubGlobal("fetch", undefined);
});

const MISSION = "11111111-1111-4111-8111-111111111111";
const BASE_COMMIT = "c".repeat(40);
const BASE_TREE = "d".repeat(40);
const NEW_TREE = "e".repeat(40);
const NEW_COMMIT = "f".repeat(40);

const enc = (s: string) => new TextEncoder().encode(s);

const FILES = new Map<string, Uint8Array>([
	["MISSION.md", enc("# mission\n")],
	["mission/brief.md", enc("brief\n")],
]);

type Call = { url: string; method: string; body: unknown };

/**
 * Routes by endpoint rather than by call index, so a test asserting the
 * SEQUENCE is asserting something the script did not already force.
 */
function github(over: { refExists?: boolean } = {}) {
	const calls: Call[] = [];

	const fetchImpl: WriteFetchLike = async (url, init) => {
		const method = init?.method ?? "GET";
		const body = init?.body ? JSON.parse(init.body) : undefined;
		calls.push({ url, method, body });

		const reply = (status: number, json: unknown) => ({
			ok: status < 400,
			status,
			json: async () => json,
			headers: { get: () => null },
		});

		if (url.includes("/git/commits/") && method === "GET") {
			return reply(200, { sha: BASE_COMMIT, tree: { sha: BASE_TREE } });
		}
		if (url.endsWith("/git/blobs")) {
			// The gateway checks this against gitBlobSha of the bytes it sent and
			// refuses a mismatch, so the fake must be honest about content.
			const content = Buffer.from(String(body.content), "base64");
			return reply(201, { sha: gitBlobSha(new Uint8Array(content)) });
		}
		if (url.endsWith("/git/trees")) {
			return reply(201, { sha: NEW_TREE, truncated: false });
		}
		if (url.endsWith("/git/commits")) {
			return reply(201, { sha: NEW_COMMIT });
		}
		if (url.endsWith("/git/refs")) {
			if (over.refExists) {
				return reply(422, { message: "Reference already exists" });
			}
			return reply(201, { ref: body.ref, object: { sha: body.sha } });
		}
		if (url.includes("/git/refs/")) {
			return reply(200, {
				ref: body ? "refs/heads/main" : "",
				object: { sha: NEW_COMMIT },
			});
		}
		if (url.endsWith("/pulls")) {
			return reply(201, {
				number: 7,
				html_url: "https://github.com/o/r/pull/7",
			});
		}
		throw new Error(`unrouted ${method} ${url}`);
	};

	return { fetchImpl, calls };
}

const ctx = (over: Partial<DeliveryContext> = {}): DeliveryContext => ({
	files: FILES,
	snapshotSha256: "a".repeat(64),
	missionId: MISSION,
	sprintN: 3,
	target: { owner: "o", repo: "r", branch: "main" },
	baseCommitSha: BASE_COMMIT,
	message: "CounselOS slice 0",
	...over,
});

const auth = (fetchImpl: WriteFetchLike) => ({ token: "t0ken", fetchImpl });

describe("headBranchFor", () => {
	it("is deterministic and namespaced", () => {
		expect(headBranchFor(MISSION, 3)).toBe(`avel/mission-${MISSION}-sprint-3`);
		expect(headBranchFor(MISSION, 3)).toBe(headBranchFor(MISSION, 3));
	});
});

describe("githubPrTarget", () => {
	it("walks blobs, tree, commit, ref, pull request", async () => {
		const { fetchImpl, calls } = github();
		const out = await githubPrTarget(auth(fetchImpl)).deliver(ctx());

		expect(out).toEqual({
			kind: "github_pr",
			commitSha: NEW_COMMIT,
			prNumber: 7,
			prUrl: "https://github.com/o/r/pull/7",
		});

		const seq = calls.map((c) => `${c.method} ${c.url.split("/repos/o/r")[1]}`);
		expect(seq).toEqual([
			`GET /git/commits/${BASE_COMMIT}`,
			"POST /git/blobs",
			"POST /git/blobs",
			"POST /git/trees",
			"POST /git/commits",
			"POST /git/refs",
			"POST /pulls",
		]);
	});

	/**
	 * THE ONE THAT MATTERS. base_tree must be the TREE sha resolved through
	 * getCommit, never the commit sha we were handed. The trees endpoint echoes
	 * back a commit-ish, so the two are easy to confuse, and the failure mode of
	 * getting it wrong is a valid commit that deletes the client's codebase.
	 */
	it("sends the resolved tree sha as base_tree, not the commit sha", async () => {
		const { fetchImpl, calls } = github();
		await githubPrTarget(auth(fetchImpl)).deliver(ctx());

		const tree = calls.find((c) => c.url.endsWith("/git/trees"));
		expect((tree?.body as { base_tree: string }).base_tree).toBe(BASE_TREE);
		expect((tree?.body as { base_tree: string }).base_tree).not.toBe(
			BASE_COMMIT,
		);
	});

	it("parents the new commit on the base commit", async () => {
		const { fetchImpl, calls } = github();
		await githubPrTarget(auth(fetchImpl)).deliver(ctx());

		const commit = calls.find(
			(c) => c.url.endsWith("/git/commits") && c.method === "POST",
		);
		expect((commit?.body as { parents: string[] }).parents).toEqual([
			BASE_COMMIT,
		]);
	});

	/**
	 * An empty repository is the ONLY case where an absent base tree and a root
	 * commit are correct, and the two must agree — a root commit against a
	 * populated base, or no base with a parent, is incoherent.
	 *
	 * `base_tree` must be ABSENT from the body, not present-and-null. It is
	 * documented as an optional string, so omitting it is the specified way to
	 * say "no base"; an explicit null is undocumented, and this is the field
	 * where undocumented-but-probably-fine is not a trade worth making. Asserted
	 * with `in` rather than toBeUndefined() because the distinction that reaches
	 * the wire is whether the key exists at all.
	 */
	it("writes a root commit with no base tree into an empty repository", async () => {
		const { fetchImpl, calls } = github();
		await githubPrTarget(auth(fetchImpl)).deliver(ctx({ baseCommitSha: null }));

		expect(calls.some((c) => c.url.includes("/git/commits/"))).toBe(false);
		const tree = calls.find((c) => c.url.endsWith("/git/trees"));
		expect("base_tree" in (tree?.body as object)).toBe(false);
		const commit = calls.find(
			(c) => c.url.endsWith("/git/commits") && c.method === "POST",
		);
		expect((commit?.body as { parents: string[] }).parents).toEqual([]);
	});

	it("opens the pull request against the context's branch", async () => {
		const { fetchImpl, calls } = github();
		await githubPrTarget(auth(fetchImpl)).deliver(ctx());

		const pr = calls.find((c) => c.url.endsWith("/pulls"));
		const body = pr?.body as { head: string; base: string };
		expect(body.base).toBe("main");
		expect(body.head).toBe(headBranchFor(MISSION, 3));
	});

	/**
	 * A branch left by a previous attempt is surfaced, never repointed.
	 * Repointing is updateRef — the irreversible call — and moving a branch a
	 * reviewer may already be reading is not this layer's decision. A replay
	 * belongs to the idempotency key, one layer up.
	 */
	it("refuses to repoint a branch a previous attempt created", async () => {
		const { fetchImpl, calls } = github({ refExists: true });
		await expect(
			githubPrTarget(auth(fetchImpl)).deliver(ctx()),
		).rejects.toThrow(/already delivered|already exists/);

		expect(calls.some((c) => c.method === "PATCH")).toBe(false);
		expect(calls.some((c) => c.url.endsWith("/pulls"))).toBe(false);
	});
});

describe("githubPushTarget", () => {
	it("commits and moves the branch, opening no pull request", async () => {
		const { fetchImpl, calls } = github();
		const out = await githubPushTarget(auth(fetchImpl)).deliver(ctx());

		expect(out.kind).toBe("github_push");
		if (out.kind !== "github_push") return;
		expect(out.commitSha).toBe(NEW_COMMIT);

		expect(calls.some((c) => c.url.endsWith("/pulls"))).toBe(false);
		expect(calls.some((c) => c.url.endsWith("/git/refs"))).toBe(false);
		expect(calls.some((c) => c.method === "PATCH")).toBe(true);
	});

	/**
	 * Force is never sent as true by this target. A non-fast-forward push is
	 * GitHub's to refuse; the answer to a branch that moved is to re-preview,
	 * never to overwrite what arrived while we were rendering.
	 */
	it("never forces", async () => {
		const { fetchImpl, calls } = github();
		await githubPushTarget(auth(fetchImpl)).deliver(ctx());

		const patch = calls.find((c) => c.method === "PATCH");
		expect((patch?.body as { force?: boolean }).force).toBe(false);
	});

	it("refuses a context with no target repository", async () => {
		const { fetchImpl } = github();
		await expect(
			githubPushTarget(auth(fetchImpl)).deliver(ctx({ target: null })),
		).rejects.toThrow(/no target repository/);
	});
});
