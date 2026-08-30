import { createFileRoute } from "@tanstack/react-router";
import { missionContract } from "#/contract/mission";
import { paginationQuery } from "#/contract/shared/pagination";
import { db } from "#/modules/db/client";
import { withMethodGuard } from "#/modules/http/shielded";
import { createMission, listMissions } from "#/modules/mission/service";

/**
 * The body schema comes from the contract rather than being restated here. The
 * point of the contract layer is that the route and the client cannot disagree
 * about the shape; a second copy in the handler is exactly how they start to.
 */
const createBody = missionContract.create.body;

function validationFailed(message: string, details?: unknown) {
	return Response.json(
		{
			success: false,
			error: {
				code: "VALIDATION_FAILED",
				message,
				...(details === undefined ? {} : { details }),
				requestId: crypto.randomUUID(),
			},
		},
		{ status: 422 },
	);
}

/**
 * GET /api/missions — the mission list. Server-side because it holds the db
 * client; the contract path is /missions and the route sits under /api, the
 * same split the preflight route uses.
 *
 * The contract declares only 200 and 403 for GET, no 422, so a malformed
 * pagination query is not an error — it falls back to the schema's defaults and
 * still returns a page. Returning a 422 the contract does not list would be a
 * response the client's error map has no case for. POST declares 201 and 422,
 * so it does the opposite: anything the body schema rejects is a 422.
 */

export const Route = createFileRoute("/api/missions")({
	server: {
		handlers: withMethodGuard({
			GET: async ({ request }) => {
				const url = new URL(request.url);
				const parsed = paginationQuery.safeParse({
					cursor: url.searchParams.get("cursor") ?? undefined,
					limit: url.searchParams.get("limit") ?? undefined,
				});
				const query = parsed.success ? parsed.data : { limit: 25 };

				const { items, total, nextCursor } = await listMissions(db, query);
				return Response.json({
					success: true,
					data: items,
					meta: { total, nextCursor },
				});
			},

			POST: async ({ request }) => {
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
						"The mission could not be created from this body.",
						// Field-keyed, so a form can mark the offending inputs. The
						// frontend switches on `code`; `details` is what it renders.
						parsed.error.flatten().fieldErrors,
					);
				}

				const result = await createMission(db, parsed.data);
				if (!result.ok) return validationFailed(result.message);

				return Response.json(
					{ success: true, data: result.mission },
					{ status: 201 },
				);
			},
		}),
	},
});
