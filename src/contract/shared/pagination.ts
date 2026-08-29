import { z } from "zod";

/**
 * Cursor pagination, not offset.
 *
 * ActivityLog is append-only and the mission list is ordered by activity, so
 * offsets shift under the reader as rows arrive: page 2 silently skips whatever
 * moved. A cursor is stable against inserts.
 */
export const paginationQuery = z.object({
	cursor: z.string().optional(),
	limit: z.coerce.number().int().min(1).max(100).default(25),
});

export type PaginationQuery = z.infer<typeof paginationQuery>;
