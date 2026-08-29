import { createFileRoute } from "@tanstack/react-router";

import { exportContract } from "#/contract/export";
import { exportDeps } from "#/modules/export/deps";
import { exportResponse, validationFailed } from "#/modules/export/http";
import { createExport } from "#/modules/export/service";

/**
 * POST /api/exports — the real delivery.
 *
 * Re-renders from scratch rather than reusing the preview's output, which is
 * what makes the determinism comparison possible at all. Every guard runs
 * before a byte is written, and a replayed idempotency key is answered with a
 * 409 rather than delivering twice.
 */
const body = exportContract.create.body;

export const Route = createFileRoute("/api/exports")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				let raw: unknown;
				try {
					raw = await request.json();
				} catch {
					return validationFailed("The request body is not valid JSON.");
				}

				const parsed = body.safeParse(raw);
				if (!parsed.success) {
					return validationFailed(
						"The export could not be created from this body.",
						parsed.error.flatten().fieldErrors,
					);
				}

				const result = await createExport(exportDeps, {
					missionId: parsed.data.missionId,
					idempotencyKey: parsed.data.idempotencyKey,
					target: parsed.data.target,
					previewExportId: parsed.data.previewExportId,
				});

				return exportResponse(result, 201);
			},
		},
	},
});
