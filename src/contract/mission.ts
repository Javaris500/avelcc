import { initContract } from "@ts-rest/core";
import { z } from "zod";

import {
	errorEnvelope,
	success,
	successList,
} from "#/contract/shared/envelope";
import { paginationQuery } from "#/contract/shared/pagination";

const c = initContract();

export const cut = z.enum(["horizontal", "vertical"]);
export const cutSource = z.enum(["derived", "overridden"]);

export const missionSchema = z.object({
	id: z.string().uuid(),
	engagementId: z.string().uuid(),
	type: z.string(),
	brief: z.record(z.string(), z.unknown()),
	sprintN: z.number().int(),
	/**
	 * TEXT, and that is a RECORDED GAP rather than a decision. Every other status
	 * in DATA-CONTRACTS-V2 is a closed enum — Client, Engagement, Intake,
	 * Connection all enumerate theirs. Mission's field block says only `status`
	 * and no vocabulary appears anywhere in the doc set. Typing it as an enum
	 * would mean inventing the vocabulary; typing it as a string is the honest
	 * shape until someone declares one.
	 */
	status: z.string(),
	/**
	 * DERIVED, not chosen. At setup the system reads the repository's directory
	 * structure and determines which boundary is a directory. A free-choice field
	 * permits the exact failure the original roster defect came from: applying
	 * the decomposition rule to a roster that had already been decided.
	 */
	cut,
	cutSource,
	/** REQUIRED when overridden, and it renders into the delivery. */
	cutRationale: z.string().nullable(),
	/** A DEFAULT, not the binding destination. */
	repoUrl: z.string().nullable(),
	/** Modelled now so cost governance is a gate check rather than a migration. */
	spendCeilingUsd: z.number().nullable(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

export const missionListRow = missionSchema
	.pick({
		id: true,
		type: true,
		sprintN: true,
		status: true,
	})
	.extend({
		clientName: z.string(),
		/**
		 * The known contract/implementation disagreement. ROUTES.md: ship the column
		 * only when the aggregate join exists, and never substitute updatedAt —
		 * that is row-edit time, not audited activity.
		 */
		lastActivity: z.string().nullable(),
		lastExportResult: z.string().nullable(),
	});

export const missionContract = c.router({
	list: {
		method: "GET",
		path: "/missions",
		query: paginationQuery,
		responses: { 200: successList(missionListRow), 403: errorEnvelope },
	},
	get: {
		method: "GET",
		path: "/missions/:id",
		responses: { 200: success(missionSchema), 404: errorEnvelope },
	},
	create: {
		method: "POST",
		path: "/missions",
		body: missionSchema
			.pick({ engagementId: true, type: true, sprintN: true })
			.extend({
				brief: z.record(z.string(), z.unknown()).optional(),
			}),
		responses: { 201: success(missionSchema), 422: errorEnvelope },
	},
	update: {
		method: "PATCH",
		path: "/missions/:id",
		body: missionSchema
			.partial()
			.omit({ id: true, createdAt: true, updatedAt: true }),
		responses: {
			200: success(missionSchema),
			404: errorEnvelope,
			422: errorEnvelope,
		},
	},
});
