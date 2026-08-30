import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import {
	activityForClient,
	costForClient,
	deliveriesForClient,
	engagementsForClient,
	getClientDetail,
	missionsForClient,
	repositoriesForClient,
	rosterForClient,
} from "#/modules/client/detail";
import { db } from "#/modules/db/client";
import { notFound, shielded, withMethodGuard } from "#/modules/http/shielded";

/**
 * GET /api/clients/:id/detail — the masthead and its sections, in one call.
 *
 * ONE ROUND TRIP RATHER THAN NINE. The page renders every section at once and a
 * section-per-request would mean nine waterfalls for a view whose whole purpose
 * is answering "what is actually happening with these people" immediately. The
 * sections are read-only in the first cut, so there is nothing to invalidate
 * independently and no reason to split them.
 *
 * `metrics: null` IS NOT `metrics: { …: 0 }`. A client with no engagement has
 * nowhere for a mission to live, so counting them measures something that
 * cannot exist; a client WITH engagements and no missions genuinely has zero.
 * The two render differently and the wire keeps them apart.
 */
const uuid = z.string().uuid();

export const Route = createFileRoute("/api/clients/$id/detail")({
	server: {
		handlers: withMethodGuard({
			GET: ({ request }) =>
				shielded("client detail", async () => {
					// `/api/clients/:id/detail` — the id is the second-to-last segment.
					const parts = new URL(request.url).pathname.split("/");
					const id = parts[parts.length - 2] ?? "";

					// Refused before the query, as `clients.$id.ts` does: a non-uuid can
					// never match a row, and handing one to a uuid column raises at the
					// database rather than returning cleanly.
					if (!uuid.safeParse(id).success) {
						return notFound(`No client with id ${id}.`);
					}

					const detail = await getClientDetail(db, id);
					// Null means the client does not exist or is soft-deleted, which is
					// distinct from a client with nothing in it — that returns a detail
					// with `metrics: null`.
					if (!detail) return notFound(`No client with id ${id}.`);

					// The section reads are independent, so they go in parallel. Each
					// re-resolves the engagement spine rather than being handed it: the
					// cost is one extra index scan apiece, and the alternative is a
					// signature that lets a caller pass engagement ids belonging to a
					// different client.
					const [
						engagementsList,
						missionsList,
						deliveries,
						roster,
						repositories,
						cost,
						activity,
					] = await Promise.all([
						engagementsForClient(db, id),
						missionsForClient(db, id),
						deliveriesForClient(db, id),
						rosterForClient(db, id),
						repositoriesForClient(db, id),
						costForClient(db, id),
						activityForClient(db, id),
					]);

					return Response.json({
						success: true,
						data: {
							metrics: detail.metrics,
							openRequests: detail.openRequests,
							lastActivityAt: detail.lastActivityAt,
							engagements: engagementsList,
							missions: missionsList,
							deliveries,
							roster,
							repositories,
							cost,
							activity,
						},
					});
				}),
		}),
	},
});
