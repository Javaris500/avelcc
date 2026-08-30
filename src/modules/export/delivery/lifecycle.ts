/**
 * The Export lifecycle, as a machine rather than as a convention.
 *
 * BLAST-RADIUS.md draws it:
 *
 *   dry run: pending → rendering → verifying → previewing → previewed
 *   real:    pending → rendering → verifying → previewing → delivering
 *                                                         → pr-open → done
 *                                            (any of the above) ↘ failed
 *
 * `previewing` is on BOTH paths on purpose: "the pre-flight screen and the
 * delivery path share one code path — the preview is not a separate simulation
 * that can drift from reality." Encoding the transitions here is what keeps
 * that true. A service that advanced status with bare assignments would let the
 * two paths quietly diverge, which is precisely the drift the shared status is
 * supposed to prevent.
 */

export const EXPORT_TARGET_KINDS = ["zip", "github_pr", "github_push"] as const;
export type ExportTargetKind = (typeof EXPORT_TARGET_KINDS)[number];

export const EXPORT_STATUSES = [
	"pending",
	"rendering",
	"verifying",
	"previewing",
	"previewed",
	"delivering",
	"pr-open",
	"done",
	"failed",
] as const;
export type ExportStatus = (typeof EXPORT_STATUSES)[number];

/**
 * Every legal move. `failed` is reachable from any non-terminal state, which is
 * why it appears in each list rather than being special-cased — a special case
 * is a place the check can be forgotten.
 */
const TRANSITIONS: Record<ExportStatus, readonly ExportStatus[]> = {
	pending: ["rendering", "failed"],
	rendering: ["verifying", "failed"],
	verifying: ["previewing", "failed"],
	// The fork. A dry run stops at `previewed`; a real export goes on.
	previewing: ["previewed", "delivering", "failed"],
	// TERMINAL. "It is never promoted. The real export re-renders from scratch."
	previewed: [],
	// `done` directly is the zip and push path; `pr-open` is the PR path.
	delivering: ["pr-open", "done", "failed"],
	"pr-open": ["done", "failed"],
	done: [],
	failed: [],
};

export function canTransition(from: ExportStatus, to: ExportStatus): boolean {
	return TRANSITIONS[from].includes(to);
}

export function isTerminal(status: ExportStatus): boolean {
	return TRANSITIONS[status].length === 0;
}

/**
 * Throws rather than returning a result, because an illegal transition is a
 * programming error in this module and not a condition a caller can handle.
 * A caller that could handle it would be choosing a different status, which is
 * the bug.
 */
export function assertTransition(
	from: ExportStatus,
	to: ExportStatus,
): asserts to is ExportStatus {
	if (!canTransition(from, to)) {
		throw new Error(
			`Illegal export transition ${from} → ${to}. Legal from ${from}: ${
				TRANSITIONS[from].join(", ") || "(terminal)"
			}.`,
		);
	}
}

/**
 * Where a target lands when delivery succeeds.
 *
 * A PR is NOT done — it is open, and whether it merges is the client's call,
 * not ours. Collapsing `pr-open` into `done` would report a delivery as
 * complete while the change is still sitting unreviewed in someone's queue.
 */
export function terminalStatusFor(kind: ExportTargetKind): ExportStatus {
	return kind === "github_pr" ? "pr-open" : "done";
}
