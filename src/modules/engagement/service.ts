import { and, desc, eq, isNull, lt, sql } from "drizzle-orm";

import type { Db } from "#/modules/db/client";
import { clients, engagements } from "#/modules/db/schema";

/**
 * Engagement reads and create.
 *
 * `started_at` and `closed_at` are in DATA-CONTRACTS-V2's field block and in
 * neither the schema nor the database, so nothing here can return them. See the
 * comment on `contract/engagement.ts` for why they are reported rather than
 * invented.
 */

export type EngagementListItem = {
	id: string;
	clientId: string;
	name: string;
	status: "active" | "closed";
	clientName: string;
};

export type EngagementView = {
	id: string;
	clientId: string;
	name: string;
	scopeMd: string | null;
	status: "active" | "closed";
	createdAt: string;
	updatedAt: string;
};

export async function listEngagements(
	db: Db,
	opts: { cursor?: string; limit: number },
): Promise<{
	items: EngagementListItem[];
	total: number;
	nextCursor: string | null;
}> {
	const cursor = opts.cursor ? new Date(opts.cursor) : null;

	const rows = await db
		.select({
			id: engagements.id,
			clientId: engagements.clientId,
			name: engagements.name,
			status: engagements.status,
			clientName: clients.name,
			createdAt: engagements.createdAt,
		})
		.from(engagements)
		.innerJoin(clients, eq(engagements.clientId, clients.id))
		/**
		 * BOTH soft-delete filters, not just the engagement's. A client is soft
		 * deletable and its engagements are not cascaded, so filtering only the
		 * near side would list engagements belonging to a client that no read can
		 * return — rows whose `clientName` names something the API says is gone.
		 */
		.where(
			and(
				isNull(engagements.deletedAt),
				isNull(clients.deletedAt),
				cursor ? lt(engagements.createdAt, cursor) : undefined,
			),
		)
		.orderBy(desc(engagements.createdAt))
		.limit(opts.limit + 1);

	const hasMore = rows.length > opts.limit;
	const page = hasMore ? rows.slice(0, opts.limit) : rows;
	const last = page.at(-1);

	/**
	 * The count is over the SAME predicate as the page, including the join, so
	 * `total` and the rows cannot disagree. Counting engagements alone would
	 * report a total the list can never reach.
	 */
	const [count] = await db
		.select({ total: sql<number>`count(*)::int` })
		.from(engagements)
		.innerJoin(clients, eq(engagements.clientId, clients.id))
		.where(and(isNull(engagements.deletedAt), isNull(clients.deletedAt)));

	return {
		items: page.map((r) => ({
			id: r.id,
			clientId: r.clientId,
			name: r.name,
			status: r.status,
			clientName: r.clientName,
		})),
		total: count?.total ?? 0,
		nextCursor: hasMore && last ? last.createdAt.toISOString() : null,
	};
}

export async function getEngagement(
	db: Db,
	id: string,
): Promise<EngagementView | null> {
	const [row] = await db
		.select()
		.from(engagements)
		.where(and(eq(engagements.id, id), isNull(engagements.deletedAt)))
		.limit(1);
	if (!row) return null;
	return {
		id: row.id,
		clientId: row.clientId,
		name: row.name,
		scopeMd: row.scopeMd,
		status: row.status,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

export type CreateEngagementInput = {
	clientId: string;
	name: string;
	scopeMd?: string | null;
};

export type CreateEngagementResult =
	| { ok: true; engagement: EngagementView }
	| { ok: false; message: string };

export async function createEngagement(
	db: Db,
	input: CreateEngagementInput,
): Promise<CreateEngagementResult> {
	/**
	 * The client is checked before the insert so a bad reference comes back as
	 * the contract's 422 rather than as a foreign-key violation surfacing as a
	 * 500. The FK is still the real guard — this check can lose a race with a
	 * concurrent soft-delete, and the database is what must win. Same shape as
	 * createMission's engagement check.
	 */
	const [client] = await db
		.select({ id: clients.id })
		.from(clients)
		.where(and(eq(clients.id, input.clientId), isNull(clients.deletedAt)))
		.limit(1);

	if (!client) {
		return { ok: false, message: `No client with id ${input.clientId}.` };
	}

	const [row] = await db
		.insert(engagements)
		.values({
			clientId: input.clientId,
			name: input.name,
			...(input.scopeMd == null ? {} : { scopeMd: input.scopeMd }),
		})
		.returning();

	if (!row) {
		return { ok: false, message: "The engagement could not be created." };
	}

	return {
		ok: true,
		engagement: {
			id: row.id,
			clientId: row.clientId,
			name: row.name,
			scopeMd: row.scopeMd,
			status: row.status,
			createdAt: row.createdAt.toISOString(),
			updatedAt: row.updatedAt.toISOString(),
		},
	};
}
