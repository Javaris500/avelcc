import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { db } from "#/modules/db/client";
import { shielded } from "#/modules/http/shielded";
import { getMission } from "#/modules/mission/service";

/**
 * GET /api/missions/:id — one mission. The contract allows 200 and 404 only.
 *
 * The id is read from the path rather than a params helper, matching the
 * request-only handler signature the other API routes use. A non-uuid can never
 * match a row, and handing it to a uuid column raises at the database instead of
 * returning cleanly, so it is rejected as a 404 before the query — "no mission
 * with that identifier" is exactly what a malformed id means to the caller.
 */
const uuid = z.string().uuid();

function notFound(id: string) {
	return Response.json(
		{
			success: false,
			error: {
				code: "NOT_FOUND",
				message: `No mission with id ${id}.`,
				requestId: crypto.randomUUID(),
			},
		},
		{ status: 404 },
	);
}

export const Route = createFileRoute("/api/missions/$id")({
	server: {
		handlers: {
			GET: ({ request }) =>
				shielded("mission read", async () => {
					const id = new URL(request.url).pathname.split("/").pop() ?? "";
					if (!uuid.safeParse(id).success) return notFound(id);

					const mission = await getMission(db, id);
					if (!mission) return notFound(id);

					return Response.json({ success: true, data: mission });
				}),
		},
	},
});
