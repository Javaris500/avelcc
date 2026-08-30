import type { Violation } from "#/modules/export/blast/types";
import type { ExportTargetKind } from "#/modules/export/delivery/lifecycle";

/**
 * What a delivery target is handed, and what it gives back.
 *
 * THE TARGETS DO NOT DECIDE ANYTHING. By the time one of these runs, every
 * guard has already passed: the preview was linked if the target required one,
 * the branch tip has not moved, the re-render hashed identically, and the blast
 * radius carried no violations. A target's only job is to put bytes somewhere.
 *
 * That split is deliberate. `github_push` writes irreversibly into someone
 * else's repository, and the checks protecting that write must not live inside
 * the thing doing the writing — otherwise each new target reimplements them and
 * one of them gets it subtly wrong. The guards are pure functions in
 * `guards.ts`, tested without a network or a database; the targets are thin.
 */
export type DeliveryContext = {
	/** The rendered package. Sorted by the caller; a target must not reorder. */
	files: ReadonlyMap<string, Uint8Array>;
	/**
	 * The package hash the determinism guard already compared against the
	 * preview. Passed in rather than recomputed so a target cannot disagree with
	 * the value the guard approved.
	 */
	snapshotSha256: string;
	missionId: string;
	sprintN: number;
	/**
	 * NULL FOR ZIP, and that is the whole reason this is nullable. A zip has no
	 * target repository, which is also why BLAST-RADIUS.md's Open section
	 * concludes a zip should not compute a blast radius at all.
	 */
	target: { owner: string; repo: string; branch: string } | null;
	/** The tip the preview was computed against. Null for an empty repository. */
	baseCommitSha: string | null;
	/** Commit / PR title. Rendered by the caller, never assembled here. */
	message: string;
};

/**
 * Discriminated on `kind` so a caller cannot read `prNumber` off a zip. The
 * Export row stores different columns per target, and a union makes the
 * compiler enforce which ones are reachable.
 */
export type DeliveryOutcome =
	| {
			kind: "zip";
			bytes: Uint8Array;
			/** Over the zip container, NOT the package. The two differ. */
			sha256: string;
			byteLength: number;
	  }
	| { kind: "github_pr"; commitSha: string; prNumber: number; prUrl: string }
	| { kind: "github_push"; commitSha: string; ref: string };

export type DeliveryTarget = {
	readonly kind: ExportTargetKind;
	deliver(ctx: DeliveryContext): Promise<DeliveryOutcome>;
};

/**
 * What the guards need to know about a preview, without loading an Export row.
 *
 * Keeping this a plain value rather than the row type is what lets every guard
 * in `guards.ts` be tested with a literal and no database.
 */
export type PreviewFacts = {
	id: string;
	missionId: string;
	snapshotSha256: string;
	baseCommitSha: string | null;
	violations: readonly Violation[];
};
