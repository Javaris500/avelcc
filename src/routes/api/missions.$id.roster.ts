import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { db } from "#/modules/db/client";
import { getMission, getMissionRoster } from "#/modules/mission/service";

/**
 * GET /api/missions/:id/roster — which agents ran, in which wave, with which
 * mounts.
 *
 * A separate resource rather than a field on the mission, which is the path
 * `contract/roster.ts` already names. The roster is a list that grows with the
 * squad and is not needed by every mission read; folding it into
 * `GET /api/missions/:id` would make the list screen pay for it.
 *
 * THE OVERRIDE IS RESOLVED SERVER-SIDE. Each path set on a roster entry is a
 * nullable override of its template's, and letting every screen re-derive
 * `entry.paths ?? template.paths` is how two surfaces come to disagree about
 * what an agent may write. Since that is a boundary, a disagreement is not
 * cosmetic. `effective` is what applies; `overridden` says whether the mission
 * changed it, so an override can be shown AS an override.
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

export const Route = createFileRoute("/api/missions/$id/roster")({
	server: {
		handlers: {
			GET: ({ request }) =>
				shielded(async () => {
					const parts = new URL(request.url).pathname.split("/");
					// .../missions/<id>/roster — the id is the segment before the last.
					const id = parts[parts.length - 2] ?? "";

					if (!uuid.safeParse(id).success) return notFound(id);

					/**
					 * The mission is checked before the roster is read, so a bad id is a
					 * 404 rather than an empty list. An empty roster is a REAL state —
					 * a mission that dispatched nobody has one, and that emptiness is a
					 * finding rather than missing data — so the two must not be
					 * indistinguishable.
					 */
					const mission = await getMission(db, id);
					if (!mission) return notFound(id);

					const agents = await getMissionRoster(db, id);

					return Response.json({
						success: true,
						data: agents,
						meta: { missionId: id, total: agents.length },
					});
				}),
		},
	},
});
