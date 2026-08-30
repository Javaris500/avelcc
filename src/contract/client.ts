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
 * Client. DATA-CONTRACTS-V2:108 defines the field block in full, which is why
 * this file exists and why five of its neighbours do not.
 *
 *   id · name · status ('active' | 'closed')
 *   primary_contact? · notes_md?
 *   deleted_at · timestamps
 *
 * Every field below is that block, and the doc's reason for the entity is worth
 * keeping in view: `Mission.client` used to be a text field, "at three clients
 * that makes everything for Meridian ungreppable, and every query that should
 * have been client-scoped was not."
 */

export const clientStatus = z.enum(["active", "closed"]);

export const clientSchema = z.object({
	id: z.string().uuid(),
	name: z.string(),
	status: clientStatus,
	/** Optional in the doc, so nullable here rather than absent. */
	primaryContact: z.string().nullable(),
	notesMd: z.string().nullable(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

/**
 * `deleted_at` is deliberately NOT on the wire. It is in the block and in the
 * table, and it is a storage fact: a soft-deleted client is filtered out by
 * every read, so a client that reaches a caller always has it null. Sending a
 * column that is always the same value invites a screen to branch on it.
 */
export const clientListRow = clientSchema.pick({
	id: true,
	name: true,
	status: true,
	primaryContact: true,
});

export const clientContract = c.router({
	list: {
		method: "GET",
		path: "/clients",
		query: paginationQuery,
		responses: { 200: successList(clientListRow), 403: crudErrorEnvelope },
	},
	get: {
		method: "GET",
		path: "/clients/:id",
		responses: { 200: success(clientSchema), 404: crudErrorEnvelope },
	},
	create: {
		method: "POST",
		path: "/clients",
		/**
		 * `status` is NOT accepted, following mission.create. A client is active
		 * the moment it exists, the column defaults to it, and 'closed' is a
		 * lifecycle transition rather than a starting condition — a caller that
		 * could create one closed could create a client nobody ever opened.
		 * Closing is an update, and update is not specified yet.
		 */
		body: clientSchema
			.pick({ primaryContact: true, notesMd: true })
			.partial()
			.extend({
				/** Non-empty: a client with a blank name cannot be told from another. */
				name: z.string().min(1),
			}),
		responses: { 201: success(clientSchema), 422: crudErrorEnvelope },
	},
});
