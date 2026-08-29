import { initContract } from "@ts-rest/core";
import { z } from "zod";

import {
	crudErrorEnvelope,
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
	/**
	 * 1-based and counts upward — `missions_sprint_n_positive` enforces it in the
	 * database. Typed positive here so a 0 is a 422 from the contract rather than
	 * a check-constraint violation surfacing as a 500.
	 */
	sprintN: z.number().int().positive(),
	/**
	 * TEXT, and still a RECORDED GAP rather than a vocabulary. Every other status
	 * in DATA-CONTRACTS-V2 is a closed enum — Client, Engagement, Intake,
	 * Connection all enumerate theirs. Mission's field block says only `status`
	 * and no vocabulary appears anywhere in the doc set.
	 *
	 * The column now DEFAULTS to 'draft' (migration 0008) so a row is insertable,
	 * which is not the same as declaring a lifecycle. Zero missions have run, so
	 * an enum written today would be a guess about states nobody has observed.
	 * This becomes z.enum once mission 001 shows the real ones.
	 */
	status: z.string(),
	/**
	 * DERIVED, not chosen, and NULLABLE because at create time it is not yet
	 * derivable. The system reads the connected repository's directory structure
	 * at mission setup and sees which boundary is a directory — but a mission is
	 * captured before a repository is connected (Connection has no table, and
	 * repoUrl is a default rather than the binding destination). NULL is
	 * therefore "not yet derived", a state the schema previously could not say.
	 *
	 * A free-choice field, or a default, permits the exact failure the original
	 * roster defect came from: applying the decomposition rule to a roster that
	 * had already been decided. NULL cannot be mistaken for a derivation; a
	 * default value can. See DECISIONS-V2.md:246.
	 */
	cut: cut.nullable(),
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
		responses: { 200: successList(missionListRow), 403: crudErrorEnvelope },
	},
	get: {
		method: "GET",
		path: "/missions/:id",
		responses: { 200: success(missionSchema), 404: crudErrorEnvelope },
	},
	create: {
		method: "POST",
		path: "/missions",
		/**
		 * Neither `status` nor `cut` is accepted, and both omissions are load-
		 * bearing. `status` is the server's to set — the caller does not get to
		 * name a lifecycle state that has no vocabulary. `cut` is DERIVED, and a
		 * caller supplying one is precisely the defect `cut_source` exists to
		 * prevent. The row is created with status 'draft' and a null cut; the cut
		 * is filled in at mission setup, when a repository exists to read.
		 */
		body: missionSchema
			.pick({ engagementId: true, type: true, sprintN: true })
			.extend({
				/** Non-empty: a playbook is looked UP by this, so "" finds nothing. */
				type: z.string().min(1),
				brief: z.record(z.string(), z.unknown()).optional(),
			}),
		responses: { 201: success(missionSchema), 422: crudErrorEnvelope },
	},
	update: {
		method: "PATCH",
		path: "/missions/:id",
		body: missionSchema
			.partial()
			.omit({ id: true, createdAt: true, updatedAt: true }),
		responses: {
			200: success(missionSchema),
			404: crudErrorEnvelope,
			422: crudErrorEnvelope,
		},
	},
});
