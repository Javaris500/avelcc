import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { db } from "#/modules/db/client";
import { notFound, shielded, withMethodGuard } from "#/modules/http/shielded";
import { getIntake } from "#/modules/intake/service";

/**
 * GET /api/intakes/:id — one request. 200 and 404 only.
 *
 * NOT_FOUND is the honest code here, as it is for `clients.$id.ts`: the intake
 * contract declares crudErrorEnvelope, whose vocabulary contains exactly this.
 */
const uuid = z.string().uuid();

export const Route = createFileRoute("/api/intakes/$id")({
	server: {
		handlers: withMethodGuard({
			GET: ({ request }) =>
				shielded("intake get", async () => {
					const id = new URL(request.url).pathname.split("/").pop() ?? "";

					// Refused before the query: a non-uuid can never match a row, and
					// handing one to a uuid column raises at the database rather than
					// returning cleanly.
					if (!uuid.safeParse(id).success) {
						return notFound(`No request with id ${id}.`);
					}

					const intake = await getIntake(db, id);
					if (!intake) return notFound(`No request with id ${id}.`);

					return Response.json({ success: true, data: intake });
				}),
		}),
	},
});
