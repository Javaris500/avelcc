import { relations, sql } from "drizzle-orm";
import {
	type AnyPgColumn,
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
	timestamp,
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

/**
 * WHAT EXECUTES AN AGENT, as distinct from `kind`, which describes the cut.
 *
 * A pgEnum, and the one place in this round where the vocabulary was GIVEN
 * rather than chosen: `render/types.ts` declares `'model' | 'human' | 'code'`,
 * and render.ts branches on it — a non-model agent loads no model context, so it
 * renders neither identity.md nor depth.md. Code branching on the value is the
 * doc's own enum test, and the values come from the renderer rather than from
 * anyone's guess, which is the distinction that kept `pr_status` as text.
 *
 * GOLDEN-FIXTURE's MISSION.md says "Foundations for this mission is the
 * operator", and ROSTER-V2:315 describes an agent that is "never a language
 * model" — so `human` and `code` are both real states, not speculative ones.
 */
export const agentRuntime = pgEnum("agent_runtime", ["model", "human", "code"]);

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
		/**
		 * NULLABLE FOR A FEATURE AGENT, and that is the same distinction `kind`
		 * already draws rather than a relaxation.
		 *
		 * `team` is a horizontal BAND — frontend, backend, qa, root. A horizontal
		 * agent lives in exactly one of them because that is what it owns. A
		 * feature agent owns one slice through EVERY layer: its schema, its
		 * service, its routes, its screens. Asking which band it belongs to has no
		 * answer, and NOT NULL forced one to be invented — CounselOS's seven
		 * agents each own a feature end to end, and every one of them would have
		 * had to claim a band it does not occupy.
		 *
		 * The CHECK below makes the two cases exclusive in the database rather
		 * than by convention, and it is deliberately the mirror of
		 * agent_templates_feature_requires_engagement: an engagement is required
		 * exactly when a team is not.
		 */
		team: agentTeam("team"),
		waveDefaults: text("wave_defaults").array().notNull().default([]),
		identityMd: text("identity_md").notNull(),
		depthMd: text("depth_md"),
		/**
		 * Glob patterns this agent may modify. Backs the file-ownership check at
		 * render time: a file modified outside these globs is a gate failure.
		 *
		 * The note that used to sit here — that `append_only`, `readonly` and
		 * `runtime` appear in the golden fixture and in no entity — is DISCHARGED.
		 * All three are built below, on an operator ruling, after the renderer's
		 * own types supplied the shapes that DATA-CONTRACTS-V2 never did.
		 */
		writablePaths: text("writable_paths").array().notNull().default([]),
		/**
		 * Paths this agent may APPEND to but never rewrite.
		 *
		 * GOLDEN-FIXTURE:221 calls this "the Mission 002 finding encoded": the
		 * composition root belongs to no feature and every feature must register
		 * in it, so omitting it means the first agent cannot load its own module.
		 * `process/reports/` and the decision log are the same shape — every agent
		 * is required to write there and none may rewrite another's entries.
		 *
		 * DEFAULT '{}', never NOT NULL without one. An agent with no append-only
		 * grant is the safe state and needs no setup, which is RepoPolicy's
		 * principle applied one table over.
		 */
		appendOnlyPaths: text("append_only_paths").array().notNull().default([]),
		/**
		 * Paths this agent may read but not write. The fixture uses `["**"]` for a
		 * quality agent, so "everything" is a real value rather than an edge case.
		 *
		 * DECLARATIVE, NOT ENFORCED, the same caveat `skill_type='capability'`
		 * carries: nothing restricts a read at runtime. It renders into the
		 * package and backs the ownership check on writes; a UI implying the
		 * filesystem enforces it would be the product lying about itself.
		 */
		readonlyPaths: text("readonly_paths").array().notNull().default([]),
		/**
		 * DEFAULT 'model' because every template that exists today is a model
		 * agent, so the default is what the live rows already mean rather than a
		 * value invented to make the column insertable.
		 */
		runtime: agentRuntime("runtime").notNull().default("model"),
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
		// The mirror of the check above, and the pair is the whole rule: a
		// horizontal agent has a band and no engagement, a feature agent has an
		// engagement and no band. Equality rather than implication in both, so
		// neither direction can be satisfied by leaving the column null.
		check(
			"agent_templates_horizontal_requires_team",
			sql`(${t.kind} = 'horizontal') = (${t.team} IS NOT NULL)`,
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
		/**
		 * The mission's human name. MISSION.md's first line renders from it —
		 * "# Mission: CounselOS Slice 1 — Transactions".
		 *
		 * NULLABLE, because five mission rows already exist without one and a
		 * default would have to invent a title for each. An untitled mission is a
		 * real state; a mission titled "Untitled" is a lie the schema told.
		 *
		 * Two consumers needed this independently and neither knew about the
		 * other: RenderMission.title, and the mission list screen, where 001, 002
		 * and a leftover test row are indistinguishable because all three render
		 * as "CounselOS · full-build · sprint 1 · draft".
		 */
		title: text("title"),
		type: text("type").notNull(),
		/** Structured, shape owned by the mission type. */
		brief: jsonb("brief")
			.$type<Record<string, unknown>>()
			.notNull()
			.default({}),
		sprintN: integer("sprint_n").notNull().default(1),
		/**
		 * TEXT for the same reason as `type`. The vocabulary is still undefined —
		 * every other status in DATA-CONTRACTS-V2 is a closed enum, Mission's
		 * field block says only `status` — so the default exists to make a row
		 * insertable, NOT to declare a lifecycle. Zero missions have run; any
		 * enum written today would be a guess about states nobody has observed.
		 * Promote to a pgEnum once mission 001 shows what the real states are.
		 */
		status: text("status").notNull().default("draft"),
		/**
		 * NULLABLE, and that is the honest shape rather than a weakening.
		 *
		 * The cut is DERIVED — at mission setup the system reads the connected
		 * repository's directory structure and sees which boundary is a
		 * directory. At create time there is no connected repository: Connection
		 * has no table, and `repo_url` is a default rather than the binding
		 * destination. So the cut is genuinely not knowable yet, and NULL says
		 * exactly that.
		 *
		 * A DEFAULT here would be the failure this whole mechanism exists to
		 * prevent — it writes a derived-looking value that nobody derived, which
		 * is the original roster defect wearing a different hat. NULL cannot be
		 * mistaken for a derivation. See DECISIONS-V2.md:246.
		 */
		cut: missionCut("cut"),
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
		/**
		 * SINGULAR, and that is the point rather than a simplification.
		 *
		 * ROSTER-V2:33 is the deciding line: "Phases are global. Foundations, then
		 * builders, then verification, then quality. Team or feature is a label,
		 * not a schedule. The v1 roster had frontend in wave 2 depending on an
		 * artifact produced by backend in wave 3, which is the kind of
		 * contradiction global phases prevent." Global sequential phases are the
		 * FIX for a scheduling contradiction, and an agent spanning waves
		 * reintroduces the ambiguity that fix removes.
		 *
		 * Every consumer is already singular: MISSION.md renders one Phase cell per
		 * agent, roster.json emits `phase`, and the renderer's agent sort key is
		 * `${phase} ${slug}` — an array would sort by its stringification. Nothing
		 * consumes this as a set.
		 *
		 * The decisive one: were this genuinely a set, the renderer would have to
		 * COLLAPSE it to fill one cell — first, lowest, comma-joined — and no
		 * document specifies a collapse rule. Inventing one would put a made-up
		 * rule on the path that produces a client-visible artifact.
		 *
		 * NULLABLE, not `NOT NULL DEFAULT 'A'`. An agent not yet assigned to a
		 * phase is a real state, and a default would silently claim every
		 * unassigned agent is a foundations agent. This is the one column in this
		 * area where safe-by-absence argues AGAINST a default.
		 *
		 * `playbooks.waves_applicable` STAYS text[] AND THAT IS NOT AN
		 * INCONSISTENCY TO TIDY. A playbook legitimately spans several waves; an
		 * agent occupies one position in the sequence. Two different facts, two
		 * different shapes. Do not harmonise them.
		 */
		wave: text("wave"),
		/** wezterm pane priority. Nullable per the contract schema. */
		monitorPriority: integer("monitor_priority"),
		customizedMd: text("customized_md"),
		/**
		 * OVERRIDES the template's, per mission. Nullable, and null means "use
		 * the template's" — distinct from `[]`, which would mean "this agent may
		 * write nothing". An empty array is a real, different instruction.
		 */
		writablePaths: text("writable_paths").array(),
		/**
		 * The same override shape as `writablePaths` above, deliberately: nullable
		 * means "inherit the template's", `{}` means "genuinely none".
		 *
		 * COLLAPSING THOSE TWO WOULD BE THE BUG. If null and `{}` meant the same
		 * thing there would be no way to say "this agent, on this mission, may
		 * append nowhere" — the instruction would silently read as "use whatever
		 * the template grants", which is the opposite. That is the entire reason
		 * the writable_paths precedent is shaped this way.
		 */
		appendOnlyPaths: text("append_only_paths").array(),
		readonlyPaths: text("readonly_paths").array(),
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

/**
 * DATA-CONTRACTS-V2:349 writes it as a quoted closed vocabulary — `service
 * ('github')` — the same form as every other enum in that document.
 *
 * pgEnum by the doc's own test at :403. Nothing looks a service UP: there is no
 * service catalogue table and no row to join to, which is what sent
 * `missions.type` and `playbooks.mission_type` to text. What a service selects
 * is a gateway implementation, and selecting an implementation is a branch by
 * definition. One value today; a second is `ALTER TYPE ... ADD VALUE`.
 */
export const connectionService = pgEnum("connection_service", ["github"]);

/**
 * Branches: an `owner` scope authorizes every repository under that owner, a
 * `repo` scope authorizes exactly one. Prefix match against exact match — two
 * different comparisons, selected by this value.
 */
export const connectionScopeType = pgEnum("connection_scope_type", [
	"owner",
	"repo",
]);

/**
 * Branches, and the branch is already written down: BLAST-RADIUS.md:272 gates
 * `CONNECTION_REVOKED` on `Connection.status !== 'active'`.
 */
export const connectionStatus = pgEnum("connection_status", [
	"active",
	"expired",
	"revoked",
]);

/**
 * The export lifecycle. A state machine, and every consumer branches on it, so
 * pgEnum rather than text.
 *
 * NINE STATES, FROM THE CONTRACT, NOT SIX FROM THE FIELD BLOCK. Two vocabularies
 * exist: DATA-CONTRACTS-V2:277 prints `pending → rendering → verifying → pr-open
 * → done | failed`, and src/contract/export.ts:18 carries those plus
 * `previewing`, `previewed` and `delivering` from BLAST-RADIUS.md. The contract
 * file wins because it is code three consumers already import, and because a dry
 * run is a REAL Export row that is terminal at `previewed` — under the six-state
 * list a preview has no state to end in. Reported as doc drift, not silently
 * reconciled: the canonical field block is the side that is stale.
 */
export const exportStatus = pgEnum("export_status", [
	"pending",
	"rendering",
	"verifying",
	"previewing",
	"previewed",
	"delivering",
	"pr-open",
	"done",
	"failed",
]);

/**
 * What authorizes a delivery. DATA-CONTRACTS-V2:347.
 *
 * THE TOKEN IS NEVER IN THIS TABLE. `credential_ref` names an env var or a
 * secret ref and the gateway resolves it. DECISIONS-V2:105 calls an unscoped,
 * unrevocable PAT with push rights into client repositories "the largest real
 * risk in the system"; this table is the scoping, and a column holding the
 * secret would put that risk straight back.
 *
 * An export resolves BOTH this (*what authorizes this?*) and a RepoPolicy
 * (*what am I allowed to do?*). Separate questions, separate tables.
 */
export const connections = pgTable(
	"connections",
	{
		...identity,
		service: connectionService("service").notNull().default("github"),
		label: text("label").notNull(),
		/**
		 * NOT IN THE CANONICAL FIELD LIST, added on an operator ruling.
		 * DECISIONS-V2:103 is titled "Connection scoped per engagement" and
		 * DATA-CONTRACTS-V2:128 makes revocation a step of engagement close — and
		 * without this column that step has nothing to select on. The field block
		 * and the decision that produced it disagree; the decision is the side
		 * with the mechanism.
		 *
		 * NULLABLE because V1 reads a single account-wide token from env and there
		 * is no engagement to attach it to. Null means "not scoped to one
		 * engagement", which is a real state rather than missing data.
		 */
		engagementId: uuid("engagement_id").references(() => engagements.id),
		scopeType: connectionScopeType("scope_type").notNull(),
		/** "meridian-co" for an owner scope, "meridian-co/app" for a repo scope. */
		scopeValue: text("scope_value").notNull(),
		/**
		 * An env var name or a secret ref. NEVER the token itself.
		 * DATA-CONTRACTS-V2:358.
		 */
		credentialRef: text("credential_ref").notNull(),
		/**
		 * Defaults to `active`, following clients.status and engagements.status —
		 * doc-silent on a default in exactly the same way, and defaulted to
		 * `active` here. A NOT NULL status with no default is the defect 0008 just
		 * finished unpicking on missions.status; not reopening it one table over.
		 */
		status: connectionStatus("status").notNull().default("active"),
		expiresAt: timestamp("expires_at", { withTimezone: true }),
		lastRotatedAt: timestamp("last_rotated_at", { withTimezone: true }),
		/** Set by engagement close. DATA-CONTRACTS-V2:128. */
		revokedAt: timestamp("revoked_at", { withTimezone: true }),
		...softDelete,
		...timestamps,
	},
	(t) => [
		// How an export finds its authorization: the service plus the scope it is
		// reaching. NOT unique, deliberately — rotation overlaps two live rows on
		// one scope, and no source declares a uniqueness rule here.
		index("connections_scope_idx").on(t.service, t.scopeType, t.scopeValue),
		index("connections_engagement_idx").on(t.engagementId),
		index("connections_status_idx").on(t.status),
		// `revoked` and `revoked_at` are two records of one fact and must not
		// disagree. One-directional, like missions_override_requires_rationale: a
		// revoked row carries its timestamp, while a timestamp on a row later
		// marked `expired` is history rather than a contradiction.
		check(
			"connections_revoked_requires_timestamp",
			sql`${t.status} <> 'revoked' or ${t.revokedAt} is not null`,
		),
		// An empty scope_value is a credential scoped to nothing, and the
		// comparison it feeds would match nothing or everything depending on which
		// side builds the pattern. Refused by the database.
		check(
			"connections_scope_value_present",
			sql`length(btrim(${t.scopeValue})) > 0`,
		),
	],
);

/**
 * One delivery run. DATA-CONTRACTS-V2:270.
 *
 * NO SOFT DELETE, for the reason roster_entries has none: the doc's field list
 * ends at `timestamps`. It is also the right shape — "immutable after freeze"
 * and a soft-deletable audit record are opposite ideas, and the cross-cutting
 * invariant at :399 governs what an Export can REACH, not the Export itself.
 *
 * IMMUTABILITY IS NOT ENFORCED HERE, and that is an [attestation] rather than a
 * mechanism. "Immutable after freeze; only `status` and `pr_status` advance" is
 * a sentence; no column, constraint or trigger stops an UPDATE of
 * snapshot_sha256 on a `done` row. A freeze trigger would enforce it and no
 * source specifies one, so this is reported rather than invented.
 *
 * `scope` IS ABSENT DELIBERATELY. DATA-CONTRACTS-V2:332 describes it in prose —
 * incremental run against full-project run — but the Export field block never
 * lists it, and `verification.mutation` already carries a `scope` of its own.
 * Whether a third meaning exists as a column is a contract question, and a
 * guessed column is the thing the enum-vocabulary rule forbids.
 */
export const exports = pgTable(
	"exports",
	{
		...identity,
		missionId: uuid("mission_id")
			.notNull()
			.references(() => missions.id),
		sprintN: integer("sprint_n").notNull().default(1),
		/** Unique. Not partial: this table has no soft delete to exclude. */
		idempotencyKey: uuid("idempotency_key").notNull(),
		targetKind: exportTarget("target_kind").notNull(),
		/**
		 * NULLABLE, with a CHECK, on an operator ruling. A zip authorizes nothing
		 * against anyone else's repository and so has no Connection to resolve; a
		 * github_pr or github_push without one has no answer to "what authorizes
		 * this". The doc lists the field unqualified, which read literally makes
		 * every zip export uninsertable. Same shape and same fix as
		 * agent_templates_feature_requires_engagement.
		 */
		connectionId: uuid("connection_id").references(() => connections.id),
		status: exportStatus("status").notNull().default("pending"),
		/**
		 * TEXT, because NO VOCABULARY EXISTS. DATA-CONTRACTS-V2:279 gives this
		 * field a name and nothing else — no values appear anywhere in the doc
		 * set. An enum here would be a vocabulary I invented. Nullable, so unlike
		 * missions.status it blocks no write. Promote to a pgEnum once the values
		 * are ruled.
		 */
		prStatus: text("pr_status"),
		/**
		 * NULLABLE, all three, because a row is INSERTed at `pending` and the
		 * snapshot does not exist until the render finishes. The doc lists them
		 * unqualified; obeyed literally that makes the first write of every export
		 * impossible, which is the defect class 0008 just closed.
		 *
		 * The CHECK below carries the real rule instead — all three or none. A key
		 * with no hash is an unverifiable blob, and a hash with no key points at
		 * nothing.
		 */
		snapshotKey: text("snapshot_key"),
		snapshotSha256: text("snapshot_sha256"),
		snapshotBytes: integer("snapshot_bytes"),
		/**
		 * IN POSTGRES, QUERYABLE, NEVER SEALED INSIDE THE BLOB. DECISIONS-V2:99 —
		 * you cannot correlate outcomes to loadouts if the manifest ships inside
		 * the artifact. Nullable until freeze, like the snapshot columns.
		 */
		versionManifest: jsonb("version_manifest").$type<Record<string, unknown>>(),
		/** AVEL's own frozen contract artifact hash. DECISIONS-V2:101. */
		contractSha256: text("contract_sha256"),
		/**
		 * The gate result. jsonb because the shape is nested, read whole, and
		 * DATA-CONTRACTS-V2:296 marks `conformance` an explicit placeholder whose
		 * inner shape is unspecified — columns cannot be generated from a shape
		 * that is still open.
		 */
		verification: jsonb("verification").$type<Record<string, unknown>>(),
		/**
		 * SHAPE CONTESTED, REPORTED NOT RESOLVED. DATA-CONTRACTS-V2:281 gives
		 * `{ gate, justification, overridden_by, overridden_at }`;
		 * src/contract/export.ts:77 gives `{ gate, rationale, overriddenBy }`.
		 * Typed against the contract file because it is code that ships today,
		 * keeping the doc's `overridden_at` as optional. jsonb, so reconciling the
		 * two costs no migration.
		 */
		gateOverride: jsonb("gate_override").$type<{
			gate: string;
			rationale: string;
			overriddenBy: string;
			/** Required as of the 2026-08-29 ruling. See contract/export.ts. */
			overriddenAt: string;
		}>(),
		/**
		 * This export re-ran a past mission's frozen inputs against a different
		 * model. DECISIONS-V2:331 — the replay harness "requires no new schema
		 * beyond a `replay_of` self-reference."
		 */
		replayOf: uuid("replay_of").references((): AnyPgColumn => exports.id),

		/* ── from the contract, not the canonical field block ──────────────── */
		//
		// The five below ship in src/contract/export.ts and are specified in
		// BLAST-RADIUS.md; the canonical Export block lists none of them. Added on
		// an operator ruling, because `exportSchema` returns all five today and
		// /exports/preview cannot be written without them. Added ALONGSIDE the
		// canonical fields — nothing in that block is changed or dropped.

		/**
		 * A dry run is a REAL Export row, terminal at `previewed`, never promoted.
		 * Without this column nothing distinguishes a preview from a delivery.
		 */
		dryRun: boolean("dry_run").notNull().default(false),
		/**
		 * Which preview this export was approved from. The device boundary is
		 * enforced here rather than by hiding a button: a github_push with no
		 * linked preview is refused.
		 */
		previewExportId: uuid("preview_export_id").references(
			(): AnyPgColumn => exports.id,
		),
		baseRef: text("base_ref"),
		/** NULLABLE: an empty repository has no tip, and that is a state. */
		baseCommitSha: text("base_commit_sha"),
		/**
		 * A SEPARATE COLUMN from `verification`, and BLAST-RADIUS.md is explicit
		 * about why: "verification asks is the work good, blast radius asks what
		 * does delivery do." Merged, the pre-flight screen cannot tell "tests
		 * failed" from "this would clobber a file", and those need different
		 * buttons.
		 */
		blastRadius: jsonb("blast_radius").$type<Record<string, unknown>>(),
		...timestamps,
	},
	(t) => [
		uniqueIndex("exports_idempotency_key_unique").on(t.idempotencyKey),
		index("exports_mission_idx").on(t.missionId),
		index("exports_connection_idx").on(t.connectionId),
		index("exports_replay_of_idx").on(t.replayOf),
		index("exports_preview_export_idx").on(t.previewExportId),
		index("exports_status_idx").on(t.status),
		// A delivery into someone else's repository states what authorized it. A
		// zip does not, because it authorizes nothing. In the database rather than
		// in the export service, for the reason every other check here is: a
		// service can be bypassed, and this one guards other people's code.
		check(
			"exports_remote_target_requires_connection",
			sql`${t.targetKind} = 'zip' or ${t.connectionId} is not null`,
		),
		// The integrity check is the three columns together or not at all.
		check(
			"exports_snapshot_all_or_none",
			sql`num_nonnulls(${t.snapshotKey}, ${t.snapshotSha256}, ${t.snapshotBytes}) in (0, 3)`,
		),
		check(
			"exports_snapshot_bytes_nonnegative",
			sql`${t.snapshotBytes} is null or ${t.snapshotBytes} >= 0`,
		),
		// Mirrors missions_sprint_n_positive. A sprint is 1-based.
		check("exports_sprint_n_positive", sql`${t.sprintN} >= 1`),
		// A row cannot be its own replay source or its own preview. Both compare
		// to NULL and pass when the column is unset, which is the common case.
		check("exports_replay_of_not_self", sql`${t.replayOf} <> ${t.id}`),
		check(
			"exports_preview_export_not_self",
			sql`${t.previewExportId} <> ${t.id}`,
		),
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

export const connectionsRelations = relations(connections, ({ one, many }) => ({
	engagement: one(engagements, {
		fields: [connections.engagementId],
		references: [engagements.id],
	}),
	exports: many(exports),
}));

export const exportsRelations = relations(exports, ({ one }) => ({
	mission: one(missions, {
		fields: [exports.missionId],
		references: [missions.id],
	}),
	connection: one(connections, {
		fields: [exports.connectionId],
		references: [connections.id],
	}),
	// Both self-references are named, because two unnamed relations to the same
	// table are ambiguous to drizzle's relational query builder.
	replaySource: one(exports, {
		fields: [exports.replayOf],
		references: [exports.id],
		relationName: "export_replay",
	}),
	previewExport: one(exports, {
		fields: [exports.previewExportId],
		references: [exports.id],
		relationName: "export_preview",
	}),
}));
