import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { getClient } from "#/modules/client/service";
import { db } from "#/modules/db/client";
import { notFound, shielded, withMethodGuard } from "#/modules/http/shielded";

/**
 * GET /api/clients/:id — one client. The contract allows 200 and 404 only.
 *
 * NOT_FOUND is the honest code here, unlike `exports.$id.ts`, which answers
 * REPO_NOT_FOUND for a missing export because `export.get` declares the
 * export-scoped envelope and ERROR_CODES has no word for it. `client.get`
 * declares crudErrorEnvelope, whose vocabulary contains exactly this.
 */
const uuid = z.string().uuid();

export const Route = createFileRoute("/api/clients/$id")({
	server: {
		handlers: withMethodGuard({
			GET: ({ request }) =>
				shielded("client get", async () => {
					const id = new URL(request.url).pathname.split("/").pop() ?? "";

					// Refused before the query: a non-uuid can never match a row, and
					// handing one to a uuid column raises at the database rather than
					// returning cleanly. "No client with that identifier" is exactly
					// what a malformed id means to the caller.
					if (!uuid.safeParse(id).success) {
						return notFound(`No client with id ${id}.`);
					}

					const client = await getClient(db, id);
					if (!client) return notFound(`No client with id ${id}.`);

					return Response.json({ success: true, data: client });
				}),
		}),
	},
});
