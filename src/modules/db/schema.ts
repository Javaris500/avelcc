import { relations, sql } from "drizzle-orm";
import {
	boolean,
	check,
	index,
	integer,
	jsonb,
	numeric,
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

/* ── step 2 · mission, process and squad ────────────────────────────────── */

/**
 * DERIVED, not chosen. DATA-CONTRACTS-V2:230 — at setup the system reads the
 * repository's directory structure and determines which boundary is a
 * directory. An operator may override, and an override requires a written
 * rationale that renders into the delivery.
 *
 * The reason is specific: the original roster defect came from applying the
 * decomposition rule to a roster that had already been decided. A free-choice
 * field permits exactly that failure; a derived field with a written-rationale
 * override does not.
 */
export const missionCut = pgEnum("mission_cut", ["horizontal", "vertical"]);
export const missionCutSource = pgEnum("mission_cut_source", [
	"derived",
	"overridden",
]);

/** Code branches on this: each value is a different delivery path. */
export const playbookDeliverable = pgEnum("playbook_deliverable", [
	"pr",
	"report",
	"recommendation",
]);

export const missions = pgTable(
	"missions",
	{
		...identity,
		engagementId: uuid("engagement_id")
			.notNull()
			.references(() => engagements.id),
		/**
		 * Matches Playbook.mission_type. TEXT, not an enum: the contract types it
		 * `z.string()` and no closed vocabulary is defined anywhere. Code looks a
		 * playbook UP by this value rather than branching on it, which is the
		 * doc's own enum-vs-catalogue test.
		 */
		type: text("type").notNull(),
		/** Structured, shape owned by the mission type. */
		brief: jsonb("brief")
			.$type<Record<string, unknown>>()
			.notNull()
			.default({}),
		sprintN: integer("sprint_n").notNull().default(1),
		/** TEXT for the same reason as `type`, and see the reported gap. */
		status: text("status").notNull(),
		cut: missionCut("cut").notNull(),
		cutSource: missionCutSource("cut_source").notNull().default("derived"),
		cutRationale: text("cut_rationale"),
		/** A DEFAULT, not the binding destination. The Export names that. */
		repoUrl: text("repo_url"),
		/**
		 * Modelled now so cost governance is a gate check rather than a migration
		 * later. Read by nothing today. `numeric` not a float: money.
		 */
		spendCeilingUsd: numeric("spend_ceiling_usd", { precision: 12, scale: 2 }),
		...softDelete,
		...timestamps,
	},
	(t) => [
		index("missions_engagement_idx").on(t.engagementId),
		// An override without a written rationale is the failure this whole
		// mechanism exists to prevent, so it is refused by the database rather
		// than by a service that can be bypassed. `derived` may still carry one.
		check(
			"missions_override_requires_rationale",
			sql`${t.cutSource} <> 'overridden' or (${t.cutRationale} is not null and length(btrim(${t.cutRationale})) > 0)`,
		),
		// A sprint is 1-based and counts upward.
		check("missions_sprint_n_positive", sql`${t.sprintN} >= 1`),
	],
);

/**
 * A saved squad. Applying it MATERIALIZES RosterEntries — copy-then-edit — and
 * the preset itself holds no mission state.
 *
 * SHAPE INCOMPLETE, AND DELIBERATELY SO. DATA-CONTRACTS-V2:267 gives this
 * entity two sentences of prose and NO field list, and no schema for it exists
 * in src/contract either. Every other entity in that document has a field
 * block. What is here is only what something else already references:
 * Playbook.default_preset_id needs the id, and `preset.ts — list · get ·
 * create · update · apply` needs a name to list by.
 *
 * What is NOT here is the squad itself — which agent templates, at which
 * waves, with which priorities. That is the entire point of the entity and it
 * is undefined. Filed as a contract request rather than invented, because a
 * roster_preset_entries table I made up would be a shape nobody agreed to,
 * sitting under a materialize-into-RosterEntry operation.
 */
export const rosterPresets = pgTable(
	"roster_presets",
	{
		...identity,
		name: text("name").notNull(),
		...softDelete,
		...timestamps,
	},
	(t) => [
		uniqueIndex("roster_presets_name_live_unique")
			.on(t.name)
			.where(sql`${t.deletedAt} is null`),
	],
);

/**
 * The process, not the squad. DATA-CONTRACTS-V2:251 — "References a preset;
 * never lists agents." Composition is RosterPreset's; the Playbook owns gates,
 * waves and the deliverable.
 */
export const playbooks = pgTable(
	"playbooks",
	{
		...identity,
		/** Unique. A mission type resolves to exactly one playbook. */
		missionType: text("mission_type").notNull(),
		name: text("name").notNull(),
		wavesApplicable: text("waves_applicable").array().notNull().default([]),
		/**
		 * `{ gate, policy }[]`. jsonb rather than two columns or a join table
		 * because it is an ordered list read as a whole and never queried by
		 * element. Gate vocabulary is CLOSED — phase1-close · alignment · qa ·
		 * security · rollback · acceptance — and policy is `mandatory` or `warn`
		 * only; there is no skippable. Both are enforced by the zod schema in
		 * src/contract/playbook.ts, which is the one definition all three
		 * consumers share.
		 */
		gates: jsonb("gates")
			.$type<{ gate: string; policy: "mandatory" | "warn" }[]>()
			.notNull()
			.default([]),
		deliverable: playbookDeliverable("deliverable").notNull(),
		requiredFields: text("required_fields").array().notNull().default([]),
		/**
		 * NULLABLE, and that is what makes the migration order work. The doc's
		 * order builds Playbook before RosterPreset while Playbook references it;
		 * a nullable FK means a playbook can exist before any preset does, which
		 * is also true in the product — a process can be defined before anyone
		 * has saved a squad for it.
		 */
		defaultPresetId: uuid("default_preset_id").references(
			() => rosterPresets.id,
		),
		/** Counter-only. No version-history table, deliberately. */
		version: integer("version").notNull().default(1),
		...softDelete,
		...timestamps,
	},
	(t) => [
		uniqueIndex("playbooks_mission_type_live_unique")
			.on(t.missionType)
			.where(sql`${t.deletedAt} is null`),
		index("playbooks_default_preset_idx").on(t.defaultPresetId),
		check("playbooks_version_positive", sql`${t.version} >= 1`),
	],
);

/**
 * One agent customized for one mission.
 *
 * NO SOFT DELETE, and that is deliberate rather than an omission. The doc's
 * field list ends at `timestamps`, and rosterEntrySchema in src/contract
 * carries no deletedAt either. `active` already expresses "off the mission"
 * without destroying the row, which is what soft delete would have been for.
 *
 * This does sit in tension with the cross-cutting invariant at
 * DATA-CONTRACTS-V2:399 — soft delete on anything an Export can reach — and a
 * roster entry is rendered into the export. Reported, not resolved here: two
 * sources agree on the field list, so following them is the smaller
 * assumption.
 */
export const rosterEntries = pgTable(
	"roster_entries",
	{
		...identity,
		missionId: uuid("mission_id")
			.notNull()
			.references(() => missions.id, { onDelete: "cascade" }),
		agentTemplateId: uuid("agent_template_id")
			.notNull()
			.references(() => agentTemplates.id),
		/** Whether the agent is ON the mission. Not a delete. */
		active: boolean("active").notNull().default(true),
		waves: text("waves").array().notNull().default([]),
		/** wezterm pane priority. Nullable per the contract schema. */
		monitorPriority: integer("monitor_priority"),
		customizedMd: text("customized_md"),
		/**
		 * OVERRIDES the template's, per mission. Nullable, and null means "use
		 * the template's" — distinct from `[]`, which would mean "this agent may
		 * write nothing". An empty array is a real, different instruction.
		 */
		writablePaths: text("writable_paths").array(),
		...timestamps,
	},
	(t) => [
		// One entry per agent per mission. Whether an agent is on a mission is
		// whether its entry exists, so two entries for one agent makes that
		// question ambiguous and lets one row's `active` contradict the other's.
		// Not partial: this table has no soft delete to exclude.
		uniqueIndex("roster_entries_mission_agent_unique").on(
			t.missionId,
			t.agentTemplateId,
		),
		index("roster_entries_mission_idx").on(t.missionId),
		index("roster_entries_agent_template_idx").on(t.agentTemplateId),
		check(
			"roster_entries_monitor_priority_positive",
			sql`${t.monitorPriority} is null or ${t.monitorPriority} >= 0`,
		),
	],
);

/** `skillIds` on the contract's RosterEntry. Skills are a relation. */
export const rosterEntrySkills = pgTable(
	"roster_entry_skills",
	{
		rosterEntryId: uuid("roster_entry_id")
			.notNull()
			.references(() => rosterEntries.id, { onDelete: "cascade" }),
		skillId: uuid("skill_id")
			.notNull()
			.references(() => skills.id, { onDelete: "cascade" }),
	},
	(t) => [primaryKey({ columns: [t.rosterEntryId, t.skillId] })],
);

/* ── step 3 · delivery policy ───────────────────────────────────────────── */

/**
 * Matches exportTargetKind in src/contract/export.ts. An enum, not a catalogue:
 * each value is a different delivery path and code branches on it.
 */
export const exportTarget = pgEnum("export_target", [
	"zip",
	"github_pr",
	"github_push",
]);

/**
 * What a repository is allowed to receive.
 *
 * READ AS EXCEPTIONS, NOT A REGISTRY. DATA-CONTRACTS-V2:345 — "a repo with no
 * policy row is treated as false. The safe behavior needs no setup; only the
 * permissive behavior is opt-in." An absent row is the default, so the export
 * path defaults every field to its safe value rather than requiring a lookup to
 * succeed. Connection (*what authorizes this*) and Export (*the run itself*) are
 * the other two step-3 tables and are not built yet; this one has no FK to
 * either, so it lands independently.
 */
export const repoPolicies = pgTable(
	"repo_policies",
	{
		...identity,
		/** Normalized before insert. Unique among live rows. */
		repoUrl: text("repo_url").notNull(),
		label: text("label"),
		allowDirectPushToDefault: boolean("allow_direct_push_to_default")
			.notNull()
			.default(false),
		/** A DEFAULT the preview may pre-select; never the binding target. */
		defaultTarget: exportTarget("default_target"),
		...softDelete,
		...timestamps,
	},
	(t) => [
		// PARTIAL, for the soft-delete reason the other unique indexes carry: a
		// plain unique on repo_url makes a soft-deleted policy's url permanently
		// unreclaimable.
		uniqueIndex("repo_policies_repo_url_live_unique")
			.on(t.repoUrl)
			.where(sql`${t.deletedAt} is null`),
	],
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

export const missionsRelations = relations(missions, ({ one, many }) => ({
	engagement: one(engagements, {
		fields: [missions.engagementId],
		references: [engagements.id],
	}),
	rosterEntries: many(rosterEntries),
}));

export const rosterPresetsRelations = relations(rosterPresets, ({ many }) => ({
	playbooks: many(playbooks),
}));

export const playbooksRelations = relations(playbooks, ({ one }) => ({
	defaultPreset: one(rosterPresets, {
		fields: [playbooks.defaultPresetId],
		references: [rosterPresets.id],
	}),
}));

export const rosterEntriesRelations = relations(
	rosterEntries,
	({ one, many }) => ({
		mission: one(missions, {
			fields: [rosterEntries.missionId],
			references: [missions.id],
		}),
		agentTemplate: one(agentTemplates, {
			fields: [rosterEntries.agentTemplateId],
			references: [agentTemplates.id],
		}),
		skills: many(rosterEntrySkills),
	}),
);

export const rosterEntrySkillsRelations = relations(
	rosterEntrySkills,
	({ one }) => ({
		rosterEntry: one(rosterEntries, {
			fields: [rosterEntrySkills.rosterEntryId],
			references: [rosterEntries.id],
		}),
		skill: one(skills, {
			fields: [rosterEntrySkills.skillId],
			references: [skills.id],
		}),
	}),
);
