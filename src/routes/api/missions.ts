import { createFileRoute } from "@tanstack/react-router";

import { paginationQuery } from "#/contract/shared/pagination";
import { db } from "#/modules/db/client";
import { listMissions } from "#/modules/mission/service";

/**
 * GET /api/missions — the mission list. Server-side because it holds the db
 * client; the contract path is /missions and the route sits under /api, the
 * same split the preflight route uses.
 *
 * The contract declares only 200 and 403 here, no 422, so a malformed
 * pagination query is not an error — it falls back to the schema's defaults and
 * still returns a page. Returning a 422 the contract does not list would be a
 * response the client's error map has no case for.
 */
export const Route = createFileRoute("/api/missions")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const url = new URL(request.url);
				const parsed = paginationQuery.safeParse({
					cursor: url.searchParams.get("cursor") ?? undefined,
					limit: url.searchParams.get("limit") ?? undefined,
				});
				const query = parsed.success ? parsed.data : { limit: 25 };

				const { items, total, nextCursor } = await listMissions(db, query);
				return Response.json({
					success: true,
					data: items,
					meta: { total, nextCursor },
				});
			},
		},
	},
});
