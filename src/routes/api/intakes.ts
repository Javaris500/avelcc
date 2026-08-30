import { createFileRoute } from "@tanstack/react-router";

import { intakeContract } from "#/contract/intake";
import { db } from "#/modules/db/client";
import { shielded, withMethodGuard } from "#/modules/http/shielded";
import { listIntakes } from "#/modules/intake/service";

/**
 * GET /api/intakes — the request list, filterable by engagement and status.
 *
 * The query schema comes from the contract rather than being restated here, for
 * the reason `clients.ts` gives: a second copy in the handler is exactly how a
 * route and its client start to disagree.
 *
 * 200 and 403 only, no 422, so a malformed query is not an error — it falls
 * back to the schema's defaults and still returns a page. Returning a status
 * the contract does not list would be a response the client's error map has no
 * case for.
 *
 * POST is deliberately absent for now. Creating a request is a write and the
 * approval path is the priority; the contract declares `create` and this route
 * will grow it rather than a second file appearing.
 */
const listQuery = intakeContract.list.query;

export const Route = createFileRoute("/api/intakes")({
	server: {
		handlers: withMethodGuard({
			GET: ({ request }) =>
				shielded("intake list", async () => {
					const url = new URL(request.url);
					const parsed = listQuery.safeParse({
						cursor: url.searchParams.get("cursor") ?? undefined,
						limit: url.searchParams.get("limit") ?? undefined,
						engagementId: url.searchParams.get("engagementId") ?? undefined,
						status: url.searchParams.get("status") ?? undefined,
					});
					const query = parsed.success ? parsed.data : { limit: 25 };

					const { items, total, nextCursor } = await listIntakes(db, query);
					return Response.json({
						success: true,
						data: items,
						meta: { total, nextCursor },
					});
				}),
		}),
	},
});
