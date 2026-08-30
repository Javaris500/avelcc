import { z } from "zod";

import { successList } from "#/contract/shared/envelope";

/**
 * THE CATALOG SHAPES, DECLARED LOCALLY, AND THAT IS A KNOWN DEFECT.
 *
 * Every other screen in this app infers its shape from `src/contract/`, so the
 * screen and the route that answers it cannot disagree about a field without
 * one of them failing to compile. `missions.index.tsx` says so in its own
 * header and it is right.
 *
 * This file cannot do that. `src/contract/index.ts` lists `agent-template,
 * skill` under NOT BUILT, "shapes exist; procedures not yet specified beyond
 * list/get", and `skill-source` under "no procedures exist". This session owns
 * the frontend only and may not write `src/contract/`, so the alternative to
 * declaring the shapes here was declaring nothing and shipping three more empty
 * screens.
 *
 * So this file is a REQUEST written as code. It is what the catalog screens
 * need in order to answer the questions on them. When the catalog procedures
 * land in `src/contract/`, every schema below is deleted and the views import
 * from there. Nothing else in this module changes: the views import types from
 * this file only.
 *
 * WHAT IS VERIFIED. Field names, nullability and enum members below were read
 * off `src/modules/db/schema.ts` on 2026-08-30, not off a document. `[built]`
 * The joins and counts were not. They are what the screens need and no query
 * serves them today. Those are marked at their declaration. `[specced]`
 */

/* ── vocabulary that already exists in the database ─────────────────────── */

/** `skill_type` pgEnum, schema.ts:70. */
export const skillType = z.enum(["knowledge", "capability"]);
export type SkillType = z.infer<typeof skillType>;

/** `agent_runtime` pgEnum, schema.ts:85. The renderer's own vocabulary. */
export const agentRuntime = z.enum(["model", "human", "code"]);
export type AgentRuntime = z.infer<typeof agentRuntime>;

/** `agent_kind` pgEnum. Describes the cut, not what executes the agent. */
export const agentKind = z.enum(["horizontal", "feature"]);

/** `agent_team` pgEnum. The horizontal band. Null on a feature agent. */
export const agentTeam = z.enum(["frontend", "backend", "qa", "root"]);

/* ── the revocation field, and the one place its meaning is written down ── */

/**
 * REVOKED IS `deleted_at`. There is no `revoked_at` on `skills`.
 *
 * Verified: `revoked_at` exists on `connections` (schema.ts:747) and on no
 * other table. `skills`, `agent_templates` and `skill_sources` each carry the
 * shared `softDelete` helper, which is `deleted_at` alone (columns.ts).
 *
 * So the catalog has ONE withdrawal state, not two, and this is the seam where
 * the operator's word is mapped onto the column. The screens say "Revoked"
 * because that is what the operator calls it, and because "deleted" is wrong
 * for a row that is deliberately retained. The retention is the reason soft
 * delete exists here at all: an Export already delivered references the skill,
 * and removing the row would rewrite history the package still points at.
 *
 * A NAME IS NOT A CAPABILITY. Nothing in this module can revoke anything.
 * `revokedAt` is read on every row and written by nothing, because no write
 * procedure exists to call. Section 12 rule 6.
 */
const catalogRevocation = z.object({
	/** ISO timestamp, or null for a live row. Maps to `deleted_at`. */
	revokedAt: z.string().nullable(),
});

/* ── attachments ─────────────────────────────────────────────────────────── */

/**
 * WHERE A SKILL IS ACTUALLY USED, which is the only thing that makes a catalog
 * more than a list of names, and the only thing that makes a revoked skill
 * legible as a risk rather than as a greyed-out row.
 *
 * Two relations, not one, and they are different facts. `agent_template_skills`
 * is what a template WILL carry into any future roster. `roster_entry_skills`
 * is what a mission ALREADY carries. A skill withdrawn from the catalog while
 * still attached to a live roster entry is the shape of the bug this interface
 * is asked to make visible, and it is invisible unless both sides are read.
 *
 * `[specced]` — no query serves either join today.
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
			/** True where the roster entry is inactive. */
			inactive: z.boolean(),
		}),
	),
});
export type SkillAttachment = z.infer<typeof skillAttachment>;

/* ── skills ──────────────────────────────────────────────────────────────── */

/**
 * `contentMd` AND `avelEnhancementMd` ARE ON THE LIST ROW, deliberately.
 *
 * The usual reason to withhold a text column from a list is payload size. It
 * does not apply here: the catalog "ships empty and is populated in-app"
 * (schema.ts, on `skill_sources`), so it is tens of rows written by one
 * operator, and a second round trip to read the body of a row already on screen
 * buys nothing. If the catalog ever reaches a size where this is wrong, the fix
 * is a `skill.get` procedure and an excerpt on the row, not a lazy field.
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
		/** Joined from `skill_sources`. `[specced]` */
		sourceName: z.string(),
		/** True where the SOURCE is revoked and the skill is not. */
		sourceRevoked: z.boolean(),
		recommendedFor: z.array(z.string()),
		attachedTo: skillAttachment,
		createdAt: z.string(),
		updatedAt: z.string(),
	})
	.merge(catalogRevocation);
export type SkillRow = z.infer<typeof skillRow>;

/* ── agent templates ─────────────────────────────────────────────────────── */

/**
 * `identityMd` is NOT NULL and `depthMd` is nullable, on every runtime. That
 * asymmetry is the reason the agents screen has the shape it does: a populated
 * column says nothing about whether the renderer will emit it, because
 * `render.ts` branches on `runtime` and a non-model agent loads no model
 * context at all.
 *
 * Both fields travel to the screen so the screen can show the divergence. A
 * shape that hid `identityMd` for a human agent would hide the defect with it.
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
		/** Joined. A feature agent is only meaningful with its engagement named. */
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
	.merge(catalogRevocation);
export type AgentTemplateRow = z.infer<typeof agentTemplateRow>;

/* ── skill sources ───────────────────────────────────────────────────────── */

export const skillSourceRow = z
	.object({
		id: z.string().uuid(),
		name: z.string(),
		url: z.string().nullable(),
		/**
		 * Split, never one total. A source with forty skills of which thirty are
		 * revoked is a different object from one with ten live skills, and a
		 * single count renders them identically.
		 */
		liveSkillCount: z.number().int(),
		revokedSkillCount: z.number().int(),
		createdAt: z.string(),
		updatedAt: z.string(),
	})
	.merge(catalogRevocation);
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

/* ── derived, in one place ───────────────────────────────────────────────── */

export function isRevoked(row: { revokedAt: string | null }): boolean {
	return row.revokedAt !== null;
}

/**
 * THE CONDITION THAT CAUSED A REAL BUG, named once so three screens cannot
 * disagree about what it is: a skill withdrawn from the catalog that something
 * still carries. Anything holding it will still render it into a package,
 * because nothing downstream re-checks the catalog at render time.
 *
 * An inactive roster entry still counts. `active` gates dispatch, not the
 * render, so an inactive entry holding a revoked skill is the same exposure.
 */
export function danglingAttachments(skill: SkillRow): number {
	if (!isRevoked(skill)) return 0;
	return (
		skill.attachedTo.templates.length + skill.attachedTo.rosterEntries.length
	);
}

/**
 * MODEL CONTEXT STORED ON AN AGENT THAT CANNOT RECEIVE IT.
 *
 * `render.ts` emits identity.md and depth.md only for `runtime === 'model'`.
 * A human or code template whose markdown columns are populated is carrying
 * text that nothing will ever render, and the catalog is the only screen that
 * can say so.
 *
 * Whitespace-only counts as absent. `identity_md` is NOT NULL, so every
 * non-model row necessarily holds a string, and treating `""` as content would
 * flag every human agent ever created.
 */
export function strandedModelContext(template: AgentTemplateRow): boolean {
	if (template.runtime === "model") return false;
	return (
		template.identityMd.trim().length > 0 ||
		(template.depthMd ?? "").trim().length > 0
	);
}
