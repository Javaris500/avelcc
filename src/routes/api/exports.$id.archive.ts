import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { db } from "#/modules/db/client";
import { buildArchive } from "#/modules/export/archive";
import { renderFixturePackage } from "#/modules/export/deps";
import { errorResponse } from "#/modules/export/http";
import { getExport } from "#/modules/export/service";
import { getMission } from "#/modules/mission/service";

/**
 * GET /api/exports/:id/archive — the delivered zip, rebuilt.
 *
 * Nothing is stored: the archive is re-rendered and re-zipped, and served only
 * if its package hash still matches the one the delivery recorded. The refusal
 * cases and the reasoning for each live in `modules/export/archive.ts`; this
 * file is the HTTP edge and does no deciding.
 */
const uuid = z.string().uuid();

/**
 * `/api/exports/<id>/archive`, so the id is the second-to-last segment. The
 * sibling route pops the last one; popping here would read the literal
 * "archive" and 404 every request with a message naming it as the id.
 */
function exportIdFrom(url: string): string {
	const segments = new URL(url).pathname.split("/").filter(Boolean);
	return segments.at(-2) ?? "";
}

export const Route = createFileRoute("/api/exports/$id/archive")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const id = exportIdFrom(request.url);

				// Refused before the query: a non-uuid cannot match a row, and handing
				// one to a uuid column raises at the database rather than returning
				// cleanly. Same guard and same wrong-noun 404 as exports.$id.ts.
				if (!uuid.safeParse(id).success) {
					return errorResponse(
						404,
						"REPO_NOT_FOUND",
						`No export with id ${id}.`,
					);
				}

				const result = await buildArchive(
					{
						loadExport: (exportId) => getExport(db, exportId),
						loadMission: (missionId) => getMission(db, missionId),
						renderPackage: renderFixturePackage,
					},
					id,
				);

				if (!result.ok) {
					const { status, code, detail, details } = result.failure;
					return errorResponse(status, code, detail, details);
				}

				/**
				 * `BodyInit` accepts a view over an ArrayBuffer, not over the wider
				 * ArrayBufferLike that Uint8Array is typed with — a SharedArrayBuffer
				 * cannot be a response body. writeZip's bytes always sit on a plain
				 * ArrayBuffer, so this narrows with a real check rather than a cast,
				 * and re-views the same memory rather than copying the archive.
				 */
				const { buffer, byteOffset, byteLength } = result.bytes;
				if (!(buffer instanceof ArrayBuffer)) {
					return errorResponse(
						422,
						"DETERMINISM_VIOLATION",
						`Export ${id} rebuilt onto a buffer that cannot be served, so nothing was returned.`,
					);
				}
				const body = new Uint8Array(buffer, byteOffset, byteLength);

				return new Response(body, {
					status: 200,
					headers: {
						"Content-Type": "application/zip",
						"Content-Disposition": `attachment; filename="${result.filename}"`,
						"Content-Length": String(result.byteLength),
						/**
						 * The archive's own hash, so a caller can verify the bytes it
						 * received without re-deriving anything. Strong rather than weak:
						 * the zip writer is byte-deterministic, which is what makes an
						 * exact-match validator meaningful here at all.
						 */
						ETag: `"${result.sha256}"`,
					},
				});
			},
		},
	},
});
