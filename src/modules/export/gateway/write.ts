import { MODE } from "#/modules/export/blast/types";
import type {
	CreateBlobOptions,
	CreateCommitOptions,
	CreatedBlob,
	CreatedCommit,
	CreatedPullRequest,
	CreatedRef,
	CreatedTree,
	CreatePullRequestOptions,
	CreateRefOptions,
	CreateTreeOptions,
	FetchedCommit,
	GetCommitOptions,
	UpdatedRef,
	UpdateRefOptions,
} from "#/modules/export/gateway/types";
import { GatewayError } from "#/modules/export/gateway/types";
import {
	githubRequest,
	REF_ALREADY_EXISTS,
} from "#/modules/export/gateway/writeRequest";
import { gitBlobSha } from "#/modules/export/git/gitBlobSha";

/**
 * The GitHub WRITE gateway: the calls that turn a rendered file map into a
 * commit, and a commit into a pull request.
 *
 * The read side answers "what would delivery do". This side does it. Every
 * function here mutates somebody else's repository, so the shape of the module
 * is defensive on purpose: the destructive options are required or explicit,
 * never inferred and never reachable by omission.
 *
 * NOTHING IN THIS FILE IS TESTED AGAINST A LIVE REPOSITORY. Every test replays
 * a response; see __fixtures__/write/provenance.md for what those responses are
 * and where their shapes come from.
 */

/**
 * Base64 for the Git Blobs API, which takes no other encoding for bytes.
 *
 * Deliberately not Buffer, so the encoder and the decoder the tests check it
 * with are independent implementations — a round trip through one library
 * proves that library is self-consistent and nothing else. Chunked because
 * String.fromCharCode(...spread) overflows the stack somewhere around a
 * hundred thousand bytes, which is a size real files reach.
 */
export function toBase64(bytes: Uint8Array): string {
	const CHUNK = 0x8000;
	let binary = "";
	for (let i = 0; i < bytes.length; i += CHUNK) {
		binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
	}
	return btoa(binary);
}

/**
 * Write one file's bytes as a git blob.
 *
 * The returned sha is CHECKED against the one computed locally from the same
 * bytes. gitBlobSha is verified against `git hash-object` on ten real files, so
 * a disagreement means the bytes GitHub stored are not the bytes we rendered —
 * an encoding fault somewhere between here and there. This repo has been bitten
 * by that class twice: core.autocrlf rewriting a fixture before hashing, and a
 * shell codepage storing U+FFFD in place of an em dash. Both were found late.
 * This finds it at the moment it happens, on the one call where the correct
 * bytes are still in hand.
 */
export async function createBlob(
	opts: CreateBlobOptions,
): Promise<CreatedBlob> {
	const expected = gitBlobSha(opts.content);

	const created = await githubRequest<{ sha: string }>(opts, {
		method: "POST",
		path: "/git/blobs",
		body: { content: toBase64(opts.content), encoding: "base64" },
	});

	if (created.sha !== expected) {
		/*
		 * A DELIBERATE COMPROMISE, not a categorisation. Read this before changing
		 * it, because the code is knowingly imprecise and was chosen anyway.
		 *
		 * GITHUB_REJECTED's title says "GitHub refused this request", and that is
		 * FALSE here. GitHub refused nothing: it accepted the blob and answered
		 * with a sha that disagrees with the bytes we sent. The honest code would
		 * be a distinct one meaning "the remote stored something other than what we
		 * sent", and ERROR_CODES does not have it.
		 *
		 * Of the codes that do exist, this is the least wrong. EXTERNAL_GITHUB,
		 * which this used to throw, is wrong in the part that changes what the
		 * operator DOES: it presents as recoverable and offers a retry, and a retry
		 * re-sends the same bytes through the same encoding to get the same answer.
		 * GITHUB_REJECTED is wrong only in its title, while its severity (loud),
		 * its recovery (none) and its copy — very likely a fault in how the
		 * delivery was built, needs filing — describe this failure exactly.
		 *
		 * So: wrong noun, right consequence, and the consequence is the half an
		 * operator acts on. A distinct code is filed as a candidate; if one lands,
		 * this is its first caller.
		 *
		 * Refusing is the part that is not a compromise. gitBlobSha is verified
		 * against `git hash-object` on ten real files, so a disagreement means the
		 * bytes GitHub stored are not the bytes we rendered, and a blob we cannot
		 * vouch for must never reach a tree.
		 */
		throw new GatewayError(
			"GITHUB_REJECTED",
			`blob sha disagrees: sent ${opts.content.byteLength} bytes hashing to ${expected}, GitHub returned ${created.sha}`,
		);
	}

	return { sha: created.sha };
}

/** Hex object id. A ref reaches the wrong endpoint and 404s misleadingly. */
const COMMIT_SHA = /^[0-9a-f]{7,40}$/i;

/**
 * Read a commit to get its TREE sha. The one read in the write gateway, and it
 * exists for exactly one reason.
 *
 * createTree's baseTree must be a TREE sha and the read side does not carry
 * one. RemoteTree.commitSha holds a COMMIT sha: GitHub's trees endpoint echoes
 * back the resolved commit rather than the tree it points at, so the two values
 * differ and that field is correctly named. Nothing else converts between them.
 *
 * WITHOUT THIS CALL there are two ways to fill baseTree and both are worse.
 * Passing the commit sha and letting GitHub resolve it is undocumented, on the
 * one field whose failure mode is a valid commit that deletes the client's
 * codebase. Passing null and rebuilding from readTree's listing is worse still:
 * readTree falls back to a .avel-scoped call when the full tree truncates, so
 * on exactly the large repositories where this matters the listing is PARTIAL,
 * and a tree built from a partial listing deletes every file outside .avel.
 */
export async function getCommit(
	opts: GetCommitOptions,
): Promise<FetchedCommit> {
	if (!COMMIT_SHA.test(opts.sha)) {
		// NOT a GatewayError, and the only throw in this module that is not one.
		// A caller handing this a branch name is a bug in our own code, not
		// something GitHub reported. The endpoint would answer 404, which maps to
		// REPO_NOT_FOUND and sends an operator to check a repository that is
		// perfectly fine. ERROR_CODES has nothing meaning "the caller passed the
		// wrong kind of thing" and an operator should never see this at all.
		throw new Error(
			`getCommit takes a commit sha, not a ref: received ${JSON.stringify(opts.sha)}`,
		);
	}

	const commit = await githubRequest<{ sha: string; tree: { sha: string } }>(
		opts,
		{ method: "GET", path: `/git/commits/${opts.sha}` },
	);
	return { sha: commit.sha, treeSha: commit.tree.sha };
}

/**
 * Assemble blobs into a tree.
 *
 * `baseTree` carries the entire safety of this call and is required-but-
 * nullable for that reason; see the comment on CreateTreeOptions. Passing the
 * current commit's tree preserves every file AVEL is not writing. Passing null
 * writes a tree containing only these entries, which is a valid commit that
 * deletes everything else.
 */
export async function createTree(
	opts: CreateTreeOptions,
): Promise<CreatedTree> {
	const tree = opts.entries.map((entry) => ({
		path: entry.path,
		mode: entry.mode,
		// AVEL writes files. A directory is implied by a path containing a slash,
		// never declared, and a "tree" entry here would need a tree sha instead.
		type: "blob" as const,
		sha: entry.sha,
	}));

	const created = await githubRequest<{ sha: string; truncated?: boolean }>(
		opts,
		{
			method: "POST",
			path: "/git/trees",
			// OMITTED, never sent as null. base_tree is documented as an optional
			// string, so absent is the specified way to say "no base"; an explicit
			// null is undocumented, and guessing at undocumented behaviour is the
			// exact trade this field is too dangerous for. Not verified against the
			// live API either way, because verifying it means performing a write.
			body:
				opts.baseTree === null ? { tree } : { base_tree: opts.baseTree, tree },
		},
	);

	return { sha: created.sha, truncated: created.truncated === true };
}

/** The commit object. `parents: []` is a root commit; see CreateCommitOptions. */
export async function createCommit(
	opts: CreateCommitOptions,
): Promise<CreatedCommit> {
	const created = await githubRequest<{ sha: string }>(opts, {
		method: "POST",
		path: "/git/commits",
		body: { message: opts.message, tree: opts.tree, parents: opts.parents },
	});
	return { sha: created.sha };
}

/**
 * `heads/main`, never `refs/heads/main`. GitHub's ref endpoints take the ref
 * WITHOUT the leading `refs/` and 404 with it, which is a trap worth absorbing
 * once here rather than at four call sites. Segments are encoded individually
 * so a branch name's slashes stay structural.
 */
function qualifiedRef(ref: string): string {
	return ref.startsWith("refs/") ? ref : `refs/${ref}`;
}

function refPath(ref: string): string {
	return ref
		.replace(/^refs\//, "")
		.split("/")
		.map(encodeURIComponent)
		.join("/");
}

/**
 * Create a branch, which is what a pull request needs before it can point at
 * one. `github_pr` cannot exist without this call.
 *
 * Additive and reversible, unlike everything else in this file: it brings a ref
 * into existence and touches nothing that was already there. Creating a ref
 * that already exists is refused by GitHub rather than silently repointing it,
 * which is the behaviour we want — repointing is updateRef's job and it is the
 * dangerous one.
 */
export async function createRef(opts: CreateRefOptions): Promise<CreatedRef> {
	const created = await githubRequest<{ ref: string; object: { sha: string } }>(
		opts,
		{
			method: "POST",
			path: "/git/refs",
			// FULLY QUALIFIED here. The sibling call strips exactly this prefix;
			// see the comment on CreateRefOptions.ref for why they differ.
			body: { ref: qualifiedRef(opts.ref), sha: opts.sha },
		},
	);
	return { ref: created.ref, sha: created.object.sha };
}

/**
 * True when a failure is "that ref is already there".
 *
 * The one condition in this module a caller is expected to branch on, because a
 * retried delivery legitimately finds the branch its first attempt created. It
 * is a predicate rather than an error code because ERROR_CODES is closed and
 * holds nothing for it, and a predicate rather than a documented message
 * because the caller must never parse GitHub's wording — that happens once, in
 * classifyUnprocessable, and produces the marker this reads.
 */
export function isRefAlreadyExists(error: unknown): boolean {
	return (
		error instanceof GatewayError && error.detail.startsWith(REF_ALREADY_EXISTS)
	);
}

/**
 * Move a ref to a commit. THE IRREVERSIBLE ONE.
 *
 * force defaults to false and is sent explicitly rather than omitted, so the
 * request on the wire states the safe intent instead of relying on GitHub's
 * default staying what it is today. The only way true reaches this body is a
 * caller writing `force: true`, which is a line that shows up in a diff.
 *
 * A non-fast-forward rejection comes back as PREVIEW_STALE, which is the same
 * fact the staleness re-check in BLAST-RADIUS.md guards against, discovered at
 * the far end. The answer is identical: refuse, re-preview, never auto-retry.
 */
export async function updateRef(opts: UpdateRefOptions): Promise<UpdatedRef> {
	const updated = await githubRequest<{ ref: string; object: { sha: string } }>(
		opts,
		{
			method: "PATCH",
			path: `/git/refs/${refPath(opts.ref)}`,
			body: { sha: opts.sha, force: opts.force === true },
		},
	);
	return { ref: updated.ref, sha: updated.object.sha };
}

/** Open the pull request. `head` and `base` are branches in the same repository. */
export async function createPullRequest(
	opts: CreatePullRequestOptions,
): Promise<CreatedPullRequest> {
	const created = await githubRequest<{ number: number; html_url: string }>(
		opts,
		{
			method: "POST",
			path: "/pulls",
			body: {
				title: opts.title,
				head: opts.head,
				base: opts.base,
				...(opts.body === undefined ? {} : { body: opts.body }),
			},
		},
	);
	return { number: created.number, url: created.html_url };
}

/** Re-exported so a caller assembling tree entries never restates "100644". */
export { MODE };
