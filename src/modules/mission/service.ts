import { and, desc, eq, isNull, lt, sql } from "drizzle-orm";

import type { Db } from "#/modules/db/client";
import { clients, engagements, missions } from "#/modules/db/schema";

/**
 * Mission reads, and create.
 *
 * The block that stood here said writes were absent on purpose: status and cut
 * were both NOT NULL with no default, the create contract supplied neither, and
 * inventing values would have meant inventing a shape the doc set does not
 * have. Migration 0008 answered it — status defaults to 'draft', cut is
 * nullable because it is not derivable until a repository is connected — so
 * create is now implementable without guessing. See the contract for why
 * neither field is accepted from the caller.
 *
 * UPDATE IS STILL ABSENT. `mission.update` accepts a partial of the whole
 * schema, which would let a caller set `cut` directly, and a freely-chosen cut
 * is the defect cut_source exists to prevent. That contract needs narrowing
 * before it gets a handler.
 */

/**
 * One row of the mission list. lastActivity and lastExportResult are NULL until
 * ActivityLog and Export exist: the contract already types them nullable, and
 * ROUTES.md forbids substituting updatedAt for audited activity.
 */
export type MissionListItem = {
	id: string;
	type: string;
	sprintN: number;
	status: string;
	clientName: string;
	lastActivity: string | null;
	lastExportResult: string | null;
};

/**
 * Cursor pagination keyed on created_at, which is stable against inserts —
 * pagination.ts's whole reason for a cursor over an offset. Ordered newest
 * first; the cursor is the created_at of the last row returned.
 */
export async function listMissions(
	db: Db,
	opts: { cursor?: string; limit: number },
): Promise<{
	items: MissionListItem[];
	total: number;
	nextCursor: string | null;
}> {
	const cursor = opts.cursor ? new Date(opts.cursor) : null;

	const rows = await db
		.select({
			id: missions.id,
			type: missions.type,
			sprintN: missions.sprintN,
			status: missions.status,
			clientName: clients.name,
			createdAt: missions.createdAt,
		})
		.from(missions)
		.innerJoin(engagements, eq(missions.engagementId, engagements.id))
		.innerJoin(clients, eq(engagements.clientId, clients.id))
		// live() is explicit — Drizzle has no middleware, so a forgotten filter
		// returns soft-deleted rows.
		.where(
			and(
				isNull(missions.deletedAt),
				cursor ? lt(missions.createdAt, cursor) : undefined,
			),
		)
		.orderBy(desc(missions.createdAt))
		.limit(opts.limit + 1);

	// One past the page proves whether another page exists without a second query.
	const hasMore = rows.length > opts.limit;
	const page = hasMore ? rows.slice(0, opts.limit) : rows;
	const last = page.at(-1);

	const [count] = await db
		.select({ total: sql<number>`count(*)::int` })
		.from(missions)
		.where(isNull(missions.deletedAt));

	return {
		items: page.map((r) => ({
			id: r.id,
			type: r.type,
			sprintN: r.sprintN,
			status: r.status,
			clientName: r.clientName,
			lastActivity: null,
			lastExportResult: null,
		})),
		total: count?.total ?? 0,
		nextCursor: hasMore && last ? last.createdAt.toISOString() : null,
	};
}

/** The full mission, serialized to the contract's shape (Dates → ISO strings). */
export type MissionView = {
	id: string;
	engagementId: string;
	type: string;
	brief: Record<string, unknown>;
	sprintN: number;
	status: string;
	/** null until mission setup derives it from the connected repository. */
	cut: "horizontal" | "vertical" | null;
	cutSource: "derived" | "overridden";
	cutRationale: string | null;
	repoUrl: string | null;
	spendCeilingUsd: number | null;
	createdAt: string;
	updatedAt: string;
};

export async function getMission(
	db: Db,
	id: string,
): Promise<MissionView | null> {
	const [row] = await db
		.select()
		.from(missions)
		.where(and(eq(missions.id, id), isNull(missions.deletedAt)))
		.limit(1);
	if (!row) return null;
	return {
		id: row.id,
		engagementId: row.engagementId,
		type: row.type,
		brief: row.brief,
		sprintN: row.sprintN,
		status: row.status,
		cut: row.cut,
		cutSource: row.cutSource,
		cutRationale: row.cutRationale,
		repoUrl: row.repoUrl,
		// numeric comes back as a string; the contract types it a nullable number.
		spendCeilingUsd:
			row.spendCeilingUsd === null ? null : Number(row.spendCeilingUsd),
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

/** The create contract's body, after parsing. */
export type CreateMissionInput = {
	engagementId: string;
	type: string;
	sprintN: number;
	brief?: Record<string, unknown>;
};

/**
 * Result rather than a thrown error, so the route maps a known failure to the
 * contract's 422 without reading exception messages. The contract lists 201 and
 * 422 for create and nothing else.
 */
export type CreateMissionResult =
	| { ok: true; mission: MissionView }
	| { ok: false; message: string };

/**
 * Creates a mission in its initial state: status 'draft', cut null.
 *
 * Neither is taken from the caller. `status` is the server's to set, and `cut`
 * is derived at mission setup by reading the connected repository — which does
 * not exist yet at capture time. Both are left to the column defaults from
 * migration 0008 rather than written here, so there is one place that decides
 * what a new mission looks like.
 */
export async function createMission(
	db: Db,
	input: CreateMissionInput,
): Promise<CreateMissionResult> {
	// The engagement is checked before the insert so a bad reference comes back
	// as the contract's 422 rather than as a foreign-key violation surfacing at
	// the route as a 500. The FK is still the real guard — this check can lose a
	// race with a concurrent soft-delete, and the database is what must win.
	const [engagement] = await db
		.select({ id: engagements.id })
		.from(engagements)
		.where(
			and(
				eq(engagements.id, input.engagementId),
				isNull(engagements.deletedAt),
			),
		)
		.limit(1);

	if (!engagement) {
		return {
			ok: false,
			message: `No engagement with id ${input.engagementId}.`,
		};
	}

	const [row] = await db
		.insert(missions)
		.values({
			engagementId: input.engagementId,
			type: input.type,
			sprintN: input.sprintN,
			// Omitted entirely when absent: the column defaults to {}, and passing
			// undefined through would write a null into a NOT NULL column.
			...(input.brief === undefined ? {} : { brief: input.brief }),
		})
		.returning();

	if (!row) {
		return { ok: false, message: "The mission could not be created." };
	}

	return {
		ok: true,
		mission: {
			id: row.id,
			engagementId: row.engagementId,
			type: row.type,
			brief: row.brief,
			sprintN: row.sprintN,
			status: row.status,
			cut: row.cut,
			cutSource: row.cutSource,
			cutRationale: row.cutRationale,
			repoUrl: row.repoUrl,
			spendCeilingUsd:
				row.spendCeilingUsd === null ? null : Number(row.spendCeilingUsd),
			createdAt: row.createdAt.toISOString(),
			updatedAt: row.updatedAt.toISOString(),
		},
	};
}
