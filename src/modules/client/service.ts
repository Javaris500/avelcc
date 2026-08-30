import { and, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { Db } from "#/modules/db/client";
import {
	blockers,
	clients,
	engagements,
	intakes,
	missions,
} from "#/modules/db/schema";

/**
 * Client reads and create.
 *
 * Shaped after `modules/mission/service.ts` rather than as a second pattern:
 * same cursor pagination on created_at, same soft-delete filter, same
 * Result-rather-than-throw for a known failure, same Dates-to-ISO at the edge.
 */

export type ClientBase = {
	id: string;
	name: string;
	status: "active" | "closed";
	primaryContact: string | null;
};

/** The list row. Carries the aggregates the detail read does not. */
export type ClientListItem = ClientBase & {
	/** Undecided requests. `draft` and `proposed`; the other two are decisions. */
	openRequests: number;
	activeMissions: number;
	/**
	 * Missions carrying a blocker nothing has closed. THE SIGNAL THE ROW IS FOR:
	 * UI-PLAN section 5 asks that a client with blocked work look different in
	 * the list, before you click.
	 */
	openBlockers: number;
	lastActivityAt: string | null;
};

/**
 * The per-client aggregates, in three grouped queries merged in JS.
 *
 * NO CORRELATED `sql` SUBQUERIES, and that is not a style preference. Drizzle
 * renders `${table.column}` UNQUALIFIED inside a template, so a correlation to
 * an outer table silently resolves against the INNER one and matches nothing.
 * That shipped three wrong counts on the client detail page, two of which
 * returned a plausible zero and were invisible until the telemetry tables had
 * rows. Every join here is one drizzle renders itself.
 *
 * EVERYTHING IS TWO HOPS. `client_id` exists in exactly one place in the schema
 * — `engagements.clientId` — so a client reaches its work only through its
 * engagements, and every query below starts there.
 */
async function aggregatesFor(
	db: Db,
	clientIds: string[],
): Promise<
	Map<
		string,
		{
			openRequests: number;
			activeMissions: number;
			openBlockers: number;
			lastActivityAt: Date | null;
		}
	>
> {
	const out = new Map<
		string,
		{
			openRequests: number;
			activeMissions: number;
			openBlockers: number;
			lastActivityAt: Date | null;
		}
	>();
	if (clientIds.length === 0) return out;
	const row = (id: string) => {
		const existing = out.get(id);
		if (existing) return existing;
		const fresh = {
			openRequests: 0,
			activeMissions: 0,
			openBlockers: 0,
			lastActivityAt: null as Date | null,
		};
		out.set(id, fresh);
		return fresh;
	};

	// Missions and last activity. LEFT JOIN with the soft-delete filter in the
	// JOIN CONDITION: in the WHERE it becomes an inner join and a client with no
	// live mission disappears from the result instead of reporting zero.
	const m = await db
		.select({
			clientId: engagements.clientId,
			missions: sql<number>`count(${missions.id})::int`,
			lastActivity: sql<Date | null>`max(${missions.updatedAt})`,
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
			and(
				inArray(engagements.clientId, clientIds),
				isNull(engagements.deletedAt),
			),
		)
		.groupBy(engagements.clientId);
	for (const r of m) {
		const e = row(r.clientId);
		e.activeMissions = r.missions;
		e.lastActivityAt = r.lastActivity ? new Date(r.lastActivity) : null;
	}

	// Open blockers: an anti-join, because closure is a NEW ROW referencing the
	// old one. A blocker's own `status` records what was true when it was
	// written, so reading that column would report one closed four rows ago as
	// still open.
	const closer = alias(blockers, "closer");
	const b = await db
		.select({
			clientId: engagements.clientId,
			open: sql<number>`count(*)::int`,
		})
		.from(blockers)
		.innerJoin(missions, eq(missions.id, blockers.missionId))
		.innerJoin(engagements, eq(engagements.id, missions.engagementId))
		.leftJoin(closer, eq(closer.closesBlockerId, blockers.id))
		.where(
			and(
				inArray(engagements.clientId, clientIds),
				isNull(missions.deletedAt),
				isNull(engagements.deletedAt),
				isNull(closer.id),
			),
		)
		.groupBy(engagements.clientId);
	for (const r of b) row(r.clientId).openBlockers = r.open;

	// Undecided requests.
	const i = await db
		.select({
			clientId: engagements.clientId,
			open: sql<number>`count(*)::int`,
		})
		.from(intakes)
		.innerJoin(engagements, eq(engagements.id, intakes.engagementId))
		.where(
			and(
				inArray(engagements.clientId, clientIds),
				isNull(intakes.deletedAt),
				isNull(engagements.deletedAt),
				inArray(intakes.status, ["draft", "proposed"]),
			),
		)
		.groupBy(engagements.clientId);
	for (const r of i) row(r.clientId).openRequests = r.open;

	return out;
}

export type ClientView = ClientBase & {
	notesMd: string | null;
	createdAt: string;
	updatedAt: string;
};

/**
 * Cursor pagination keyed on created_at, which is stable against inserts.
 * Ordered newest first; the cursor is the created_at of the last row returned.
 */
export async function listClients(
	db: Db,
	opts: { cursor?: string; limit: number },
): Promise<{
	items: ClientListItem[];
	total: number;
	nextCursor: string | null;
}> {
	const cursor = opts.cursor ? new Date(opts.cursor) : null;

	const rows = await db
		.select({
			id: clients.id,
			name: clients.name,
			status: clients.status,
			primaryContact: clients.primaryContact,
			createdAt: clients.createdAt,
		})
		.from(clients)
		// Explicit, because Drizzle has no middleware and a forgotten filter
		// returns soft-deleted rows.
		.where(
			and(
				isNull(clients.deletedAt),
				cursor ? lt(clients.createdAt, cursor) : undefined,
			),
		)
		.orderBy(desc(clients.createdAt))
		.limit(opts.limit + 1);

	// One past the page proves whether another page exists without a second query.
	const hasMore = rows.length > opts.limit;
	const page = hasMore ? rows.slice(0, opts.limit) : rows;
	const last = page.at(-1);

	const [count] = await db
		.select({ total: sql<number>`count(*)::int` })
		.from(clients)
		.where(isNull(clients.deletedAt));

	// One extra round trip for the whole page rather than one per row. The
	// aggregates are three grouped queries keyed by client, merged here.
	const agg = await aggregatesFor(
		db,
		page.map((r) => r.id),
	);

	return {
		items: page.map((r) => {
			const a = agg.get(r.id);
			return {
				id: r.id,
				name: r.name,
				status: r.status,
				primaryContact: r.primaryContact,
				openRequests: a?.openRequests ?? 0,
				activeMissions: a?.activeMissions ?? 0,
				openBlockers: a?.openBlockers ?? 0,
				lastActivityAt: a?.lastActivityAt
					? a.lastActivityAt.toISOString()
					: null,
			};
		}),
		total: count?.total ?? 0,
		nextCursor: hasMore && last ? last.createdAt.toISOString() : null,
	};
}

export async function getClient(
	db: Db,
	id: string,
): Promise<ClientView | null> {
	const [row] = await db
		.select()
		.from(clients)
		.where(and(eq(clients.id, id), isNull(clients.deletedAt)))
		.limit(1);
	if (!row) return null;
	return {
		id: row.id,
		name: row.name,
		status: row.status,
		primaryContact: row.primaryContact,
		notesMd: row.notesMd,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

export type CreateClientInput = {
	name: string;
	primaryContact?: string | null;
	notesMd?: string | null;
};

export type CreateClientResult =
	| { ok: true; client: ClientView }
	| { ok: false; message: string };

/**
 * Creates a client in its initial state. `status` is not taken from the caller
 * and is left to the column default: a client is active the moment it exists,
 * and one created closed would be a client nobody ever opened.
 */
export async function createClient(
	db: Db,
	input: CreateClientInput,
): Promise<CreateClientResult> {
	const [row] = await db
		.insert(clients)
		.values({
			name: input.name,
			// Omitted entirely when absent rather than written as null, so the
			// column's own default decides. Passing undefined through would be a
			// different statement than not naming the column.
			...(input.primaryContact == null
				? {}
				: { primaryContact: input.primaryContact }),
			...(input.notesMd == null ? {} : { notesMd: input.notesMd }),
		})
		.returning();

	if (!row) return { ok: false, message: "The client could not be created." };

	return {
		ok: true,
		client: {
			id: row.id,
			name: row.name,
			status: row.status,
			primaryContact: row.primaryContact,
			notesMd: row.notesMd,
			createdAt: row.createdAt.toISOString(),
			updatedAt: row.updatedAt.toISOString(),
		},
	};
}
