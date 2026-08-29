import { MODE } from "#/modules/export/blast/types";
import type {
	DeliveryContext,
	DeliveryOutcome,
	DeliveryTarget,
} from "#/modules/export/delivery/types";
import type { WriteFetchLike } from "#/modules/export/gateway/types";
import {
	createBlob,
	createCommit,
	createPullRequest,
	createRef,
	createTree,
	getCommit,
	isRefAlreadyExists,
	updateRef,
} from "#/modules/export/gateway/write";
import { byCodepoint } from "#/modules/export/render/bytes";

/**
 * The two GitHub delivery targets.
 *
 * Both write into somebody else's repository, and by the time either runs every
 * guard in `guards.ts` has already passed. Neither decides anything: no
 * staleness check, no determinism comparison, no violation handling. They turn
 * an approved package into a commit.
 *
 * The credential is held by the TARGET, not by DeliveryContext. A context is a
 * plain data object that gets built, passed around and is a natural thing to
 * log; a token that lives in it leaks the first time someone prints one. These
 * are factories so the token is captured in a closure instead.
 */

export type GitHubAuth = {
	/** Server-side only. There is no anonymous write. */
	token: string;
	/** Injected for tests. Never a live call in the suite. */
	fetchImpl?: WriteFetchLike;
};

/**
 * The branch a PR is opened from.
 *
 * Deterministic, namespaced under `avel/`, and derived only from values that
 * identify this delivery. Two runs of the same sprint produce the same name,
 * which is what lets a retry be recognised rather than opening a second branch
 * beside the first.
 */
export function headBranchFor(missionId: string, sprintN: number): string {
	return `avel/mission-${missionId}-sprint-${sprintN}`;
}

/**
 * Package -> commit. The shared half of both targets.
 *
 * BLOBS ARE WRITTEN SEQUENTIALLY, not in parallel. GitHub's secondary rate
 * limit is triggered by concurrency rather than volume, and a package is tens
 * of files, so the wall-clock saving is small and the failure it buys is a
 * partially-written delivery. `createBlob` verifies each returned sha against
 * `gitBlobSha` of the bytes it sent, so a blob whose remote content differs
 * from what we rendered never reaches the tree.
 */
async function commitPackage(
	ctx: DeliveryContext,
	auth: GitHubAuth,
): Promise<{ commitSha: string }> {
	if (ctx.target === null) {
		throw new Error(
			"githubTargets: no target repository. A GitHub delivery needs owner, repo and branch.",
		);
	}
	const { owner, repo } = ctx.target;
	const opts = { owner, repo, token: auth.token, fetchImpl: auth.fetchImpl };

	/**
	 * THE BASE TREE. `ctx.baseCommitSha` is a COMMIT sha — verified against the
	 * live API, since `GET /git/trees/{branch}` echoes the resolved commit-ish
	 * rather than the tree's own sha — so it must be resolved to a tree before
	 * `createTree` sees it.
	 *
	 * Passing the commit sha straight through as `base_tree` appears to work and
	 * is undocumented. It is not worth it: this is the field whose failure mode
	 * is a valid commit that deletes the client's codebase.
	 *
	 * null is correct exactly once — the first commit into an empty repository,
	 * where `baseCommitSha` is null and there is no history to preserve.
	 */
	const base =
		ctx.baseCommitSha === null
			? null
			: await getCommit({ ...opts, sha: ctx.baseCommitSha });

	const entries = [];
	// Sorted so the request body is byte-stable across runs. GitHub does not
	// care about the order, but a stable body makes two deliveries of the same
	// package diffable, and costs nothing.
	for (const path of [...ctx.files.keys()].sort(byCodepoint)) {
		const bytes = ctx.files.get(path) as Uint8Array;
		const blob = await createBlob({ ...opts, content: bytes });
		entries.push({ path, mode: MODE.blob, sha: blob.sha });
	}

	const tree = await createTree({
		...opts,
		baseTree: base?.treeSha ?? null,
		entries,
	});

	const commit = await createCommit({
		...opts,
		message: ctx.message,
		tree: tree.sha,
		// An EMPTY parents array is a root commit. Correct only for the first
		// commit into an empty repository, which is the same condition that made
		// baseTree null — the two must not disagree.
		parents: ctx.baseCommitSha === null ? [] : [ctx.baseCommitSha],
	});

	return { commitSha: commit.sha };
}

/**
 * `github_pr` — commit the package to a fresh branch and open a pull request.
 *
 * The reviewable target. It never touches the base branch, so the client keeps
 * the final say; `pr-open` rather than `done` is the terminal status for that
 * reason.
 */
export function githubPrTarget(auth: GitHubAuth): DeliveryTarget {
	return {
		kind: "github_pr",

		async deliver(ctx: DeliveryContext): Promise<DeliveryOutcome> {
			if (ctx.target === null) {
				throw new Error("githubPrTarget: no target repository.");
			}
			const { owner, repo, branch } = ctx.target;
			const opts = {
				owner,
				repo,
				token: auth.token,
				fetchImpl: auth.fetchImpl,
			};

			const { commitSha } = await commitPackage(ctx, auth);
			const head = headBranchFor(ctx.missionId, ctx.sprintN);

			/**
			 * `createRef` takes the FULLY QUALIFIED `refs/heads/x`, while
			 * `updateRef` takes the short `heads/x` — GitHub's two ref endpoints
			 * genuinely disagree, and the gateway normalizes each to what its
			 * endpoint wants. Both accept either spelling from here. See the
			 * comment on CreateRefOptions.ref before "fixing" the inconsistency.
			 */
			try {
				await createRef({ ...opts, ref: `refs/heads/${head}`, sha: commitSha });
			} catch (error) {
				/**
				 * The branch already exists, which means this delivery ran before.
				 * That is a state rather than a fault, but it is NOT this layer's
				 * to resolve: repointing the branch is `updateRef`, the
				 * irreversible call, and silently moving a branch that a previous
				 * attempt may already have opened a PR from would rewrite what a
				 * reviewer is looking at.
				 *
				 * A replay is the idempotency key's job, one layer up, where the
				 * original Export row can be returned instead of delivering twice.
				 * Branching on the gateway's own predicate, never on message text.
				 */
				if (isRefAlreadyExists(error)) {
					throw new Error(
						`githubPrTarget: branch ${head} already exists in ${owner}/${repo}. This export was already delivered; resolve it by idempotency key rather than by repointing the branch.`,
						{ cause: error },
					);
				}
				throw error;
			}

			const pr = await createPullRequest({
				...opts,
				head,
				base: branch,
				title: ctx.message,
				body: `Rendered by AVEL for mission ${ctx.missionId}, sprint ${ctx.sprintN}.\n\nPackage sha256: \`${ctx.snapshotSha256}\``,
			});

			return {
				kind: "github_pr",
				commitSha,
				prNumber: pr.number,
				prUrl: pr.url,
			};
		},
	};
}

/**
 * `github_push` — commit the package straight onto the target branch.
 *
 * THE IRREVERSIBLE ONE. This is the target `checkPreviewRequired` refuses
 * without a linked preview, and the reason that refusal lives in a guard rather
 * than in a screen.
 */
export function githubPushTarget(auth: GitHubAuth): DeliveryTarget {
	return {
		kind: "github_push",

		async deliver(ctx: DeliveryContext): Promise<DeliveryOutcome> {
			if (ctx.target === null) {
				throw new Error("githubPushTarget: no target repository.");
			}
			const { owner, repo, branch } = ctx.target;

			const { commitSha } = await commitPackage(ctx, auth);

			const opts = {
				owner,
				repo,
				token: auth.token,
				fetchImpl: auth.fetchImpl,
			};

			/**
			 * AN EMPTY REPOSITORY HAS NO BRANCH TO MOVE, so the ref must be
			 * CREATED rather than updated.
			 *
			 * `commitPackage` already supports this case — a null base commit
			 * produces a root commit against no base tree — but the write here
			 * always PATCHed, and PATCH on a ref that does not exist is a 422 from
			 * GitHub. So the one case the commit path was explicitly built for
			 * could never complete: blobs, tree and commit were all written, then
			 * the delivery failed at the last call with BRANCH_NOT_FOUND.
			 *
			 * `createRef` is the additive call and cannot repoint anything, which
			 * is why it is safe to reach for here: if the branch turns out to
			 * exist, GitHub refuses rather than overwriting it.
			 */
			if (ctx.baseCommitSha === null) {
				const created = await createRef({
					...opts,
					ref: `refs/heads/${branch}`,
					sha: commitSha,
				});
				return { kind: "github_push", commitSha, ref: created.ref };
			}

			/**
			 * FORCE IS NOT PASSED, and that is the safety property of this target.
			 * The gateway defaults it to false and sends it explicitly. A
			 * non-fast-forward push is refused by GitHub and surfaces as the
			 * staleness code — which is correct: the branch moved under us, and
			 * the answer is to re-preview, never to overwrite what arrived.
			 */
			const ref = await updateRef({
				...opts,
				ref: `heads/${branch}`,
				sha: commitSha,
			});

			return { kind: "github_push", commitSha, ref: ref.ref };
		},
	};
}
