import { initContract } from "@ts-rest/core";
import { z } from "zod";

import {
	crudErrorEnvelope,
	success,
	successList,
} from "#/contract/shared/envelope";
import { paginationQuery } from "#/contract/shared/pagination";

const c = initContract();

/**
 * Engagement. DATA-CONTRACTS-V2:118 defines the field block:
 *
 *   id · client_id      FK -> Client
 *   name · scope_md?
 *   status              'active' | 'closed'
 *   started_at · closed_at?
 *   deleted_at · timestamps
 *
 * TWO OF THOSE FIELDS DO NOT EXIST AND ARE NOT DECLARED HERE. `started_at` and
 * `closed_at` are in the doc's block and in neither `schema.ts` nor the
 * database — checked against both, not inferred from one.
 *
 * They are omitted rather than added because a contract may only promise what
 * the system can serve. Declaring `startedAt` would produce exactly the failure
 * this project met a few hours ago, when `missions.title` reached the schema
 * ahead of its migration and every route reading a whole mission row answered
 * 500 against a column the database did not have. A contract is the wrong place
 * to discover that.
 *
 * So this is the DRIFT REPORTED, not the drift filled: the doc specifies two
 * fields the storage layer never got, and closing that gap is a migration plus
 * a schema change, both of which belong to whoever owns them.
 *
 * It is not cosmetic. The doc says closing an engagement revokes its
 * Connections, and `closed_at` is when that happened — with no column, a closed
 * engagement cannot say when it closed, and the revocation has no timestamp to
 * be audited against.
 */

export const engagementStatus = z.enum(["active", "closed"]);

export const engagementSchema = z.object({
	id: z.string().uuid(),
	clientId: z.string().uuid(),
	name: z.string(),
	scopeMd: z.string().nullable(),
	status: engagementStatus,
	createdAt: z.string(),
	updatedAt: z.string(),
});

/**
 * `clientName` is joined on, exactly as `missionListRow` joins it, and for the
 * same reason: a list of engagements identified only by a client uuid is a list
 * nobody can read. The projection follows the established list-row pattern
 * rather than inventing a second one.
 */
export const engagementListRow = engagementSchema
	.pick({ id: true, clientId: true, name: true, status: true })
	.extend({ clientName: z.string() });

export const engagementContract = c.router({
	list: {
		method: "GET",
		path: "/engagements",
		query: paginationQuery,
		responses: { 200: successList(engagementListRow), 403: crudErrorEnvelope },
	},
	get: {
		method: "GET",
		path: "/engagements/:id",
		responses: { 200: success(engagementSchema), 404: crudErrorEnvelope },
	},
	create: {
		method: "POST",
		path: "/engagements",
		/**
		 * `status` is the server's, as on client.create and mission.create. The
		 * missing `startedAt` is felt here first: the doc treats it as a fact set
		 * at creation, and with no column the closest honest answer is `createdAt`,
		 * which is row-insert time and NOT the same claim — the same distinction
		 * that keeps `updatedAt` out of the mission list's activity column.
		 */
		body: engagementSchema
			.pick({ scopeMd: true })
			.partial()
			.extend({
				clientId: z.string().uuid(),
				/** Non-empty: an engagement groups work and has to be nameable. */
				name: z.string().min(1),
			}),
		responses: { 201: success(engagementSchema), 422: crudErrorEnvelope },
	},
});
