import { and, desc, eq, isNull, lt, sql } from "drizzle-orm";

import type { Db } from "#/modules/db/client";
import { clients } from "#/modules/db/schema";

/**
 * Client reads and create.
 *
 * Shaped after `modules/mission/service.ts` rather than as a second pattern:
 * same cursor pagination on created_at, same soft-delete filter, same
 * Result-rather-than-throw for a known failure, same Dates-to-ISO at the edge.
 */

export type ClientListItem = {
	id: string;
	name: string;
	status: "active" | "closed";
	primaryContact: string | null;
};

export type ClientView = ClientListItem & {
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

	return {
		items: page.map((r) => ({
			id: r.id,
			name: r.name,
			status: r.status,
			primaryContact: r.primaryContact,
		})),
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
