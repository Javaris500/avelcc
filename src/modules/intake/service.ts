import { and, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";

import type { Db } from "#/modules/db/client";
import { engagements, intakes, missions } from "#/modules/db/schema";

/**
 * Intake reads, and the preview that stands in front of approval.
 *
 * Shaped after `modules/client/service.ts` rather than as a second pattern:
 * same cursor pagination on created_at, same explicit soft-delete filter, same
 * Dates-to-ISO at the edge.
 *
 * NO CORRELATED `sql` SUBQUERIES ANYWHERE IN THIS FILE. Drizzle renders
 * `${table.column}` unqualified inside a template, so a correlation to an outer
 * table silently resolves against the inner one and matches nothing — that cost
 * three wrong counts on the client detail page, two of which returned a
 * plausible zero. Every join here is one drizzle renders itself.
 */

export type IntakeStatus = "draft" | "proposed" | "approved" | "rejected";

export type IntakeListItem = {
	id: string;
	engagementId: string;
	status: IntakeStatus;
	derivedCut: "horizontal" | "vertical" | null;
	suggestedPresetId: string | null;
	missionId: string | null;
	createdAt: string;
};

export type IntakeView = IntakeListItem & {
	sourceMd: string | null;
	proposedBrief: Record<string, unknown> | null;
	openQuestions: string[];
	derivedCutEvidence: string | null;
	approvedBy: string | null;
	approvedAt: string | null;
	updatedAt: string;
};

/** Undecided. `approved` and `rejected` are both decisions. */
export const OPEN_STATUSES: IntakeStatus[] = ["draft", "proposed"];

export async function listIntakes(
	db: Db,
	opts: {
		cursor?: string;
		limit: number;
		engagementId?: string;
		status?: IntakeStatus;
	},
): Promise<{
	items: IntakeListItem[];
	total: number;
	nextCursor: string | null;
}> {
	const cursor = opts.cursor ? new Date(opts.cursor) : null;

	const rows = await db
		.select({
			id: intakes.id,
			engagementId: intakes.engagementId,
			status: intakes.status,
			derivedCut: intakes.derivedCut,
			suggestedPresetId: intakes.suggestedPresetId,
			missionId: intakes.missionId,
			createdAt: intakes.createdAt,
		})
		.from(intakes)
		// NAMED IN FULL rather than hoisted into a shared `where` const. It was
		// hoisted, and softDelete.test.ts flagged it: the scan is STATIC and
		// cannot see a filter through a variable, so hoisting leaves the code
		// looking right while the guard goes blind. Same correction as
		// client/detail.ts — the check being able to see it is worth the repetition.
		.where(
			and(
				isNull(intakes.deletedAt),
				opts.engagementId
					? eq(intakes.engagementId, opts.engagementId)
					: undefined,
				opts.status ? eq(intakes.status, opts.status) : undefined,
				cursor ? lt(intakes.createdAt, cursor) : undefined,
			),
		)
		// OPEN FIRST, then decided — the order UI-PLAN section 5 asks for, and the
		// order an operator wants: a request waiting on them outranks one they
		// already answered, regardless of age.
		.orderBy(
			sql`case when ${intakes.status} in ('draft','proposed') then 0 else 1 end`,
			desc(intakes.createdAt),
		)
		.limit(opts.limit + 1);

	const hasMore = rows.length > opts.limit;
	const page = hasMore ? rows.slice(0, opts.limit) : rows;
	const last = page.at(-1);

	const [count] = await db
		.select({ total: sql<number>`count(*)::int` })
		.from(intakes)
		.where(
			and(
				isNull(intakes.deletedAt),
				opts.engagementId
					? eq(intakes.engagementId, opts.engagementId)
					: undefined,
				opts.status ? eq(intakes.status, opts.status) : undefined,
			),
		);

	return {
		items: page.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
		total: count?.total ?? 0,
		nextCursor: hasMore && last ? last.createdAt.toISOString() : null,
	};
}

export async function getIntake(
	db: Db,
	id: string,
): Promise<IntakeView | null> {
	const [row] = await db
		.select()
		.from(intakes)
		.where(and(eq(intakes.id, id), isNull(intakes.deletedAt)))
		.limit(1);
	if (!row) return null;
	return {
		id: row.id,
		engagementId: row.engagementId,
		status: row.status,
		sourceMd: row.sourceMd,
		proposedBrief: row.proposedBrief,
		openQuestions: row.openQuestions,
		derivedCut: row.derivedCut,
		derivedCutEvidence: row.derivedCutEvidence,
		suggestedPresetId: row.suggestedPresetId,
		approvedBy: row.approvedBy,
		approvedAt: row.approvedAt ? row.approvedAt.toISOString() : null,
		missionId: row.missionId,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

export type IntakePreview = {
	intakeId: string;
	blockers: { code: string; detail: string }[];
	warnings: { code: string; detail: string }[];
	mission: {
		title: string | null;
		type: string;
		cut: "horizontal" | "vertical" | null;
		cutEvidence: string | null;
		sprintN: number;
	};
	roster: {
		agentTemplateId: string;
		slug: string;
		name: string;
		wave: string | null;
	}[];
};

/**
 * What approval would create, computed without creating it.
 *
 * THE `preview -> export` IDIOM, one entity over. It writes nothing and is safe
 * to call repeatedly, which is what lets the review screen show consequences
 * while the operator is still deciding rather than after they have committed.
 *
 * A BLOCKER MAKES APPROVAL IMPOSSIBLE; A WARNING IS WORTH SEEING AND DOES NOT.
 * The distinction matters because the screen renders one button, and a button
 * that is enabled when it will fail is worse than one disabled with a reason.
 */
export async function previewIntake(
	db: Db,
	id: string,
): Promise<IntakePreview | null> {
	const intake = await getIntake(db, id);
	if (!intake) return null;

	const blockers: { code: string; detail: string }[] = [];
	const warnings: { code: string; detail: string }[] = [];

	if (intake.status === "approved") {
		blockers.push({
			code: "ALREADY_APPROVED",
			detail: `This request was approved${
				intake.approvedBy ? ` by ${intake.approvedBy}` : ""
			} and created mission ${intake.missionId}. Approving again would make a second mission for one request.`,
		});
	}
	if (intake.status === "rejected") {
		blockers.push({
			code: "ALREADY_REJECTED",
			detail:
				"This request was rejected. Rejection is a decision that was recorded, not a delete — reopening it is a new request.",
		});
	}

	const [engagement] = await db
		.select({
			id: engagements.id,
			name: engagements.name,
			status: engagements.status,
		})
		.from(engagements)
		.where(
			and(
				eq(engagements.id, intake.engagementId),
				isNull(engagements.deletedAt),
			),
		)
		.limit(1);

	if (!engagement) {
		blockers.push({
			code: "ENGAGEMENT_GONE",
			detail:
				"The engagement this request belongs to no longer exists. A mission cannot be created outside one.",
		});
	} else if (engagement.status === "closed") {
		blockers.push({
			code: "ENGAGEMENT_CLOSED",
			detail: `Engagement "${engagement.name}" is closed. Closing an engagement also revokes its connections, so a mission created here could not deliver.`,
		});
	}

	// A WARNING, NOT A BLOCKER. The cut is derived by reading the repository and
	// there may be none connected yet; the mission's own `cut` is nullable for
	// exactly this reason. Approving without it produces a mission whose cut is
	// still to be derived, which is a real state rather than a broken one.
	if (!intake.derivedCut) {
		warnings.push({
			code: "CUT_NOT_DERIVED",
			detail:
				"No cut has been derived yet. The mission will be created without one, to be derived when a repository is connected.",
		});
	} else if (!intake.derivedCutEvidence) {
		// The cut without its evidence is an automated decision nobody can review,
		// which is the one thing the review screen exists to prevent.
		warnings.push({
			code: "CUT_EVIDENCE_MISSING",
			detail: `The cut is "${intake.derivedCut}" but no evidence was recorded for it. There is nothing to review the derivation against.`,
		});
	}

	if (intake.openQuestions.length > 0) {
		warnings.push({
			code: "OPEN_QUESTIONS",
			detail: `${intake.openQuestions.length} question${
				intake.openQuestions.length === 1 ? "" : "s"
			} raised during intake ${
				intake.openQuestions.length === 1 ? "is" : "are"
			} unanswered. Approving does not answer them.`,
		});
	}

	/**
	 * THE ROSTER IS ALWAYS EMPTY AND THAT IS A REPORTED GAP, not a bug.
	 *
	 * `suggested_preset_id` points at RosterPreset, and RosterPreset has NO
	 * SQUAD SHAPE — the table carries a name and nothing else, because
	 * DATA-CONTRACTS-V2 gives that entity two sentences of prose and no field
	 * block. Which templates, at which waves, with which priorities is the whole
	 * entity and it is undefined. So there is nothing to expand, and inventing a
	 * roster_preset_entries table to fill this in would be a shape nobody agreed
	 * to sitting under a materialise-into-RosterEntry operation.
	 */
	if (intake.suggestedPresetId) {
		warnings.push({
			code: "PRESET_SHAPE_UNDEFINED",
			detail:
				"A preset is suggested, but RosterPreset has no squad shape defined, so the roster it would produce cannot be shown. Approval will create the mission with no roster entries.",
		});
	} else {
		warnings.push({
			code: "NO_PRESET_SUGGESTED",
			detail:
				"No preset is suggested, so the mission will be created with no roster. Agents are added to it afterwards.",
		});
	}

	// The next sprint for this engagement. A mission is 1-based and counts up,
	// so a first mission is sprint 1 and each later one takes the next number.
	const [sprint] = await db
		.select({ max: sql<number | null>`max(${missions.sprintN})` })
		.from(missions)
		.where(
			and(
				eq(missions.engagementId, intake.engagementId),
				isNull(missions.deletedAt),
			),
		);

	const brief = intake.proposedBrief ?? {};
	const title = typeof brief.title === "string" ? brief.title : null;
	const type = typeof brief.type === "string" ? brief.type : "full-build";

	if (!title) {
		warnings.push({
			code: "NO_TITLE",
			detail:
				"The proposed brief carries no title, so the mission will be created untitled. Three untitled missions are indistinguishable in a list.",
		});
	}

	return {
		intakeId: intake.id,
		blockers,
		warnings,
		mission: {
			title,
			type,
			cut: intake.derivedCut,
			cutEvidence: intake.derivedCutEvidence,
			sprintN: (sprint?.max ?? 0) + 1,
		},
		roster: [],
	};
}

/** Open requests per engagement, for the client page's Requests section. */
export async function openIntakeCounts(
	db: Db,
	engagementIds: string[],
): Promise<Map<string, number>> {
	if (engagementIds.length === 0) return new Map();
	const rows = await db
		.select({
			engagementId: intakes.engagementId,
			open: sql<number>`count(*)::int`,
		})
		.from(intakes)
		.where(
			and(
				inArray(intakes.engagementId, engagementIds),
				isNull(intakes.deletedAt),
				inArray(intakes.status, OPEN_STATUSES),
			),
		)
		.groupBy(intakes.engagementId);
	return new Map(rows.map((r) => [r.engagementId, r.open]));
}
