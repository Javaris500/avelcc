import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { db } from "#/modules/db/client";
import { errorResponse } from "#/modules/export/http";
import { getExport } from "#/modules/export/service";

/**
 * GET /api/exports/:id — one export. The contract allows 200 and 404 only.
 *
 * A non-uuid can never match a row and handing it to a uuid column raises at
 * the database rather than returning cleanly, so it is refused before the
 * query — "no export with that identifier" is exactly what a malformed id
 * means to the caller. Same shape as the mission route.
 */
const uuid = z.string().uuid();

export const Route = createFileRoute("/api/exports/$id")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const id = new URL(request.url).pathname.split("/").pop() ?? "";

				/**
				 * REPO_NOT_FOUND IS THE WRONG NOUN AND IT IS THE ONLY 404 THE
				 * CONTRACT DECLARES. `export.get` lists `404: errorEnvelope`, and
				 * ERROR_CODES has no code meaning "no such export". The message
				 * names the id so nobody goes looking at a repository that is fine.
				 * Filed with the other instances of this gap.
				 */
				if (!uuid.safeParse(id).success) {
					return errorResponse(
						404,
						"REPO_NOT_FOUND",
						`No export with id ${id}.`,
					);
				}

				const row = await getExport(db, id);
				if (!row) {
					return errorResponse(
						404,
						"REPO_NOT_FOUND",
						`No export with id ${id}.`,
					);
				}

				return Response.json({ success: true, data: row });
			},
		},
	},
});
