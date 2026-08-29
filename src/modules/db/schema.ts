import { relations, sql } from "drizzle-orm";
import {
	check,
	index,
	pgEnum,
	pgTable,
	primaryKey,
	text,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";

import { identity, softDelete, timestamps } from "#/modules/db/columns";

/**
 * AVEL schema — the agency and catalogue layer.
 *
 * Covers the corrected migration order's step 0 and step 1. The order printed
 * in DATA-CONTRACTS-V2:409 CANNOT EXECUTE as written: it creates AgentTemplate
 * (step 1) and Mission (step 2) with `engagement_id FK -> Engagement`, and
 * Engagement appears nowhere in it. Client, Engagement, Intake and Finding were
 * added when the model went from twelve entities to sixteen; the order was not
 * updated. Client and Engagement are therefore built FIRST here, and that
 * deviation is reported rather than absorbed.
 *
 * ENUM vs CATALOGUE, per DATA-CONTRACTS-V2:403 — "Enums are pgEnums when code
 * branches on them; catalogues are tables when they're labels that grow." The
 * test the doc gives: does code branch on the value? SkillSource is a table
 * because it is a label that grows and ships empty. `kind` is an enum because
 * aggregation rules branch on it.
 */

/* ── enums ──────────────────────────────────────────────────────────────── */

export const clientStatus = pgEnum("client_status", ["active", "closed"]);
export const engagementStatus = pgEnum("engagement_status", [
	"active",
	"closed",
]);

/**
 * NOT cosmetic. DATA-CONTRACTS-V2:168 — a horizontal agent is the same agent
 * across every mission and client, so its history is continuous. A feature
 * agent is scoped to one codebase, and two clients can both have one slugged
 * `transactions` which are unrelated agents sharing a name. Aggregating a
 * feature agent across engagements is the reporting bug this enum prevents.
 */
export const agentKind = pgEnum("agent_kind", ["horizontal", "feature"]);
export const agentTeam = pgEnum("agent_team", [
	"frontend",
	"backend",
	"qa",
	"root",
]);

/**
 * `capability` DECLARES a tool grant; it does not enforce one. Enforcement
 * needs a runtime that can restrict a tool and none exists. The UI is required
 * to label it declarative, because a badge implying enforcement would be the
 * product lying about itself.
 */
export const skillType = pgEnum("skill_type", ["knowledge", "capability"]);

/* ── step 0 · the agency layer ──────────────────────────────────────────── */

export const clients = pgTable("clients", {
	...identity,
	name: text("name").notNull(),
	status: clientStatus("status").notNull().default("active"),
	primaryContact: text("primary_contact"),
	notesMd: text("notes_md"),
	...softDelete,
	...timestamps,
});

export const engagements = pgTable(
	"engagements",
	{
		...identity,
		clientId: uuid("client_id")
			.notNull()
			.references(() => clients.id),
		name: text("name").notNull(),
		scopeMd: text("scope_md"),
		status: engagementStatus("status").notNull().default("active"),
		...softDelete,
		...timestamps,
	},
	(t) => [index("engagements_client_idx").on(t.clientId)],
);

/* ── step 1 · the catalogue ─────────────────────────────────────────────── */

/** A table, not an enum: it ships empty and is populated in-app. */
export const skillSources = pgTable("skill_sources", {
	...identity,
	name: text("name").notNull(),
	url: text("url"),
	...softDelete,
	...timestamps,
});

export const skills = pgTable(
	"skills",
	{
		...identity,
		slug: text("slug").notNull(),
		name: text("name").notNull(),
		contentMd: text("content_md").notNull(),
		avelEnhancementMd: text("avel_enhancement_md"),
		type: skillType("type").notNull(),
		sourceId: uuid("source_id")
			.notNull()
			.references(() => skillSources.id),
		recommendedFor: text("recommended_for").array().notNull().default([]),
		...softDelete,
		...timestamps,
	},
	(t) => [
		// PARTIAL, because rows are soft-deleted and never removed. A plain
		// unique index makes a slug permanently unreclaimable: soft-delete
		// `tdd-workflow`, re-import it, and the insert fails against a row the
		// UI says does not exist, with no way to resolve it from the app.
		uniqueIndex("skills_slug_live_unique")
			.on(t.slug)
			.where(sql`${t.deletedAt} is null`),
	],
);

export const agentTemplates = pgTable(
	"agent_templates",
	{
		...identity,
		/** The path segment in the export AND the mount lookup key. */
		slug: text("slug").notNull(),
		name: text("name").notNull(),
		kind: agentKind("kind").notNull(),
		/**
		 * Required when kind='feature', nullable otherwise. Not enforced by a
		 * column constraint because Postgres cannot express "notNull when another
		 * column equals a value" without a CHECK — added below as a table check
		 * so the rule lives in the database rather than in a service that can be
		 * bypassed.
		 */
		engagementId: uuid("engagement_id").references(() => engagements.id),
		team: agentTeam("team").notNull(),
		waveDefaults: text("wave_defaults").array().notNull().default([]),
		identityMd: text("identity_md").notNull(),
		depthMd: text("depth_md"),
		/**
		 * Glob patterns this agent may modify. Backs the file-ownership check at
		 * render time: a file modified outside these globs is a gate failure.
		 *
		 * REPORTED, NOT INVENTED: the golden fixture's roster.json also carries
		 * `append_only`, `readonly` and `runtime`, and NO entity in
		 * DATA-CONTRACTS-V2 declares any of the three. GOLDEN-FIXTURE calls
		 * append_only "the Mission 002 finding encoded" and the most important
		 * thing in that file. They are absent here deliberately — adding columns
		 * the contract does not define would be inventing a shape, which is the
		 * one thing the contract rule forbids.
		 */
		writablePaths: text("writable_paths").array().notNull().default([]),
		...softDelete,
		...timestamps,
	},
	(t) => [
		// A feature agent's slug is only unique within its engagement: two clients
		// may both have `transactions` and they are unrelated agents.
		// PARTIAL for the same soft-delete reason as skills.
		uniqueIndex("agent_templates_slug_engagement_live_unique")
			.on(t.slug, t.engagementId)
			.where(sql`${t.deletedAt} is null`),
		// AND a separate one for horizontal agents. Postgres treats NULLs as
		// DISTINCT, and the check below guarantees engagement_id IS NULL for every
		// horizontal row — so the composite index above never fires for them, and
		// two horizontal templates slugged `deployer` would both insert. The slug
		// is the mount lookup key, so that is one agent silently shadowing
		// another: the aggregation bug `kind` exists to prevent, one layer down.
		uniqueIndex("agent_templates_slug_horizontal_unique")
			.on(t.slug)
			.where(sql`${t.engagementId} is null and ${t.deletedAt} is null`),
		index("agent_templates_engagement_idx").on(t.engagementId),
		// A feature agent MUST be scoped to an engagement; a horizontal one must
		// not be. In the database rather than a service, because a service can be
		// bypassed and this is the rule that stops two clients' `transactions`
		// agents being aggregated as one.
		check(
			"agent_templates_feature_requires_engagement",
			sql`(${t.kind} = 'feature') = (${t.engagementId} IS NOT NULL)`,
		),
	],
);

/* ── join tables ────────────────────────────────────────────────────────── */

export const agentTemplateSkills = pgTable(
	"agent_template_skills",
	{
		agentTemplateId: uuid("agent_template_id")
			.notNull()
			.references(() => agentTemplates.id, { onDelete: "cascade" }),
		skillId: uuid("skill_id")
			.notNull()
			.references(() => skills.id, { onDelete: "cascade" }),
	},
	(t) => [primaryKey({ columns: [t.agentTemplateId, t.skillId] })],
);

/* ── relations ──────────────────────────────────────────────────────────── */

export const clientsRelations = relations(clients, ({ many }) => ({
	engagements: many(engagements),
}));

export const engagementsRelations = relations(engagements, ({ one, many }) => ({
	client: one(clients, {
		fields: [engagements.clientId],
		references: [clients.id],
	}),
	agentTemplates: many(agentTemplates),
}));

export const skillsRelations = relations(skills, ({ one, many }) => ({
	source: one(skillSources, {
		fields: [skills.sourceId],
		references: [skillSources.id],
	}),
	agentTemplates: many(agentTemplateSkills),
}));

export const agentTemplatesRelations = relations(
	agentTemplates,
	({ one, many }) => ({
		engagement: one(engagements, {
			fields: [agentTemplates.engagementId],
			references: [engagements.id],
		}),
		skills: many(agentTemplateSkills),
	}),
);

export const agentTemplateSkillsRelations = relations(
	agentTemplateSkills,
	({ one }) => ({
		agentTemplate: one(agentTemplates, {
			fields: [agentTemplateSkills.agentTemplateId],
			references: [agentTemplates.id],
		}),
		skill: one(skills, {
			fields: [agentTemplateSkills.skillId],
			references: [skills.id],
		}),
	}),
);
