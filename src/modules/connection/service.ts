import { and, desc, eq, isNull, lt, sql } from "drizzle-orm";

import type { Db } from "#/modules/db/client";
import { connections } from "#/modules/db/schema";

/**
 * Connection reads. There is no create; see contract/connection.ts for why.
 *
 * Shaped after modules/client/service.ts rather than as a third pattern: same
 * cursor pagination on created_at, same soft-delete filter, same Dates-to-ISO
 * at the edge.
 */

/**
 * NO credentialRef. The list projection omits it deliberately — see the comment
 * on connectionListRow. Keeping it out of the SELECT as well as out of the
 * response means the value is never read into a process that only browses, so
 * it cannot reach a log line or an error payload by accident.
 */
export type ConnectionListItem = {
	id: string;
	service: "github";
	label: string;
	engagementId: string | null;
	scopeType: "owner" | "repo";
	scopeValue: string;
	status: "active" | "expired" | "revoked";
	expiresAt: string | null;
	revokedAt: string | null;
};

export type ConnectionView = ConnectionListItem & {
	credentialRef: string;
	lastRotatedAt: string | null;
	createdAt: string;
	updatedAt: string;
};

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

export async function listConnections(
	db: Db,
	opts: { cursor?: string; limit: number },
): Promise<{
	items: ConnectionListItem[];
	total: number;
	nextCursor: string | null;
}> {
	const cursor = opts.cursor ? new Date(opts.cursor) : null;

	const rows = await db
		.select({
			id: connections.id,
			service: connections.service,
			label: connections.label,
			engagementId: connections.engagementId,
			scopeType: connections.scopeType,
			scopeValue: connections.scopeValue,
			status: connections.status,
			expiresAt: connections.expiresAt,
			revokedAt: connections.revokedAt,
			createdAt: connections.createdAt,
		})
		.from(connections)
		.where(
			and(
				isNull(connections.deletedAt),
				cursor ? lt(connections.createdAt, cursor) : undefined,
			),
		)
		.orderBy(desc(connections.createdAt))
		.limit(opts.limit + 1);

	const hasMore = rows.length > opts.limit;
	const page = hasMore ? rows.slice(0, opts.limit) : rows;
	const last = page.at(-1);

	const [count] = await db
		.select({ total: sql<number>`count(*)::int` })
		.from(connections)
		.where(isNull(connections.deletedAt));

	return {
		items: page.map((r) => ({
			id: r.id,
			service: r.service,
			label: r.label,
			engagementId: r.engagementId,
			scopeType: r.scopeType,
			scopeValue: r.scopeValue,
			status: r.status,
			expiresAt: iso(r.expiresAt),
			revokedAt: iso(r.revokedAt),
		})),
		total: count?.total ?? 0,
		nextCursor: hasMore && last ? last.createdAt.toISOString() : null,
	};
}

/**
 * A REVOKED CONNECTION IS STILL RETURNED, and that is the point of the status
 * field. Revocation is a state to be seen — "revocation is a step in engagement
 * close" and the screen has to show what was revoked and when — not a reason to
 * hide the row. Only a soft delete removes a connection from a read.
 */
export async function getConnection(
	db: Db,
	id: string,
): Promise<ConnectionView | null> {
	const [row] = await db
		.select()
		.from(connections)
		.where(and(eq(connections.id, id), isNull(connections.deletedAt)))
		.limit(1);
	if (!row) return null;
	return {
		id: row.id,
		service: row.service,
		label: row.label,
		engagementId: row.engagementId,
		scopeType: row.scopeType,
		scopeValue: row.scopeValue,
		credentialRef: row.credentialRef,
		status: row.status,
		expiresAt: iso(row.expiresAt),
		lastRotatedAt: iso(row.lastRotatedAt),
		revokedAt: iso(row.revokedAt),
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}
