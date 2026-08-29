import { and, desc, eq, isNull, lt, sql } from "drizzle-orm";

import type { Db } from "#/modules/db/client";
import { clients, engagements, missions } from "#/modules/db/schema";

/**
 * Mission reads.
 *
 * WRITES ARE ABSENT ON PURPOSE. missions.status and missions.cut are both
 * NOT NULL with no default and no vocabulary — status is typed z.string()
 * because "no closed vocabulary is defined anywhere", and cut is "derived from
 * the repository's directory structure" which does not exist at create time.
 * The create contract omits both. Supplying an initial value here would invent
 * a shape the contract does not define, so create/update wait on that decision
 * rather than guessing "draft" / "vertical".
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
	cut: "horizontal" | "vertical";
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
