import { createFileRoute } from "@tanstack/react-router";

import { paginationQuery } from "#/contract/shared/pagination";
import { listConnections } from "#/modules/connection/service";
import { db } from "#/modules/db/client";
import { shielded } from "#/modules/http/shielded";

/**
 * GET /api/connections — the connection list.
 *
 * GET ONLY. There is no POST here and its absence is deliberate: creating a
 * Connection means deciding what `credential_ref` points at, which is a
 * security decision nobody has made. See contract/connection.ts.
 *
 * The rows carry no `credentialRef`. One connection's is a detail; every
 * connection's, returned together, is an inventory of where this deployment
 * keeps its credentials. The service does not even select the column, so a
 * browse can never put it in a log line.
 */
export const Route = createFileRoute("/api/connections")({
	server: {
		handlers: {
			GET: ({ request }) =>
				shielded("connection list", async () => {
					const url = new URL(request.url);
					const parsed = paginationQuery.safeParse({
						cursor: url.searchParams.get("cursor") ?? undefined,
						limit: url.searchParams.get("limit") ?? undefined,
					});
					const query = parsed.success ? parsed.data : { limit: 25 };

					const { items, total, nextCursor } = await listConnections(db, query);
					return Response.json({
						success: true,
						data: items,
						meta: { total, nextCursor },
					});
				}),
		},
	},
});
