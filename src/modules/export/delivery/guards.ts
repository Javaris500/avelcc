import type { ErrorCode } from "#/contract/shared/errors";
import type { Violation } from "#/modules/export/blast/types";
import type { ExportTargetKind } from "#/modules/export/delivery/lifecycle";
import type { PreviewFacts } from "#/modules/export/delivery/types";

/**
 * The checks that stand between a rendered package and an irreversible write.
 *
 * ALL PURE. No database, no network, no clock. Every one of them is the reason
 * this product exists rather than an incidental validation, so each is testable
 * with a literal and none of them can be skipped by a target that forgot.
 *
 * They return a result instead of throwing: a caller must handle each failure
 * by mapping it to a contract error code, and a thrown exception makes it too
 * easy to catch all of them in one place and lose which one fired.
 */

export type GuardFailure = {
	/** A CONTRACT code. The screen's error map is keyed on it. */
	code: ErrorCode;
	/** Operator-facing. Never parsed. */
	detail: string;
};

export type GuardResult = { ok: true } | { ok: false; failure: GuardFailure };

const OK: GuardResult = { ok: true };

const fail = (code: ErrorCode, detail: string): GuardResult => ({
	ok: false,
	failure: { code, detail },
});

/**
 * Is a linked preview required for this target?
 *
 * BLAST-RADIUS.md: "Delivery without a linked preview is refused for
 * github_push; allowed with a warning for github_pr; irrelevant for zip."
 *
 * This is where the DEVICE BOUNDARY is enforced. The contract comment on
 * `export.create` says it plainly: approving a gated export from a phone is
 * fine, initiating an irreversible one is not, "and that holds because a push
 * without a linked preview is refused HERE — not because a screen hid a
 * button." A UI-only rule is not a rule.
 *
 * The `github_pr` warning is returned rather than logged, so a caller that
 * ignores it does so visibly.
 */
export function checkPreviewRequired(
	kind: ExportTargetKind,
	previewExportId: string | null,
): GuardResult & { warning?: string } {
	if (previewExportId !== null) return OK;

	switch (kind) {
		case "github_push":
			return fail(
				"PREVIEW_REQUIRED",
				"A github_push must be delivered from an approved preview. Run POST /exports/preview and pass its id as previewExportId.",
			);
		case "github_pr":
			return {
				ok: true,
				warning:
					"Delivering a github_pr with no linked preview. The blast radius was never shown to an operator before this write.",
			};
		case "zip":
			return OK;
	}
}

/**
 * Does the preview belong to the mission being delivered?
 *
 * Cheap, and it closes a hole the staleness check cannot see: a preview of a
 * DIFFERENT mission has its own perfectly fresh commit sha, so the tip check
 * would pass while the operator approved a blast radius for the wrong package.
 */
export function checkPreviewMatchesMission(
	preview: PreviewFacts,
	missionId: string,
): GuardResult {
	if (preview.missionId === missionId) return OK;
	return fail(
		"PREVIEW_REQUIRED",
		`Preview ${preview.id} belongs to mission ${preview.missionId}, not ${missionId}.`,
	);
}

/**
 * THE TOCTOU GUARD. Read BLAST-RADIUS.md's second section before changing it.
 *
 * "Between preview and delivery, the client's repo can change... A preview that
 * can silently go stale is worse than no preview — it manufactures confidence."
 *
 * If the tip moved, refuse. Both SHAs go in the detail so the operator can see
 * what happened without a second request.
 *
 * NO EXCEPTION FOR NON-OVERLAPPING CHANGES. The doc is explicit: "Overlap
 * detection is a judgment call about someone else's repo, made by code that
 * cannot see intent. Refuse and re-preview; it costs one API call." Do not add
 * a cleverness here later — it is the one place cleverness is known to be wrong.
 */
export function checkPreviewFresh(
	previewBaseCommitSha: string | null,
	currentTipSha: string | null,
): GuardResult {
	if (previewBaseCommitSha === currentTipSha) return OK;
	return fail(
		"PREVIEW_STALE",
		`The branch tip moved after the preview was computed: previewed against ${
			previewBaseCommitSha ?? "(empty repository)"
		}, now ${currentTipSha ?? "(empty repository)"}. Re-run the preview.`,
	);
}

/**
 * The determinism gate, obtained for free.
 *
 * "The render is deterministic. So the real export's snapshot_sha256 must equal
 * its preview's." A mismatch means something nondeterministic leaked into the
 * render path — an unsorted map, a timestamp, a locale-sensitive comparison —
 * and it has been caught on this export, before delivery.
 *
 * This is the cheapest high-value mechanism in the project: it costs a render
 * that was happening anyway and it verifies the single architectural property
 * everything else rests on. It is NOT overridable (see `isOverridable`), and it
 * must never become so — an operator waving through a determinism failure is
 * waving through "we cannot reproduce what we are about to ship."
 */
export function checkDeterminism(
	previewSnapshotSha256: string,
	realSnapshotSha256: string,
): GuardResult {
	if (previewSnapshotSha256 === realSnapshotSha256) return OK;
	return fail(
		"DETERMINISM_VIOLATION",
		`The re-render did not reproduce the preview: preview ${previewSnapshotSha256}, re-render ${realSnapshotSha256}. Something in the render path is nondeterministic. Do not deliver.`,
	);
}

/**
 * Blast radius violations block delivery, and NOTHING overrides them.
 *
 * This function deliberately takes no `gateOverride` parameter, and that
 * absence is the point. BLAST-RADIUS.md: "Gates concern work quality;
 * violations concern writing where you were not permitted." A gate override is
 * an operator accepting a quality risk in their own work; a violation is the
 * system saying this write goes somewhere it was never authorized to touch.
 * `isOverridable()` in contract/shared/errors.ts already encodes that
 * BLAST_RADIUS_VIOLATION is not overridable — this signature makes it
 * unexpressible rather than merely disallowed, so no caller can pass one.
 */
export function checkNoViolations(
	violations: readonly Violation[],
): GuardResult {
	if (violations.length === 0) return OK;

	// Codes, then paths. The operator needs to know WHAT rule was broken before
	// which file broke it, and a long path list buries a single-word code.
	const codes = [...new Set(violations.map((v) => v.code))].sort().join(", ");
	const paths = violations
		.slice(0, 5)
		.map((v) => v.path)
		.join(", ");
	const more =
		violations.length > 5 ? ` and ${violations.length - 5} more` : "";

	return fail(
		"BLAST_RADIUS_VIOLATION",
		`${violations.length} violation(s) [${codes}]: ${paths}${more}. Violations are never overridable.`,
	);
}

/**
 * Every pre-delivery check, in the order a failure is most useful.
 *
 * Ordering is not cosmetic. Mission mismatch and a missing preview are
 * caller mistakes and are reported before anything that describes the client's
 * repository, so an operator is not told "the tip moved" about a preview that
 * was never theirs to begin with.
 *
 * The zip path passes `preview: null` and empty violations — it has no target
 * repository, so there is no tip to move and no radius to compute.
 */
export function checkDeliverable(input: {
	kind: ExportTargetKind;
	missionId: string;
	preview: PreviewFacts | null;
	currentTipSha: string | null;
	realSnapshotSha256: string;
	violations: readonly Violation[];
}): GuardResult & { warning?: string } {
	const required = checkPreviewRequired(input.kind, input.preview?.id ?? null);
	if (!required.ok) return required;

	if (input.preview !== null) {
		const belongs = checkPreviewMatchesMission(input.preview, input.missionId);
		if (!belongs.ok) return belongs;

		// Only the GitHub targets have a tip. A zip preview records none, and
		// comparing null to null would pass vacuously rather than meaningfully.
		if (input.kind !== "zip") {
			const fresh = checkPreviewFresh(
				input.preview.baseCommitSha,
				input.currentTipSha,
			);
			if (!fresh.ok) return fresh;
		}

		const deterministic = checkDeterminism(
			input.preview.snapshotSha256,
			input.realSnapshotSha256,
		);
		if (!deterministic.ok) return deterministic;
	}

	const clean = checkNoViolations(input.violations);
	if (!clean.ok) return clean;

	return required;
}
