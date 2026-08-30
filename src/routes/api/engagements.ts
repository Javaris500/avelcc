import { createFileRoute } from "@tanstack/react-router";

import { engagementContract } from "#/contract/engagement";
import { paginationQuery } from "#/contract/shared/pagination";
import { db } from "#/modules/db/client";
import {
	createEngagement,
	listEngagements,
} from "#/modules/engagement/service";
import {
	shielded,
	validationFailed,
	withMethodGuard,
} from "#/modules/http/shielded";

/**
 * GET /api/engagements — the list. POST /api/engagements — create one.
 *
 * Same shape as the client and mission routes: body schema from the contract,
 * pagination defaults rather than a 422 on GET, everything wrapped so a
 * database failure arrives as an envelope a screen can switch on.
 *
 * A create naming a client that does not exist is a 422 and not a 500. The
 * service checks the client first so the foreign key is not the thing that
 * reports it, while the foreign key remains the real guard.
 */
const createBody = engagementContract.create.body;

export const Route = createFileRoute("/api/engagements")({
	server: {
		handlers: withMethodGuard({
			GET: ({ request }) =>
				shielded("engagement list", async () => {
					const url = new URL(request.url);
					const parsed = paginationQuery.safeParse({
						cursor: url.searchParams.get("cursor") ?? undefined,
						limit: url.searchParams.get("limit") ?? undefined,
					});
					const query = parsed.success ? parsed.data : { limit: 25 };

					const { items, total, nextCursor } = await listEngagements(db, query);
					return Response.json({
						success: true,
						data: items,
						meta: { total, nextCursor },
					});
				}),

			POST: ({ request }) =>
				shielded("engagement create", async () => {
					let raw: unknown;
					try {
						raw = await request.json();
					} catch {
						return validationFailed("The request body is not valid JSON.");
					}

					const parsed = createBody.safeParse(raw);
					if (!parsed.success) {
						return validationFailed(
							"The engagement could not be created from this body.",
							parsed.error.flatten().fieldErrors,
						);
					}

					const result = await createEngagement(db, parsed.data);
					if (!result.ok) return validationFailed(result.message);

					return Response.json(
						{ success: true, data: result.engagement },
						{ status: 201 },
					);
				}),
		}),
	},
});
