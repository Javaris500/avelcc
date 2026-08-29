import { initContract } from "@ts-rest/core";
import { z } from "zod";

import { errorEnvelope, success } from "#/contract/shared/envelope";

const c = initContract();

export const rosterEntrySchema = z.object({
	id: z.string().uuid(),
	missionId: z.string().uuid(),
	agentTemplateId: z.string().uuid(),
	active: z.boolean(),
	waves: z.array(z.string()),
	monitorPriority: z.number().int().nullable(),
	customizedMd: z.string().nullable(),
	/** Overrides the template's, per mission. */
	writablePaths: z.array(z.string()).nullable(),
	skillIds: z.array(z.string().uuid()),
});

/**
 * OPEN CONTRACT GAP, recorded rather than filled.
 *
 * GOLDEN-FIXTURE's roster.json carries `append_only`, `readonly` and `runtime`
 * for every agent, and calls append_only "the Mission 002 finding encoded" —
 * the composition root belongs to no feature and every feature must register in
 * it, so omitting it means the first agent cannot load its own module.
 *
 * No entity in DATA-CONTRACTS-V2 declares any of the three. They are absent
 * here for the same reason they are absent from the schema: adding them would
 * invent a shape the contract does not define, which is the one thing the
 * contract rule forbids. Two sessions are hitting this from opposite directions
 * — the renderer needs them to emit, the schema needs them to store.
 *
 * AND THE GAP IS TWO LAYERS DEEP. AgentTemplate declares none of the three, and
 * RosterEntry — which carries `writablePaths` as a per-mission override — has no
 * corresponding override for the other three. So if append_only really is "the
 * Mission 002 finding encoded", a mission cannot currently vary it. Found by
 * session 2 building the table.
 */

export const coherenceBlock = z.object({
	code: z.literal("no_agents_in_first_wave"),
	reason: z.string(),
	wave: z.string(),
});

export const coherenceResult = z.object({
	block: coherenceBlock.optional(),
	warnings: z.array(
		z.object({ code: z.string(), reason: z.string() }).passthrough(),
	),
});

export const rosterContract = c.router({
	/**
	 * The loadout screen's read. Coherence is NOT returned here: computeCoherence
	 * is pure and lives in contract/shared, so the client runs the same
	 * implementation locally for instant feedback and the server runs it again at
	 * gate time for permission. One implementation, zero round trips, no drift —
	 * and a client that lies about coherence still cannot ship.
	 */
	getWithRoster: {
		method: "GET",
		path: "/missions/:missionId/roster",
		responses: {
			200: success(z.object({ entries: z.array(rosterEntrySchema) })),
			404: errorEnvelope,
		},
	},

	upsert: {
		method: "PUT",
		path: "/missions/:missionId/roster",
		body: z.object({ entries: z.array(rosterEntrySchema.omit({ id: true })) }),
		responses: {
			200: success(z.object({ entries: z.array(rosterEntrySchema) })),
			422: errorEnvelope, // PRECONDITION_FAILED — the hard block
		},
	},

	/**
	 * MATERIALIZES. The name has to make it obvious that applying is a write:
	 * it copies the preset into RosterEntries, copy-then-edit, and the preset
	 * holds no mission state afterward.
	 */
	applyPreset: {
		method: "POST",
		path: "/missions/:missionId/roster/apply-preset",
		body: z.object({ presetId: z.string().uuid() }),
		responses: {
			200: success(z.object({ entries: z.array(rosterEntrySchema) })),
			404: errorEnvelope,
			422: errorEnvelope,
		},
	},
});
