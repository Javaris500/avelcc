import { type ErrorCode, isOverridable } from "#/contract/shared/errors";

/**
 * One table: error.code -> message + recovery action.
 *
 * EXHAUSTIVE BY CONSTRUCTION. This is a Record keyed on the ErrorCode union,
 * so adding a thirteenth code fails the build here until it is given a screen.
 * DAY-ONE-FRONTEND: "a TypeScript never check so a new code fails the build."
 *
 * Copy is written for the operator who has to decide what to do next, not for
 * a log. Seeded from the "Screen shows" column of docs/BLAST-RADIUS.md.
 */

export type Recovery =
	| { kind: "retry"; label: string }
	| { kind: "link"; label: string; to: string }
	| { kind: "switch-target"; label: string; target: "zip" | "github_pr" }
	| { kind: "none" };

export type ErrorPresentation = {
	title: string;
	body: string;
	recovery: Recovery;
	/** Loud errors are architectural failures, not user mistakes. */
	severity: "blocking" | "recoverable" | "loud";
};

export const ERROR_MAP: Record<ErrorCode, ErrorPresentation> = {
	REPO_NOT_FOUND: {
		title: "That repository is missing or was renamed.",
		body: "GitHub returned nothing for this URL. Check the address, or deliver a zip instead and attach it by hand.",
		recovery: {
			kind: "switch-target",
			label: "Deliver a zip instead",
			target: "zip",
		},
		severity: "recoverable",
	},
	REPO_NO_ACCESS: {
		title: "The connection cannot read this repository.",
		body: "The credential in use does not carry the scope this repository needs. Check which connection is attached and what it was granted.",
		recovery: { kind: "link", label: "Open connections", to: "/login" },
		severity: "blocking",
	},
	CONNECTION_REVOKED: {
		title: "This connection has been revoked.",
		body: "The engagement it belonged to was closed, so the credential no longer resolves. Nothing was sent.",
		recovery: { kind: "link", label: "Open connections", to: "/login" },
		severity: "blocking",
	},
	POLICY_FORBIDS_TARGET: {
		title: "Policy blocks a direct push to this branch.",
		body: "This is a policy decision, not a failure. Repositories without a policy row are treated as no-direct-push, which is the safe default.",
		recovery: {
			kind: "switch-target",
			label: "Open a pull request instead",
			target: "github_pr",
		},
		severity: "blocking",
	},
	BRANCH_NOT_FOUND: {
		title: "That branch does not exist.",
		body: "For a pull request this is fine and the branch is created from the base. For a direct push there is nothing to push to.",
		recovery: {
			kind: "switch-target",
			label: "Open a pull request instead",
			target: "github_pr",
		},
		severity: "blocking",
	},
	EMPTY_REPOSITORY: {
		title: "This repository is empty, so everything is new.",
		body: "There are no commits to compare against. Every file in the package will be created and nothing can be overwritten.",
		recovery: { kind: "none" },
		severity: "recoverable",
	},
	TREE_TOO_LARGE: {
		title: "This repository is too large to diff safely.",
		body: "GitHub truncated the file listing even when scoped to the package directory, so what a delivery would change cannot be computed. A preview that might be wrong is worse than none.",
		recovery: {
			kind: "switch-target",
			label: "Deliver a zip instead",
			target: "zip",
		},
		severity: "blocking",
	},
	BLAST_RADIUS_VIOLATION: {
		title: "Delivery would write outside the permitted paths.",
		body: "One or more files in the package resolve somewhere they are not allowed to go. This cannot be overridden — a justification does not make a path traversal acceptable.",
		recovery: { kind: "none" },
		severity: "blocking",
	},
	PREVIEW_STALE: {
		title: "The repository moved since this preview was computed.",
		body: "Someone pushed between the preview and now, so what you approved is not what would happen. Re-run the preview against the current tip.",
		recovery: { kind: "retry", label: "Re-run the preview" },
		severity: "blocking",
	},
	PREVIEW_REQUIRED: {
		title: "A direct push needs an approved preview first.",
		body: "Nothing irreversible runs without a preview it was approved from. Reaching this from the interface is a bug worth reporting.",
		recovery: { kind: "retry", label: "Run the preview" },
		severity: "blocking",
	},
	DETERMINISM_VIOLATION: {
		title: "The package rendered differently the second time.",
		body: "The same mission produced different bytes, which means something non-deterministic reached the render path. Delivery stopped. This is an architectural failure, not something you did wrong, and it needs filing.",
		recovery: { kind: "none" },
		severity: "loud",
	},
	EXTERNAL_GITHUB: {
		title: "GitHub did not respond.",
		body: "A rate limit, a timeout, or an outage on their side. Nothing was written and this is safe to retry.",
		recovery: { kind: "retry", label: "Try again" },
		severity: "recoverable",
	},
};

export function presentError(code: ErrorCode): ErrorPresentation {
	return ERROR_MAP[code];
}

/** Deliver stays disabled by state for anything an override cannot clear. */
export function blocksDelivery(code: ErrorCode): boolean {
	const { severity } = ERROR_MAP[code];
	return severity !== "recoverable" || !isOverridable(code);
}
