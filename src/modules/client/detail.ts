import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { Db } from "#/modules/db/client";
import {
	agentTemplates,
	blockers,
	clients,
	completions,
	connections,
	costEntries,
	dispatches,
	engagements,
	exports as exportsTable,
	findings,
	intakes,
	missions,
	rosterEntries,
} from "#/modules/db/schema";

/**
 * The client detail aggregates — the masthead and the nine sections.
 *
 * EVERY READ HERE IS A TWO-HOP JOIN, and that is the schema being honest rather
 * than a shortcoming. `client_id` exists in exactly ONE place in the whole
 * schema: `engagements.clientId`. Nothing else points at a client — not
 * missions, not exports, not dispatches. So a client reaches its work only
 * through its engagements, and the engagement is the SPINE of this page rather
 * than one section among nine.
 *
 * Found by avel-c2 against UI-PLAN section 5, which had placed Requests on the
 * client page as though intake were client-scoped. It is `engagement_id FK ->
 * Engagement` at DATA-CONTRACTS-V2:130.
 *
 * NO ENGAGEMENTS IS NOT ZERO, and the two must not render the same. A client
 * with no engagement has no metrics — there is nowhere for a mission to live
 * yet, so "0 missions" would be a measurement of something that cannot exist.
 * A client WITH engagements and no missions genuinely has zero, and that is a
 * different fact about a different situation. `metrics` is therefore null in
 * the first case and a real object of zeros in the second.
 *
 * Every select filters `deletedAt` explicitly. Drizzle has no middleware, so a
 * forgotten filter returns soft-deleted rows silently — softDelete.test.ts
 * scans this file for exactly that.
 */

export type ClientMetrics = {
	missions: number;
	blockedMissions: number;
	deliveries: number;
	/** Decimal string, never a float. Money. Null when nothing is logged. */
	spendUsd: string | null;
};

export type ClientDetail = {
	engagementIds: string[];
	/**
	 * NULL when the client has no live engagement. Distinct from an object of
	 * zeros, which means engagements exist and nothing has happened in them.
	 */
	metrics: ClientMetrics | null;
	openRequests: number;
	lastActivityAt: string | null;
};

/** The live engagement ids for a client. The spine every other read hangs on. */
async function engagementIdsFor(db: Db, clientId: string): Promise<string[]> {
	const rows = await db
		.select({ id: engagements.id })
		.from(engagements)
		.where(
			and(eq(engagements.clientId, clientId), isNull(engagements.deletedAt)),
		);
	return rows.map((r) => r.id);
}

/**
 * Open blockers per mission.
 *
 * AN ANTI-JOIN, NOT A CORRELATED SUBQUERY, and that is the whole point of this
 * function existing. A blocker is open when no later row closes it — the ledger
 * is append-only and closure is a new row referencing the old, so a row's own
 * `status` records what was true when it was written and current state is found
 * by reading forward.
 *
 * Written with `alias()` and a LEFT JOIN rather than hand-written SQL because
 * hand-written SQL is what broke: drizzle renders `${table.column}` UNQUALIFIED
 * inside a `sql` template, so a correlation to an outer table silently resolved
 * against the inner one and matched nothing. Every reference here is qualified
 * by drizzle itself and cannot drift that way.
 */
async function openBlockersByMission(
	db: Db,
	missionIds: string[],
): Promise<Map<string, number>> {
	if (missionIds.length === 0) return new Map();
	const closer = alias(blockers, "closer");
	const rows = await db
		.select({
			missionId: blockers.missionId,
			open: sql<number>`count(*)::int`,
		})
		.from(blockers)
		.leftJoin(closer, eq(closer.closesBlockerId, blockers.id))
		.where(and(inArray(blockers.missionId, missionIds), isNull(closer.id)))
		.groupBy(blockers.missionId);
	return new Map(rows.map((r) => [r.missionId, r.open]));
}

/**
 * The masthead. Four metrics, the open-request count, and last activity.
 *
 * Returns null when the client itself does not exist or is soft-deleted, so a
 * caller cannot mistake "no such client" for "a client with nothing in it".
 */
export async function getClientDetail(
	db: Db,
	clientId: string,
): Promise<ClientDetail | null> {
	const [client] = await db
		.select({ id: clients.id })
		.from(clients)
		.where(and(eq(clients.id, clientId), isNull(clients.deletedAt)))
		.limit(1);
	if (!client) return null;

	const engagementIds = await engagementIdsFor(db, clientId);

	if (engagementIds.length === 0) {
		// THE DISTINGUISHABLE STATE. Not zeros: there is nowhere for a mission to
		// live yet, so counting them measures something that cannot exist.
		return {
			engagementIds: [],
			metrics: null,
			openRequests: 0,
			lastActivityAt: null,
		};
	}

	// Mission ids rather than a count, because `blockedMissions` needs them and
	// counting rows twice to avoid carrying a list would be the worse trade.
	const missionRows = await db
		.select({ id: missions.id })
		.from(missions)
		.where(
			and(
				inArray(missions.engagementId, engagementIds),
				isNull(missions.deletedAt),
			),
		);
	const missionIds = missionRows.map((r) => r.id);
	const openByMission = await openBlockersByMission(db, missionIds);

	const [deliveryCount] = await db
		.select({ total: sql<number>`count(*)::int` })
		.from(exportsTable)
		.innerJoin(missions, eq(exportsTable.missionId, missions.id))
		.where(
			and(
				inArray(missions.engagementId, engagementIds),
				isNull(missions.deletedAt),
			),
		);

	const [spend] = await db
		.select({ total: sql<string | null>`sum(${costEntries.usd})::text` })
		.from(costEntries)
		.innerJoin(missions, eq(costEntries.missionId, missions.id))
		.where(
			and(
				inArray(missions.engagementId, engagementIds),
				isNull(missions.deletedAt),
			),
		);

	const [requests] = await db
		.select({ total: sql<number>`count(*)::int` })
		.from(intakes)
		.where(
			and(
				inArray(intakes.engagementId, engagementIds),
				isNull(intakes.deletedAt),
				// Open means undecided. `approved` and `rejected` are both decisions.
				inArray(intakes.status, ["draft", "proposed"]),
			),
		);

	const [activity] = await db
		.select({ at: sql<Date | null>`max(${missions.updatedAt})` })
		.from(missions)
		.where(
			and(
				inArray(missions.engagementId, engagementIds),
				isNull(missions.deletedAt),
			),
		);

	return {
		engagementIds,
		metrics: {
			missions: missionIds.length,
			blockedMissions: openByMission.size,
			deliveries: deliveryCount?.total ?? 0,
			spendUsd: spend?.total ?? null,
		},
		openRequests: requests?.total ?? 0,
		lastActivityAt: activity?.at ? new Date(activity.at).toISOString() : null,
	};
}

/* ── the sections ───────────────────────────────────────────────────────── */

export type EngagementRow = {
	id: string;
	name: string;
	status: "active" | "closed";
	startedAt: string;
	missionCount: number;
};

export async function engagementsForClient(
	db: Db,
	clientId: string,
): Promise<EngagementRow[]> {
	// LEFT JOIN with the soft-delete filter in the JOIN CONDITION, not the WHERE.
	// In the WHERE it would turn this into an inner join and drop engagements
	// with no live missions entirely — the row would vanish rather than read 0.
	const rows = await db
		.select({
			id: engagements.id,
			name: engagements.name,
			status: engagements.status,
			createdAt: engagements.createdAt,
			// count(missions.id), not count(*): a left join with no match yields one
			// row of nulls, and count(*) would report that as 1.
			missionCount: sql<number>`count(${missions.id})::int`,
		})
		.from(engagements)
		.leftJoin(
			missions,
			and(
				eq(missions.engagementId, engagements.id),
				isNull(missions.deletedAt),
			),
		)
		.where(
			and(eq(engagements.clientId, clientId), isNull(engagements.deletedAt)),
		)
		.groupBy(
			engagements.id,
			engagements.name,
			engagements.status,
			engagements.createdAt,
		)
		.orderBy(desc(engagements.createdAt));

	return rows.map((r) => ({
		id: r.id,
		name: r.name,
		status: r.status,
		startedAt: r.createdAt.toISOString(),
		missionCount: r.missionCount,
	}));
}

export type MissionRow = {
	id: string;
	engagementId: string;
	title: string | null;
	type: string;
	status: string;
	sprintN: number;
	cut: "horizontal" | "vertical" | null;
	openBlockers: number;
};

/** Flattened across engagements — "show me the mission" is the question. */
export async function missionsForClient(
	db: Db,
	clientId: string,
): Promise<MissionRow[]> {
	const engagementIds = await engagementIdsFor(db, clientId);
	if (engagementIds.length === 0) return [];

	const rows = await db
		.select({
			id: missions.id,
			engagementId: missions.engagementId,
			title: missions.title,
			type: missions.type,
			status: missions.status,
			sprintN: missions.sprintN,
			cut: missions.cut,
		})
		.from(missions)
		.where(
			and(
				inArray(missions.engagementId, engagementIds),
				isNull(missions.deletedAt),
			),
		)
		.orderBy(desc(missions.createdAt));

	// Merged from one grouped anti-join rather than a per-row subquery. Same
	// reason as above: a correlated `sql` template rendered the outer column
	// unqualified and matched nothing, so every mission read 0 open blockers.
	const openByMission = await openBlockersByMission(
		db,
		rows.map((r) => r.id),
	);

	return rows.map((r) => ({
		...r,
		openBlockers: openByMission.get(r.id) ?? 0,
	}));
}

export type DeliveryRow = {
	id: string;
	missionId: string;
	targetKind: string;
	status: string;
	snapshotSha256: string | null;
	createdAt: string;
};

export async function deliveriesForClient(
	db: Db,
	clientId: string,
): Promise<DeliveryRow[]> {
	const engagementIds = await engagementIdsFor(db, clientId);
	if (engagementIds.length === 0) return [];

	const rows = await db
		.select({
			id: exportsTable.id,
			missionId: exportsTable.missionId,
			targetKind: exportsTable.targetKind,
			status: exportsTable.status,
			snapshotSha256: exportsTable.snapshotSha256,
			createdAt: exportsTable.createdAt,
		})
		.from(exportsTable)
		.innerJoin(missions, eq(exportsTable.missionId, missions.id))
		.where(
			and(
				inArray(missions.engagementId, engagementIds),
				isNull(missions.deletedAt),
			),
		)
		.orderBy(desc(exportsTable.createdAt));

	return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

export type RosterRow = {
	agentTemplateId: string;
	slug: string;
	name: string;
	kind: "horizontal" | "feature";
	missionCount: number;
};

/** Which agent templates have worked this client, and on how many missions. */
export async function rosterForClient(
	db: Db,
	clientId: string,
): Promise<RosterRow[]> {
	const engagementIds = await engagementIdsFor(db, clientId);
	if (engagementIds.length === 0) return [];

	const rows = await db
		.select({
			agentTemplateId: agentTemplates.id,
			slug: agentTemplates.slug,
			name: agentTemplates.name,
			kind: agentTemplates.kind,
			missionCount: sql<number>`count(distinct ${rosterEntries.missionId})::int`,
		})
		.from(rosterEntries)
		.innerJoin(missions, eq(rosterEntries.missionId, missions.id))
		.innerJoin(
			agentTemplates,
			eq(rosterEntries.agentTemplateId, agentTemplates.id),
		)
		.where(
			and(
				inArray(missions.engagementId, engagementIds),
				isNull(missions.deletedAt),
				isNull(agentTemplates.deletedAt),
			),
		)
		.groupBy(
			agentTemplates.id,
			agentTemplates.slug,
			agentTemplates.name,
			agentTemplates.kind,
		);

	return rows.map((r) => ({ ...r }));
}

export type RepositoryRow = {
	id: string;
	label: string;
	scopeType: "owner" | "repo";
	scopeValue: string;
	status: "active" | "expired" | "revoked";
};

/**
 * Connection targets for this client's engagements.
 *
 * `connections.engagementId` is NULLABLE — V1 reads one account-wide token from
 * env and it belongs to no engagement — so an account-wide connection is not a
 * repository OF this client and is deliberately excluded rather than shown
 * against every client.
 */
export async function repositoriesForClient(
	db: Db,
	clientId: string,
): Promise<RepositoryRow[]> {
	const engagementIds = await engagementIdsFor(db, clientId);
	if (engagementIds.length === 0) return [];

	const rows = await db
		.select({
			id: connections.id,
			label: connections.label,
			scopeType: connections.scopeType,
			scopeValue: connections.scopeValue,
			status: connections.status,
		})
		.from(connections)
		.where(
			and(
				inArray(connections.engagementId, engagementIds),
				isNull(connections.deletedAt),
			),
		)
		.orderBy(desc(connections.createdAt));

	return rows.map((r) => ({ ...r }));
}

export type CostRow = {
	id: string;
	missionId: string;
	actorKind: "agent" | "operator";
	actorRef: string;
	usd: string | null;
	outcome: string | null;
	occurredOn: string | null;
};

export async function costForClient(
	db: Db,
	clientId: string,
): Promise<CostRow[]> {
	const engagementIds = await engagementIdsFor(db, clientId);
	if (engagementIds.length === 0) return [];

	const rows = await db
		.select({
			id: costEntries.id,
			missionId: costEntries.missionId,
			actorKind: costEntries.actorKind,
			actorRef: costEntries.actorRef,
			usd: costEntries.usd,
			outcome: costEntries.outcome,
			occurredOn: costEntries.occurredOn,
		})
		.from(costEntries)
		.innerJoin(missions, eq(costEntries.missionId, missions.id))
		.where(
			and(
				inArray(missions.engagementId, engagementIds),
				isNull(missions.deletedAt),
			),
		)
		.orderBy(desc(costEntries.recordedAt));

	return rows.map((r) => ({ ...r }));
}

export type ActivityEvent = {
	kind: "dispatch" | "completion" | "finding" | "blocker";
	id: string;
	missionId: string;
	at: string;
	label: string;
};

/**
 * One time-ordered feed across the telemetry tables.
 *
 * APPEND-ONLY, so this is a log and needs no edit affordance — the tables
 * refuse UPDATE and DELETE at the database, which is why a timeline over them
 * can be trusted to be what happened rather than what someone last said.
 *
 * Four queries rather than one UNION so each keeps its own join and its own
 * soft-delete filter on `missions`. A UNION would need the filter repeated four
 * times anyway, and the scanner reads each select separately.
 */
export async function activityForClient(
	db: Db,
	clientId: string,
	limit = 50,
): Promise<ActivityEvent[]> {
	const engagementIds = await engagementIdsFor(db, clientId);
	if (engagementIds.length === 0) return [];

	// THE FILTER IS REPEATED IN EACH QUERY RATHER THAN HOISTED, deliberately.
	// A shared `and(...)` const reads tidier and is just as correct at runtime —
	// but softDelete.test.ts is a STATIC scan, and it cannot see a filter through
	// a variable. Hoisting it defeats the guard while leaving the code looking
	// right, which is precisely the shape of the bug that guard exists to catch:
	// "nothing makes you name the filter, so forgetting it is silent". Naming it
	// four times is the cost of the check being able to see it.
	const [d, c, f, b] = await Promise.all([
		db
			.select({
				id: dispatches.id,
				missionId: dispatches.missionId,
				at: dispatches.dispatchedAt,
				label: dispatches.dispatchRef,
			})
			.from(dispatches)
			.innerJoin(missions, eq(dispatches.missionId, missions.id))
			.where(
				and(
					inArray(missions.engagementId, engagementIds),
					isNull(missions.deletedAt),
				),
			),
		db
			.select({
				id: completions.id,
				missionId: dispatches.missionId,
				at: completions.completedAt,
				label: completions.status,
			})
			.from(completions)
			.innerJoin(dispatches, eq(completions.dispatchId, dispatches.id))
			.innerJoin(missions, eq(dispatches.missionId, missions.id))
			.where(
				and(
					inArray(missions.engagementId, engagementIds),
					isNull(missions.deletedAt),
				),
			),
		db
			.select({
				id: findings.id,
				missionId: findings.missionId,
				at: findings.openedAt,
				label: findings.severity,
			})
			.from(findings)
			.innerJoin(missions, eq(findings.missionId, missions.id))
			.where(
				and(
					inArray(missions.engagementId, engagementIds),
					isNull(missions.deletedAt),
				),
			),
		db
			.select({
				id: blockers.id,
				missionId: blockers.missionId,
				at: blockers.raisedAt,
				label: blockers.status,
			})
			.from(blockers)
			.innerJoin(missions, eq(blockers.missionId, missions.id))
			.where(
				and(
					inArray(missions.engagementId, engagementIds),
					isNull(missions.deletedAt),
				),
			),
	]);

	const merged: ActivityEvent[] = [
		...d.map((r) => ({ kind: "dispatch" as const, ...r })),
		...c.map((r) => ({ kind: "completion" as const, ...r })),
		...f.map((r) => ({ kind: "finding" as const, ...r })),
		...b.map((r) => ({ kind: "blocker" as const, ...r })),
	].map((r) => ({ ...r, at: r.at.toISOString() }));

	// Newest first, and ties broken by id so the order is stable across calls
	// rather than whatever the four queries happened to return.
	merged.sort((x, y) =>
		x.at === y.at ? x.id.localeCompare(y.id) : x.at < y.at ? 1 : -1,
	);
	return merged.slice(0, limit);
}
