import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { db } from "#/modules/db/client";
import { notFound, shielded, withMethodGuard } from "#/modules/http/shielded";
import { previewIntake } from "#/modules/intake/service";

/**
 * GET /api/intakes/:id/preview — what approval would create, without creating it.
 *
 * WRITES NOTHING, so it is safe to call repeatedly and safe to call while the
 * operator is still deciding. That is the whole point of the `preview -> export`
 * idiom this mirrors: review what will happen, then commit to something that
 * materialises.
 *
 * A 200 with blockers is NOT an error. The preview succeeding while reporting
 * that approval is impossible is the normal case for a closed engagement or an
 * already-approved request, and the screen needs the reasons in order to say
 * why its one button is disabled. Only a missing request is a 404.
 */
const uuid = z.string().uuid();

export const Route = createFileRoute("/api/intakes/$id/preview")({
	server: {
		handlers: withMethodGuard({
			GET: ({ request }) =>
				shielded("intake preview", async () => {
					// `/api/intakes/:id/preview` — the id is second to last.
					const parts = new URL(request.url).pathname.split("/");
					const id = parts[parts.length - 2] ?? "";

					if (!uuid.safeParse(id).success) {
						return notFound(`No request with id ${id}.`);
					}

					const preview = await previewIntake(db, id);
					if (!preview) return notFound(`No request with id ${id}.`);

					return Response.json({ success: true, data: preview });
				}),
		}),
	},
});
