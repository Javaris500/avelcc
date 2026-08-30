import { initContract } from "@ts-rest/core";
import { z } from "zod";

import { crudErrorEnvelope, successList } from "#/contract/shared/envelope";
import { paginationQuery } from "#/contract/shared/pagination";

const c = initContract();

/**
 * The catalog: skills, agent templates and skill sources.
 *
 * ONE FILE FOR THREE ROUTE GROUPS, which breaks the one-entity-per-file pattern
 * its neighbours follow. The reason is that these three share a vocabulary that
 * belongs to none of them alone — `skillType` is a skill's column and an agent
 * template's join, `revokedAt` means the same thing on all three, and a skill's
 * attachment shape names templates and roster entries. Split across three files
 * that vocabulary either duplicates or needs a fourth file to hold it. The
 * barrel still exposes three separate route groups.
 *
 * LIFTED FROM `src/modules/catalog/contract.ts`, which avel-fa wrote as "a
 * REQUEST written as code" because the catalog screens needed shapes and this
 * file did not exist. Their field names, nullability and enum members were read
 * off `schema.ts` and are carried over unchanged. The joins and counts were
 * marked `[specced]` there because no query served them; they are served now.
 *
 * WHY LIST AND NOT GET. `src/contract/index.ts` said procedures were "not yet
 * specified beyond list/get", and a `get` is still not built — the catalog's
 * detail panel renders from the row already on screen rather than fetching
 * again, so a `get` would be a procedure nothing calls. Section 12 rule 6
 * applied to the contract rather than to a control.
 *
 * NO WRITES. The catalog "ships empty and is populated in-app", so something
 * must eventually write it, and nothing here does. What that write looks like
 * is unspecified in DATA-CONTRACTS-V2, and inventing it is the failure this
 * layer exists to prevent.
 */

/* ── vocabulary that already exists in the database ─────────────────────── */

/** `skill_type` pgEnum. */
export const skillType = z.enum(["knowledge", "capability"]);
export type SkillType = z.infer<typeof skillType>;

/** `agent_runtime` pgEnum. The renderer branches on this. */
export const agentRuntime = z.enum(["model", "human", "code"]);
export type AgentRuntime = z.infer<typeof agentRuntime>;

/** `agent_kind` pgEnum. Describes the cut, not what executes the agent. */
export const agentKind = z.enum(["horizontal", "feature"]);

/** `agent_team` pgEnum. The horizontal band. Null on a feature agent. */
export const agentTeam = z.enum(["frontend", "backend", "qa", "root"]);

/* ── revocation ──────────────────────────────────────────────────────────── */

/**
 * `revokedAt` IS `deleted_at`, AND IT IS ON THE WIRE. Both halves are
 * deliberate and both diverge from `client.ts`, which says a soft-delete column
 * is a storage fact that never travels because every read filters it out.
 *
 * That rule is right everywhere it applies and it does not apply here. The
 * catalog's job is to make a withdrawn skill VISIBLE — a revoked skill still
 * attached to a live roster entry is the shape of a real bug this project has
 * already shipped, and it is invisible on a screen that filters revoked rows
 * out. So these reads deliberately include them, and the column has to travel
 * for the screen to mark the row.
 *
 * There is no `revoked_at`. It exists on `connections` and on no other table;
 * `skills`, `agent_templates` and `skill_sources` carry the shared `softDelete`
 * helper, which is `deleted_at` alone. The operator's word is "revoked" because
 * "deleted" is wrong for a row deliberately retained: an Export already
 * delivered references the skill, and removing it would rewrite history the
 * package still points at. This is the one seam where the two names meet.
 *
 * A NAME IS NOT A CAPABILITY. Nothing writes this field, because no revoke
 * procedure exists to call.
 */
const revocation = z.object({
	/** ISO timestamp, or null for a live row. */
	revokedAt: z.string().nullable(),
});

/* ── attachments ─────────────────────────────────────────────────────────── */

/**
 * WHERE A SKILL IS ACTUALLY USED. It is what makes a catalog more than a list
 * of names, and what makes a revoked skill legible as a risk rather than as a
 * greyed-out row.
 *
 * TWO RELATIONS, NOT ONE, and they are different facts. `agent_template_skills`
 * is what a template WILL carry into any future roster. `roster_entry_skills`
 * is what a mission ALREADY carries. A skill withdrawn while still attached to
 * a live roster entry is invisible unless both sides are read.
 */
export const skillAttachment = z.object({
	templates: z.array(
		z.object({
			id: z.string().uuid(),
			slug: z.string(),
			name: z.string(),
			runtime: agentRuntime,
			/** True where the template itself is revoked. */
			revoked: z.boolean(),
		}),
	),
	rosterEntries: z.array(
		z.object({
			id: z.string().uuid(),
			missionId: z.string().uuid(),
			/** Nullable for the same reason `missionListRow.title` is. */
			missionTitle: z.string().nullable(),
			agentSlug: z.string(),
			/**
			 * True where the roster entry is inactive. `active` gates DISPATCH and
			 * not the render, so an inactive entry still carries the skill into a
			 * package and still counts as an attachment.
			 */
			inactive: z.boolean(),
		}),
	),
});
export type SkillAttachment = z.infer<typeof skillAttachment>;

/* ── skills ──────────────────────────────────────────────────────────────── */

/**
 * `contentMd` AND `avelEnhancementMd` ARE ON THE ROW, deliberately.
 *
 * The usual reason to withhold a text column from a list is payload size, and
 * it does not apply: the catalog ships empty and is populated in-app, so it is
 * tens of rows written by one operator. A second round trip to read the body of
 * a row already on screen buys nothing. If it ever grows past that, the fix is
 * a `skill.get` and an excerpt on the row, not a lazily-populated field.
 */
export const skillRow = z
	.object({
		id: z.string().uuid(),
		slug: z.string(),
		name: z.string(),
		type: skillType,
		contentMd: z.string(),
		avelEnhancementMd: z.string().nullable(),
		sourceId: z.string().uuid(),
		sourceName: z.string(),
		/** True where the SOURCE is revoked and the skill itself is not. */
		sourceRevoked: z.boolean(),
		recommendedFor: z.array(z.string()),
		attachedTo: skillAttachment,
		createdAt: z.string(),
		updatedAt: z.string(),
	})
	.merge(revocation);
export type SkillRow = z.infer<typeof skillRow>;

/* ── agent templates ─────────────────────────────────────────────────────── */

/**
 * `identityMd` is NOT NULL and `depthMd` is nullable, on EVERY runtime. That
 * asymmetry is why this row carries both regardless of runtime: a populated
 * column says nothing about whether the renderer will emit it, because
 * `render.ts` branches on `runtime` and a non-model agent loads no model
 * context at all.
 *
 * So a human or code agent can hold a full page of identity the package will
 * never contain. A shape that hid `identityMd` for a non-model agent would hide
 * that divergence with it.
 */
export const agentTemplateRow = z
	.object({
		id: z.string().uuid(),
		slug: z.string(),
		name: z.string(),
		kind: agentKind,
		/** Non-null exactly when `kind === 'horizontal'`. A database CHECK. */
		team: agentTeam.nullable(),
		/** Non-null exactly when `kind === 'feature'`. The mirror CHECK. */
		engagementId: z.string().uuid().nullable(),
		/** A feature agent is only meaningful with its engagement named. */
		engagementName: z.string().nullable(),
		clientName: z.string().nullable(),
		runtime: agentRuntime,
		waveDefaults: z.array(z.string()),
		identityMd: z.string(),
		depthMd: z.string().nullable(),
		writablePaths: z.array(z.string()),
		appendOnlyPaths: z.array(z.string()),
		readonlyPaths: z.array(z.string()),
		skills: z.array(
			z.object({
				id: z.string().uuid(),
				slug: z.string(),
				name: z.string(),
				type: skillType,
				revoked: z.boolean(),
			}),
		),
		/** Roster entries across all missions that copied this template. */
		rosterUseCount: z.number().int(),
		createdAt: z.string(),
		updatedAt: z.string(),
	})
	.merge(revocation);
export type AgentTemplateRow = z.infer<typeof agentTemplateRow>;

/* ── skill sources ───────────────────────────────────────────────────────── */

export const skillSourceRow = z
	.object({
		id: z.string().uuid(),
		name: z.string(),
		url: z.string().nullable(),
		/**
		 * SPLIT, NEVER ONE TOTAL. A source with forty skills of which thirty are
		 * revoked is a different object from one with ten live skills, and a
		 * single count renders them identically.
		 */
		liveSkillCount: z.number().int(),
		revokedSkillCount: z.number().int(),
		createdAt: z.string(),
		updatedAt: z.string(),
	})
	.merge(revocation);
export type SkillSourceRow = z.infer<typeof skillSourceRow>;

/* ── responses ───────────────────────────────────────────────────────────── */

export const skillListResponse = successList(skillRow);
export type SkillListResponse = z.infer<typeof skillListResponse>;

export const agentTemplateListResponse = successList(agentTemplateRow);
export type AgentTemplateListResponse = z.infer<
	typeof agentTemplateListResponse
>;

export const skillSourceListResponse = successList(skillSourceRow);
export type SkillSourceListResponse = z.infer<typeof skillSourceListResponse>;

/* ── procedures ──────────────────────────────────────────────────────────── */

/**
 * 200 and 403 only, no 422. A malformed pagination query is not an error: it
 * falls back to the schema's defaults and still returns a page. Same reasoning
 * as the client and mission lists, and returning a status the contract does not
 * declare would be a response the caller's error map has no case for.
 */
export const skillContract = c.router({
	list: {
		method: "GET",
		path: "/api/skills",
		query: paginationQuery,
		responses: { 200: skillListResponse, 403: crudErrorEnvelope },
		summary: "Every skill, revoked included, with where each is attached.",
	},
});

export const agentTemplateContract = c.router({
	list: {
		method: "GET",
		path: "/api/agent-templates",
		query: paginationQuery,
		responses: { 200: agentTemplateListResponse, 403: crudErrorEnvelope },
		summary: "Every agent template, revoked included, with its skills.",
	},
});

export const skillSourceContract = c.router({
	list: {
		method: "GET",
		path: "/api/skill-sources",
		query: paginationQuery,
		responses: { 200: skillSourceListResponse, 403: crudErrorEnvelope },
		summary: "Every skill source, with live and revoked counts kept apart.",
	},
});
