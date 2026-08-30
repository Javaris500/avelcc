import { createFileRoute } from "@tanstack/react-router";
import { exportContract } from "#/contract/export";
import { exportDeps } from "#/modules/export/deps";
import { exportResponse, validationFailed } from "#/modules/export/http";
import { previewExport } from "#/modules/export/service";
import { withMethodGuard } from "#/modules/http/shielded";

/**
 * POST /api/exports/preview — the dry run.
 *
 * A real Export row, terminal at `previewed`, never promoted. The re-render a
 * real export performs against this row's recorded package hash is what turns
 * previewing into a determinism gate, so nothing here is a simulation that
 * could drift from the delivery path — both run the same `prepare`.
 *
 * The body schema comes from the contract rather than being restated, for the
 * reason the mission routes give: a second copy in the handler is how a route
 * and its client begin to disagree.
 */
const body = exportContract.preview.body;

export const Route = createFileRoute("/api/exports/preview")({
	server: {
		handlers: withMethodGuard({
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
						"The preview could not be started from this body.",
						parsed.error.flatten().fieldErrors,
					);
				}

				const result = await previewExport(exportDeps, {
					missionId: parsed.data.missionId,
					idempotencyKey: parsed.data.idempotencyKey,
					target: parsed.data.target,
					repoUrl: parsed.data.repoUrl,
					ref: parsed.data.ref,
				});

				return exportResponse(result, 201);
			},
		}),
	},
});
