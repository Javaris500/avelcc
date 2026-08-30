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

/* ── the client detail page ─────────────────────────────────────────────── */

/**
 * THE ENGAGEMENT IS THE SPINE, not one section among nine.
 *
 * `client_id` exists in exactly ONE place in the schema: `engagements.clientId`.
 * Nothing else points at a client — not missions, not exports, not dispatches,
 * and not intakes, which are `engagement_id FK -> Engagement`. So every shape
 * below is reached through a two-hop join, and a client with no engagement can
 * hold no work at all.
 *
 * Found by avel-c2 against UI-PLAN section 5 and verified against the schema.
 */

/**
 * NULL METRICS ARE NOT ZERO METRICS, and a screen must render them apart.
 *
 * `null` means the client has no engagement, so there is nowhere for a mission
 * to live and counting them would measure something that cannot exist. An
 * object of zeros means engagements exist and nothing has happened in them yet.
 * "Nothing can be here" and "nothing is here yet" are different states and only
 * one of them is a prompt to act.
 */
export const clientMetrics = z.object({
	missions: z.number().int(),
	/** A mission with an unclosed blocker. The signal the list row keys off. */
	blockedMissions: z.number().int(),
	deliveries: z.number().int(),
	/** Decimal STRING, never a number. Money does not round-trip as a float. */
	spendUsd: z.string().nullable(),
});

export const clientEngagementRow = z.object({
	id: z.string().uuid(),
	name: z.string(),
	status: clientStatus,
	startedAt: z.string(),
	missionCount: z.number().int(),
});

export const clientMissionRow = z.object({
	id: z.string().uuid(),
	engagementId: z.string().uuid(),
	title: z.string().nullable(),
	type: z.string(),
	/** TEXT, not an enum. missions.status still has no vocabulary anywhere. */
	status: z.string(),
	sprintN: z.number().int(),
	cut: z.enum(["horizontal", "vertical"]).nullable(),
	openBlockers: z.number().int(),
});

export const clientDeliveryRow = z.object({
	id: z.string().uuid(),
	missionId: z.string().uuid(),
	targetKind: z.enum(["zip", "github_pr", "github_push"]),
	status: z.string(),
	snapshotSha256: z.string().nullable(),
	createdAt: z.string(),
});

export const clientRosterRow = z.object({
	agentTemplateId: z.string().uuid(),
	slug: z.string(),
	name: z.string(),
	kind: z.enum(["horizontal", "feature"]),
	missionCount: z.number().int(),
});

/**
 * Connection targets for this client's engagements.
 *
 * An account-wide connection — `engagement_id` null, which is how V1's single
 * env token is modelled — is NOT a repository of this client and is excluded.
 * Showing it against every client would claim a relationship that does not
 * exist.
 */
export const clientRepositoryRow = z.object({
	id: z.string().uuid(),
	label: z.string(),
	scopeType: z.enum(["owner", "repo"]),
	scopeValue: z.string(),
	status: z.enum(["active", "expired", "revoked"]),
});

export const clientCostRow = z.object({
	id: z.string().uuid(),
	missionId: z.string().uuid(),
	actorKind: z.enum(["agent", "operator"]),
	actorRef: z.string(),
	usd: z.string().nullable(),
	outcome: z.string().nullable(),
	occurredOn: z.string().nullable(),
});

/**
 * One time-ordered feed over the telemetry tables. APPEND-ONLY at the database,
 * which refuses UPDATE and DELETE by trigger — so this is a log that can be
 * trusted to be what happened rather than what someone last said, and it needs
 * no edit affordance.
 */
export const clientActivityEvent = z.object({
	kind: z.enum(["dispatch", "completion", "finding", "blocker"]),
	id: z.string().uuid(),
	missionId: z.string().uuid(),
	at: z.string(),
	label: z.string(),
});

export const clientDetail = z.object({
	metrics: clientMetrics.nullable(),
	openRequests: z.number().int(),
	lastActivityAt: z.string().nullable(),
	engagements: z.array(clientEngagementRow),
	missions: z.array(clientMissionRow),
	deliveries: z.array(clientDeliveryRow),
	roster: z.array(clientRosterRow),
	repositories: z.array(clientRepositoryRow),
	cost: z.array(clientCostRow),
	activity: z.array(clientActivityEvent),
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

	/**
	 * ONE ROUND TRIP FOR THE WHOLE PAGE rather than one per section. Every
	 * section renders at once, and nine requests would be nine waterfalls for a
	 * view whose purpose is answering the question immediately. The sections are
	 * read-only in the first cut, so nothing invalidates independently.
	 */
	detail: {
		method: "GET",
		path: "/clients/:id/detail",
		responses: { 200: success(clientDetail), 404: crudErrorEnvelope },
	},
});
