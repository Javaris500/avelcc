import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { db } from "#/modules/db/client";
import { getEngagement } from "#/modules/engagement/service";
import { notFound, shielded, withMethodGuard } from "#/modules/http/shielded";

/**
 * GET /api/engagements/:id — one engagement. 200 and 404 only.
 *
 * The response carries no `startedAt` or `closedAt`. Both are in
 * DATA-CONTRACTS-V2's field block and in neither the schema nor the database;
 * see contract/engagement.ts for why the gap is reported rather than filled.
 */
const uuid = z.string().uuid();

export const Route = createFileRoute("/api/engagements/$id")({
	server: {
		handlers: withMethodGuard({
			GET: ({ request }) =>
				shielded("engagement get", async () => {
					const id = new URL(request.url).pathname.split("/").pop() ?? "";

					if (!uuid.safeParse(id).success) {
						return notFound(`No engagement with id ${id}.`);
					}

					const engagement = await getEngagement(db, id);
					if (!engagement) return notFound(`No engagement with id ${id}.`);

					return Response.json({ success: true, data: engagement });
				}),
		}),
	},
});
