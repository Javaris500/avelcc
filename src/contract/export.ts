import { initContract } from "@ts-rest/core";
import { z } from "zod";

import { errorEnvelope, success } from "#/contract/shared/envelope";
import { VIOLATION_CODES } from "#/contract/shared/errors";

const c = initContract();

/* ── shapes ─────────────────────────────────────────────────────────────── */

export const exportTargetKind = z.enum(["zip", "github_pr", "github_push"]);

/**
 * Lifecycle. BLAST-RADIUS.md adds `previewing` and `delivering`, and BOTH paths
 * run `previewing` — so the pre-flight screen and the delivery path share one
 * code path and the preview cannot drift from what actually happens.
 */
export const exportStatus = z.enum([
	"pending",
	"rendering",
	"verifying",
	"previewing",
	"previewed",
	"delivering",
	"pr-open",
	"done",
	"failed",
]);

export const violation = z.object({
	code: z.enum(VIOLATION_CODES),
	path: z.string(),
	detail: z.string(),
});

const fileEntry = z.object({
	path: z.string(),
	size: z.number().int().nonnegative(),
	blobSha: z.string(),
});

export const blastRadius = z.object({
	computedAt: z.string(),
	baseRef: z.string(),
	/** Nullable: an empty repository has no tip, and that is a state. */
	baseCommitSha: z.string().nullable(),
	target: z.object({ owner: z.string(), repo: z.string(), branch: z.string() }),

	create: z.array(fileEntry),
	overwrite: z.array(
		fileEntry.extend({
			remoteBlobSha: z.string(),
			/** Best-effort; one commits call, may be omitted. */
			remoteLastModified: z.string().optional(),
		}),
	),
	unchanged: z.array(fileEntry),

	/**
	 * A COUNT, never a path list. "A client repo has thousands of untouched
	 * files. Listing them is noise that buries the three lines that matter."
	 */
	preserveSummary: z.object({
		fileCount: z.number().int().nonnegative(),
		topLevelDirs: z.array(z.string()),
	}),

	violations: z.array(violation),
	totals: z.object({
		create: z.number().int().nonnegative(),
		overwrite: z.number().int().nonnegative(),
		unchanged: z.number().int().nonnegative(),
		violations: z.number().int().nonnegative(),
	}),
});

export const gateOverride = z.object({
	gate: z.string(),
	/** Renders into the delivery and is visible to the client. Not optional. */
	rationale: z.string().min(1),
	overriddenBy: z.string(),
});

export const exportSchema = z.object({
	id: z.string().uuid(),
	missionId: z.string().uuid(),
	sprintN: z.number().int(),
	idempotencyKey: z.string().uuid(),
	targetKind: exportTargetKind,
	status: exportStatus,
	dryRun: z.boolean(),
	/** Which preview this was approved from. */
	previewExportId: z.string().uuid().nullable(),
	baseRef: z.string().nullable(),
	baseCommitSha: z.string().nullable(),
	/**
	 * A SEPARATE column from `verification`, deliberately. "Verification asks is
	 * the work good. Blast radius asks what does delivery do." Merging them
	 * means the pre-flight screen cannot distinguish "tests failed" from "this
	 * would clobber a file", and those need different buttons.
	 */
	blastRadius: blastRadius.nullable(),
	gateOverride: gateOverride.nullable(),
	createdAt: z.string(),
});

/* ── routes ─────────────────────────────────────────────────────────────── */

export const exportContract = c.router({
	/**
	 * A dry run is a REAL Export row, terminal at `previewed`, and it is never
	 * promoted — the real export re-renders from scratch. That re-render is not
	 * waste: the render is deterministic, so the real export's snapshot hash MUST
	 * equal its preview's, and a mismatch is a DETERMINISM_VIOLATION caught
	 * automatically before delivery. A determinism gate obtained as a side effect
	 * of previewing.
	 */
	preview: {
		method: "POST",
		path: "/exports/preview",
		body: z.object({
			missionId: z.string().uuid(),
			idempotencyKey: z.string().uuid(),
			target: exportTargetKind,
			repoUrl: z.string().url().optional(),
			ref: z.string().optional(),
		}),
		responses: {
			201: success(exportSchema),
			404: errorEnvelope, // REPO_NOT_FOUND
			403: errorEnvelope, // REPO_NO_ACCESS · POLICY_FORBIDS_TARGET
			422: errorEnvelope, // BLAST_RADIUS_VIOLATION
			502: errorEnvelope, // EXTERNAL_GITHUB · TREE_TOO_LARGE
		},
	},

	create: {
		method: "POST",
		path: "/exports",
		body: z.object({
			missionId: z.string().uuid(),
			idempotencyKey: z.string().uuid(),
			/**
			 * REQUIRED for github_push. This is where the device boundary is
			 * enforced at the contract rather than in the UI: approving a gated
			 * export from a phone is fine, initiating an irreversible one is not,
			 * and that holds because a push without a linked preview is refused
			 * here — not because a screen hid a button.
			 */
			previewExportId: z.string().uuid().optional(),
			target: exportTargetKind,
			repoUrl: z.string().url().optional(),
			gateOverride: gateOverride.optional(),
		}),
		/**
		 * PRECONDITION_FAILED USED TO BE LISTED ON THE 422 AND IS GONE.
		 *
		 * It was copied from BLAST-RADIUS.md:254 and `errorEnvelope` could never
		 * carry it: the code lives in CRUD_CODES, a deliberately separate union.
		 * It was not moved into ERROR_CODES, because two unions holding the same
		 * name is worse than a missing one — a screen switching on the code would
		 * have no way to tell which vocabulary it came from, and the separation
		 * exists precisely so a mission 404 cannot route through the export map.
		 *
		 * Nothing was lost. Every 422 this route actually raises has a code that
		 * fits: a violation, a failed re-render, or a push with no linked preview.
		 * IDEMPOTENCY_REPLAY, by contrast, WAS added — it named a real state this
		 * route reaches and nothing else could express it.
		 */
		responses: {
			201: success(exportSchema),
			409: errorEnvelope, // IDEMPOTENCY_REPLAY · PREVIEW_STALE
			422: errorEnvelope, // BLAST_RADIUS_VIOLATION · DETERMINISM_VIOLATION
			//                     · PREVIEW_REQUIRED
			502: errorEnvelope, // EXTERNAL_GITHUB
		},
	},

	get: {
		method: "GET",
		path: "/exports/:id",
		responses: { 200: success(exportSchema), 404: errorEnvelope },
	},
});
