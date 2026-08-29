import { initContract } from "@ts-rest/core";
import { z } from "zod";

import {
	crudErrorEnvelope,
	success,
	successList,
} from "#/contract/shared/envelope";

const c = initContract();

/** CLOSED vocabulary. DATA-CONTRACTS-V2:249. */
export const gateName = z.enum([
	"phase1-close",
	"alignment",
	"qa",
	"security",
	"rollback",
	"acceptance",
]);

/** `mandatory` or `warn` ONLY. "There is no skippable." */
export const gatePolicy = z.enum(["mandatory", "warn"]);

export const playbookSchema = z.object({
	id: z.string().uuid(),
	missionType: z.string(),
	name: z.string(),
	wavesApplicable: z.array(z.string()),
	gates: z.array(z.object({ gate: gateName, policy: gatePolicy })),
	deliverable: z.enum(["pr", "report", "recommendation"]),
	requiredFields: z.array(z.string()),
	/** References a preset; NEVER lists agents. Composition is RosterPreset's. */
	defaultPresetId: z.string().uuid().nullable(),
	version: z.number().int(),
});

export const playbookContract = c.router({
	list: {
		method: "GET",
		path: "/playbooks",
		responses: { 200: successList(playbookSchema) },
	},
	getForType: {
		method: "GET",
		path: "/playbooks/:missionType",
		responses: { 200: success(playbookSchema), 404: crudErrorEnvelope },
	},
	update: {
		method: "PATCH",
		path: "/playbooks/:missionType",
		body: playbookSchema.partial().omit({ id: true, version: true }),
		responses: {
			200: success(playbookSchema),
			404: crudErrorEnvelope,
			422: crudErrorEnvelope,
		},
	},
});
