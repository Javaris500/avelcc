import { createFileRoute } from "@tanstack/react-router";

import { clientContract } from "#/contract/client";
import { paginationQuery } from "#/contract/shared/pagination";
import { createClient, listClients } from "#/modules/client/service";
import { db } from "#/modules/db/client";
import {
	shielded,
	validationFailed,
	withMethodGuard,
} from "#/modules/http/shielded";

/**
 * GET /api/clients — the client list. POST /api/clients — create one.
 *
 * The body schema comes from the contract rather than being restated here: the
 * point of the contract layer is that the route and the client cannot disagree
 * about the shape, and a second copy in the handler is exactly how they start
 * to. Same split as the mission routes, whose pattern this follows throughout.
 *
 * GET declares 200 and 403 only, no 422, so a malformed pagination query is not
 * an error — it falls back to the schema's defaults and still returns a page.
 * Returning a status the contract does not list would be a response the
 * client's error map has no case for. POST declares 201 and 422 and does the
 * opposite: anything the body schema rejects is a 422.
 */
const createBody = clientContract.create.body;

export const Route = createFileRoute("/api/clients")({
	server: {
		handlers: withMethodGuard({
			GET: ({ request }) =>
				shielded("client list", async () => {
					const url = new URL(request.url);
					const parsed = paginationQuery.safeParse({
						cursor: url.searchParams.get("cursor") ?? undefined,
						limit: url.searchParams.get("limit") ?? undefined,
					});
					const query = parsed.success ? parsed.data : { limit: 25 };

					const { items, total, nextCursor } = await listClients(db, query);
					return Response.json({
						success: true,
						data: items,
						meta: { total, nextCursor },
					});
				}),

			POST: ({ request }) =>
				shielded("client create", async () => {
					// Unparseable JSON is a 422 like any other malformed body. Letting
					// it throw would surface as a 500, which tells the caller the server
					// broke when in fact the request did.
					let raw: unknown;
					try {
						raw = await request.json();
					} catch {
						return validationFailed("The request body is not valid JSON.");
					}

					const parsed = createBody.safeParse(raw);
					if (!parsed.success) {
						return validationFailed(
							"The client could not be created from this body.",
							parsed.error.flatten().fieldErrors,
						);
					}

					const result = await createClient(db, parsed.data);
					if (!result.ok) return validationFailed(result.message);

					return Response.json(
						{ success: true, data: result.client },
						{ status: 201 },
					);
				}),
		}),
	},
});
