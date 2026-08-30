import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { getConnection } from "#/modules/connection/service";
import { db } from "#/modules/db/client";
import { notFound, shielded } from "#/modules/http/shielded";

/**
 * GET /api/connections/:id — one connection. 200 and 404 only.
 *
 * This response DOES carry `credentialRef`, unlike the list. It names where a
 * token lives and is never the token itself, and inspecting one connection is
 * the question it answers. The list omits it because the same fact returned for
 * every connection at once is an inventory rather than a detail.
 */
const uuid = z.string().uuid();

export const Route = createFileRoute("/api/connections/$id")({
	server: {
		handlers: {
			GET: ({ request }) =>
				shielded("connection get", async () => {
					const id = new URL(request.url).pathname.split("/").pop() ?? "";

					if (!uuid.safeParse(id).success) {
						return notFound(`No connection with id ${id}.`);
					}

					const connection = await getConnection(db, id);
					if (!connection) return notFound(`No connection with id ${id}.`);

					return Response.json({ success: true, data: connection });
				}),
		},
	},
});
