import { initContract } from "@ts-rest/core";
import { z } from "zod";

import {
	crudErrorEnvelope,
	success,
	successList,
} from "#/contract/shared/envelope";
import { paginationQuery } from "#/contract/shared/pagination";

const c = initContract();

/**
 * Intake — Canon's proposal, never a Mission until an operator approves it.
 * DATA-CONTRACTS-V2:130 defines the field block in full and this file is that
 * block, with nothing added.
 *
 * THE APPROVAL IS THE POINT. "Nothing Canon writes becomes executable until an
 * operator says so. The Intake row is retained — it is the provenance for how
 * the brief came to exist." So approval is a distinct procedure rather than an
 * `update` that happens to set a status, and it MATERIALISES a Mission.
 *
 * `request -> mission` HAS THE SAME SHAPE AS `preview -> export`, and this
 * router deliberately mirrors that one: review what will happen, then commit to
 * something that materialises. Both are a creation event carrying real weight,
 * so both get a dedicated verb rather than a generic write.
 */

export const intakeStatus = z.enum([
	"draft",
	"proposed",
	"approved",
	"rejected",
]);

/** Derived by reading the repository, never chosen. Shared with Mission. */
export const derivedCut = z.enum(["horizontal", "vertical"]);

export const intakeSchema = z.object({
	id: z.string().uuid(),
	engagementId: z.string().uuid(),
	status: intakeStatus,
	sourceMd: z.string().nullable(),
	/** Structured; shape owned by the mission type. */
	proposedBrief: z.record(z.string(), z.unknown()).nullable(),
	/** `[]` is "none surfaced", never "not asked". */
	openQuestions: z.array(z.string()),
	/**
	 * NULLABLE, like `Mission.cut`. At draft there may be no connected
	 * repository to derive from, and NULL says "not yet derived" where a default
	 * would claim a derivation nobody performed.
	 */
	derivedCut: derivedCut.nullable(),
	/**
	 * THE EVIDENCE IS THE REVIEWABLE PART. It is what makes an automated decision
	 * auditable, which is why the review screen shows it rather than hiding it
	 * behind a disclosure.
	 */
	derivedCutEvidence: z.string().nullable(),
	suggestedPresetId: z.string().uuid().nullable(),
	approvedBy: z.string().nullable(),
	approvedAt: z.string().nullable(),
	/** Set on approval, and null until then. */
	missionId: z.string().uuid().nullable(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

/**
 * `deleted_at` is not on the wire, for the reason `client.ts` gives: every read
 * filters it, so a row that reaches a caller always has it null, and sending a
 * constant invites a screen to branch on it.
 */
export const intakeListRow = intakeSchema.pick({
	id: true,
	engagementId: true,
	status: true,
	derivedCut: true,
	suggestedPresetId: true,
	missionId: true,
	createdAt: true,
});

/**
 * WHAT APPROVAL WILL CREATE, returned before anything is created.
 *
 * The `preview` half of the idiom. An operator sees the mission that would be
 * materialised — named, typed, with its playbook — and the coherence result for
 * the roster the suggested preset would produce, BEFORE the button that makes
 * it real. Same reasoning as the export pre-flight: a creation event should say
 * what it produces and what could go wrong.
 */
export const intakePreview = z.object({
	intakeId: z.string().uuid(),
	/** Refusals that make approval impossible, each with a reason. */
	blockers: z.array(z.object({ code: z.string(), detail: z.string() })),
	/** Things worth seeing that do not prevent approval. */
	warnings: z.array(z.object({ code: z.string(), detail: z.string() })),
	mission: z.object({
		title: z.string().nullable(),
		type: z.string(),
		cut: derivedCut.nullable(),
		cutEvidence: z.string().nullable(),
		sprintN: z.number().int(),
	}),
	/** The squad the suggested preset would materialise. Empty if none. */
	roster: z.array(
		z.object({
			agentTemplateId: z.string().uuid(),
			slug: z.string(),
			name: z.string(),
			wave: z.string().nullable(),
		}),
	),
});

export const intakeContract = c.router({
	list: {
		method: "GET",
		path: "/intakes",
		query: paginationQuery.extend({
			engagementId: z.string().uuid().optional(),
			status: intakeStatus.optional(),
		}),
		responses: { 200: successList(intakeListRow), 403: crudErrorEnvelope },
	},

	get: {
		method: "GET",
		path: "/intakes/:id",
		responses: { 200: success(intakeSchema), 404: crudErrorEnvelope },
	},

	create: {
		method: "POST",
		path: "/intakes",
		/**
		 * `status` IS NOT TAKEN FROM THE CALLER and is left to the column default.
		 * A request created `approved` would be a mission nobody approved, which
		 * is the exact failure this entity exists to prevent. The same reasoning
		 * `client.create` uses for not accepting `status`.
		 *
		 * `derivedCut` is likewise absent: it is computed by reading the
		 * repository, and accepting it from a caller would let someone propose a
		 * cut while it looked derived.
		 */
		body: z.object({
			engagementId: z.string().uuid(),
			sourceMd: z.string().min(1),
			proposedBrief: z.record(z.string(), z.unknown()).optional(),
			openQuestions: z.array(z.string()).optional(),
		}),
		responses: { 201: success(intakeSchema), 422: crudErrorEnvelope },
	},

	/**
	 * The review, and it writes nothing. Safe to call repeatedly, which is what
	 * lets the screen show consequences while the operator is still deciding.
	 */
	preview: {
		method: "GET",
		path: "/intakes/:id/preview",
		responses: {
			200: success(intakePreview),
			404: crudErrorEnvelope,
			422: crudErrorEnvelope,
		},
	},

	/**
	 * MATERIALISES A MISSION. The one irreversible verb here, and the reason
	 * approval is not an `update` with a status field: an update implies a cell
	 * changed, and what actually happens is that a Mission comes into existence.
	 *
	 * 409 is the idempotency case — an intake already approved has a mission, and
	 * approving twice must not make a second one.
	 */
	approve: {
		method: "POST",
		path: "/intakes/:id/approve",
		body: z.object({
			approvedBy: z.string().min(1),
			/** Carried onto the Mission. Absent means the engagement's default. */
			title: z.string().min(1).optional(),
			type: z.string().min(1).optional(),
		}),
		responses: {
			200: success(intakeSchema),
			404: crudErrorEnvelope,
			409: crudErrorEnvelope,
			422: crudErrorEnvelope,
		},
	},

	/**
	 * Rejection is a DECISION and is recorded as one, not a delete. The row is
	 * retained because it is the provenance for a brief that never existed, and
	 * "we considered this and said no" is a different fact from "this was never
	 * proposed".
	 */
	reject: {
		method: "POST",
		path: "/intakes/:id/reject",
		body: z.object({
			rejectedBy: z.string().min(1),
			reason: z.string().min(1),
		}),
		responses: {
			200: success(intakeSchema),
			404: crudErrorEnvelope,
			409: crudErrorEnvelope,
		},
	},
});
