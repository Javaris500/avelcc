import { createFileRoute } from "@tanstack/react-router";

import { paginationQuery } from "#/contract/shared/pagination";
import { listSkills } from "#/modules/catalog/service";
import { db } from "#/modules/db/client";
import { shielded, withMethodGuard } from "#/modules/http/shielded";

/**
 * GET /api/skills — every skill, revoked included, with where each is attached.
 *
 * READ ONLY. The catalog "ships empty and is populated in-app", so something
 * must eventually write it, and this is not that. What a write looks like is
 * unspecified in DATA-CONTRACTS-V2, and inventing it here is the failure the
 * contract layer exists to prevent.
 *
 * 200 and 403 only, matching the contract. A malformed pagination query is not
 * an error: it falls back to the schema's defaults and still returns a page,
 * because returning a status the contract does not declare would be a response
 * the caller's error map has no case for. Same split as the client list.
 *
 * REVOKED ROWS ARE INCLUDED, which is the point of the screen behind this. A
 * withdrawn skill still attached to a live roster entry is a real defect this
 * project has shipped, and it is invisible on a screen that filters them out.
 */
export const Route = createFileRoute("/api/skills")({
	server: {
		handlers: withMethodGuard({
			GET: ({ request }) =>
				shielded("skill list", async () => {
					const url = new URL(request.url);
					const parsed = paginationQuery.safeParse({
						cursor: url.searchParams.get("cursor") ?? undefined,
						limit: url.searchParams.get("limit") ?? undefined,
					});
					const query = parsed.success ? parsed.data : { limit: 25 };

					const { items, total, nextCursor } = await listSkills(db, query);
					return Response.json({
						success: true,
						data: items,
						meta: { total, nextCursor },
					});
				}),
		}),
	},
});
