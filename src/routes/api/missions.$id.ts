import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { db } from "#/modules/db/client";
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

/**
 * The last-resort wrapper. Any throw becomes the contract's envelope.
 *
 * These two mission routes were the only API routes with no catch, so a
 * database failure escaped as a framework 500 carrying `unhandled: true` and no
 * envelope — nothing for a screen to switch on, which is the one guarantee the
 * error contract makes. Found live, not theorised: the roster read 500'd this
 * way against a column the database did not have.
 *
 * The caught error goes to the SERVER LOG and never into the response. An
 * exception message can hold a connection string, a column name, or a row's
 * contents; the operator gets a request id to quote instead, which is the whole
 * reason INTERNAL_ERROR's copy is generic.
 */
async function shielded(fn: () => Promise<Response>): Promise<Response> {
	try {
		return await fn();
	} catch (error) {
		const requestId = crypto.randomUUID();
		console.error(`[${requestId}] mission route failed:`, error);
		return Response.json(
			{
				success: false,
				error: {
					code: "INTERNAL_ERROR",
					message:
						"Something failed on our side. Quote the request id when reporting it.",
					requestId,
				},
			},
			{ status: 500 },
		);
	}
}

export const Route = createFileRoute("/api/missions/$id")({
	server: {
		handlers: {
			GET: ({ request }) =>
				shielded(async () => {
					const id = new URL(request.url).pathname.split("/").pop() ?? "";
					if (!uuid.safeParse(id).success) return notFound(id);

					const mission = await getMission(db, id);
					if (!mission) return notFound(id);

					return Response.json({ success: true, data: mission });
				}),
		},
	},
});
