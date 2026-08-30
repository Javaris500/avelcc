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
 * Connection. DATA-CONTRACTS-V2:347 defines the field block in full:
 *
 *   id · service ('github')
 *   label · scope_type ('owner' | 'repo') · scope_value
 *   credential_ref     env var name or secret ref — NEVER the token
 *   status             'active' | 'expired' | 'revoked'
 *   expires_at? · last_rotated_at? · revoked_at?
 *   deleted_at · timestamps
 *
 * Schema and live database agree with it exactly, all three enums included —
 * checked on both sides rather than inferred from one.
 *
 * `engagementId` is the one field NOT in that block. It is in the table, and
 * DECISIONS-V2:103 is titled "Connection scoped per engagement", so it is a
 * ruled addition rather than drift, and it is what makes "closing an engagement
 * revokes its Connections" expressible at all. Included on the read for that
 * reason; a connection nobody can attribute to an engagement cannot be revoked
 * by closing one.
 *
 * READS ONLY. There is no `create` here and its absence is deliberate rather
 * than unfinished: creating a Connection means deciding what `credential_ref`
 * points at — an env var name, a secret-manager path, something else — and
 * that is a security decision nobody has made. The shape being complete does
 * not make the write safe, and a create endpoint would have to invent the
 * answer in order to accept a value.
 */

export const connectionService = z.enum(["github"]);
export const connectionScopeType = z.enum(["owner", "repo"]);
export const connectionStatus = z.enum(["active", "expired", "revoked"]);

export const connectionSchema = z.object({
	id: z.string().uuid(),
	service: connectionService,
	label: z.string(),
	/** Nullable: an account-wide connection belongs to no single engagement. */
	engagementId: z.string().uuid().nullable(),
	scopeType: connectionScopeType,
	scopeValue: z.string(),
	/**
	 * SAFE BY CONSTRUCTION AND STILL NOT ON THE LIST. See connectionListRow.
	 * The value names where a token lives; it is never the token.
	 */
	credentialRef: z.string(),
	status: connectionStatus,
	expiresAt: z.string().nullable(),
	lastRotatedAt: z.string().nullable(),
	revokedAt: z.string().nullable(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

/**
 * `credentialRef` IS OMITTED FROM THE COLLECTION AND PRESENT ON THE DETAIL, and
 * this is a decision rather than an oversight.
 *
 * The value is not a secret — the doc's rule is "env var name or secret ref,
 * NEVER the token" — so no single one of them leaks access. What changes at the
 * collection is AGGREGATION: one connection's credential_ref is a detail an
 * operator needs while inspecting that connection, and every connection's
 * credential_ref returned in one response is an inventory of where this
 * deployment keeps its credentials. The same fact is worth more in bulk, and a
 * list endpoint is the thing that hands it over in bulk.
 *
 * There is a rule to cite rather than only an instinct. ROUTES.md specifies
 * what the connections screen shows — "Scope · status · rotation · revocation"
 * — and credential_ref is not among those four; it appears there only as the
 * explanation of what is NOT displayed, "the token is never displayed,
 * credential_ref names where it lives". So the browse surface was already
 * specified without it. A `get` is an inspect surface answering "what exactly
 * is this one", which is the question credential_ref answers.
 *
 * CLAUDE.md: "Security is a layer, not a feature. Nobody will ask you to add
 * access control. Add it anyway, and assume a model will not."
 */
export const connectionListRow = connectionSchema.pick({
	id: true,
	service: true,
	label: true,
	engagementId: true,
	scopeType: true,
	scopeValue: true,
	status: true,
	expiresAt: true,
	revokedAt: true,
});

export const connectionContract = c.router({
	list: {
		method: "GET",
		path: "/connections",
		query: paginationQuery,
		responses: { 200: successList(connectionListRow), 403: crudErrorEnvelope },
	},
	get: {
		method: "GET",
		path: "/connections/:id",
		responses: { 200: success(connectionSchema), 404: crudErrorEnvelope },
	},
});
