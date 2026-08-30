import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import * as schema from "#/modules/db/schema";
import type {
	RenderAgent,
	RenderMission,
	RenderPlaybook,
} from "#/modules/export/render/types";

/**
 * WHAT render() NEEDS, AGAINST WHAT THE SCHEMA HAS.
 *
 * There is no assembler joining Neon to `RenderMission` yet, so nothing in this
 * repo connects the two. That means a column with the wrong NAME, the wrong
 * TYPE or on the wrong TABLE is invisible: tsc does not see it, the suite does
 * not see it, and a migration applies it happily. It sits there looking finished
 * until somebody writes the assembler and finds `done_commands` is text where
 * the renderer wants string[].
 *
 * This file is that missing connection, built before the columns rather than
 * after. Every field of the three render input types is classified here, and
 * the classification is checked against the real schema.
 *
 * DERIVED, NOT HARDCODED. The maps below are typed `Record<keyof RenderX, …>`,
 * so the COMPILER refuses a map that has fallen behind its type: add a field to
 * RenderMission and this file stops building until the field is classified.
 * A hardcoded list of thirteen is the thing that goes stale, and stale counts
 * have already been corrected twice on this project.
 *
 * The gap count is pinned. It is meant to go DOWN, and to be edited only by
 * someone who just closed a gap.
 */

type Mapping =
	/**
	 * A real column backs this field today. `override` names the second column
	 * when a field is resolved from a template plus a per-mission override —
	 * both are render sources, and claiming only one leaves the other looking
	 * unaccounted for.
	 */
	| {
			status: "mapped";
			table: string;
			column: string;
			override?: { table: string; column: string };
			note?: string;
	  }
	/** Assembled from other columns. No column of its own, by design. */
	| { status: "derived"; from: string; note?: string }
	/** Deliberately NOT in the database, with a source that says so. */
	| { status: "config"; note: string }
	/** No column, and the shape is a real question. Do not invent one. */
	| { status: "unmodelled"; question: string }
	/** A column exists and is the WRONG SHAPE for its only consumer. */
	| { status: "conflict"; table: string; column: string; detail: string };

/* ── RenderMission ──────────────────────────────────────────────────────── */

const MISSION: Record<keyof RenderMission, Mapping> = {
	avelVersion: {
		status: "config",
		note: "The PACKAGE FORMAT version, a property of the renderer rather than of a mission. A per-mission column would let two missions claim different format versions from one renderer, which is a lie the schema should not be able to tell. Frozen per export in exports.version_manifest, which is in Postgres and queryable per DECISIONS-V2:99.",
	},
	missionId: { status: "mapped", table: "missions", column: "id" },
	sprint: { status: "mapped", table: "missions", column: "sprint_n" },
	cut: { status: "mapped", table: "missions", column: "cut" },
	cutSource: { status: "mapped", table: "missions", column: "cut_source" },
	cutEvidence: {
		status: "unmodelled",
		question:
			"DATA-CONTRACTS-V2 describes this as Intake.derived_cut_evidence, 'the directory structure that decided it'. Intake is unbuilt and optional — a Mission can exist without one. Mission already denormalizes `cut` and `cut_source` from the same derivation, so evidence belongs beside them. Does missions gain cut_evidence, or does the renderer join through Intake?",
	},
	missionType: { status: "mapped", table: "missions", column: "type" },
	client: {
		status: "mapped",
		table: "clients",
		column: "name",
		note: "Joined via missions.engagement_id -> engagements.client_id.",
	},
	title: {
		status: "unmodelled",
		question:
			"MISSION.md renders '# Mission: CounselOS Slice 1 — Transactions' from this, and `missions` has no title column. Absent from DATA-CONTRACTS-V2's Mission block too. Is the title a stored column, or derived from the brief?",
	},
	whatShips: {
		status: "unmodelled",
		question:
			"Appears in NO document. missions.brief is jsonb 'structured, shape owned by the mission type', and playbooks.required_fields exists to declare which fields a type must supply — that machinery suggests whatShips is a BRIEF KEY validated by required_fields, not a column. But the renderer takes it as a separate top-level input alongside brief. Brief key or column?",
	},
	doneCommands: {
		status: "unmodelled",
		question:
			"Same question as whatShips, and the name misleads: the renderer wants string[], not text. If this becomes a column it is text[], and if it is a brief key it is a jsonb array validated by required_fields.",
	},
	agents: {
		status: "derived",
		from: "roster_entries joined to agent_templates, skills via roster_entry_skills",
		note: "Composite. Its per-agent fields are classified separately in AGENT below, where `owns` remains unmodelled and `phase` is an unruled shape conflict.",
	},
	edges: {
		status: "unmodelled",
		question:
			"ROSTER-V2:134 defines the concept with a From|Artifact|To table and :299 says roster.json already declares them, but no entity models edges at all. An edge joins two agents in a squad, so it most likely belongs with RosterPreset's composition — which is ITSELF undefined (roster_presets carries only a name; the squad shape is a filed contract request). Building an edges table before the preset shape exists builds the leaf before the trunk.",
	},
	phases: {
		status: "unmodelled",
		question:
			"Likely derived, but from which source is unresolved. playbooks.waves_applicable is built and ordered; roster_entries.waves is per-agent. Is `phases` the playbook's applicable waves, or the waves this mission's roster actually occupies? Those differ whenever a mission does not staff every wave, and MISSION.md's 'Who is running' table implies the second.",
	},
	playbook: {
		status: "derived",
		from: "playbooks",
		note: "Composite; see PLAYBOOK below, where hardBlock is unmodelled.",
	},
	brief: {
		status: "conflict",
		table: "missions",
		column: "brief",
		detail:
			"THE COLUMN EXISTS AND IS THE WRONG TYPE FOR ITS ONLY CONSUMER. missions.brief is jsonb ('structured, shape owned by the mission type'); RenderMission.brief is `string` — 'Stored prose. mission/brief.md.' Both cannot be right. This is not a missing column that a migration adds; it is a built column that will fail the moment an assembler reads it. RULED 2026-08-29: THE COLUMN STAYS jsonb AND THE RENDERER ADAPTS. Two consequences land in the assembler, not here. (1) The jsonb-to-markdown step MUST BE DETERMINISTIC: that markdown is covered by package_sha256, so serializing keys in whatever order Postgres returns them would move the package hash between runs and break the determinism gate the whole export path rests on. render/json.ts already solves this for canonical JSON and sorts by codepoint; the brief renderer has to sort the same way. (2) playbooks.required_fields declares which keys a mission type must supply, which is almost certainly how whatShips and doneCommands are meant to work too — as validated brief keys rather than columns. Both stay unbuilt.",
	},
	conventions: {
		status: "unmodelled",
		question:
			"OWNERSHIP, not shape. ROSTER-V2:175 has the foundations role writing conventions and reviewing adherence — they are the client's standards, reused across missions. On Mission every mission carries its own copy and they drift; on Engagement or Client they are shared. Also adds a seventeenth core entity outside DATA-CONTRACTS-V2's sixteen, and whether a mission renders ALL of its engagement's conventions or a selected subset is undefined.",
	},
	contract: {
		status: "unmodelled",
		question:
			"'The client's frozen phase-1 surface' — a DIFFERENT artifact from exports.contract_sha256, which hashes AVEL's own contract. DECISIONS-V2:340 draws that line explicitly: 'different artifacts in different repositories'. Stored as jsonb, fetched from the client's repo through the gateway at render time, or uploaded per mission? Reaching for jsonb here would be storing the question rather than the answer.",
	},
	decisionLog: {
		status: "unmodelled",
		question:
			"Is this AVEL database state at all? GOLDEN-FIXTURE:179 puts .avel/process/log/decision-log.md in append_only, meaning AGENTS WRITE IT IN THE CLIENT REPO during the mission. If so there is no table, the renderer scaffolds it empty, and RenderMission.decisionLog is [] for a fresh mission. Unresolved against ActivityLog, a canonical entity that is append-only and unbuilt.",
	},
	gate: {
		status: "config",
		note: "DATA-CONTRACTS-V2:330 rules this OUT of the database in terms: 'The mutation floor is not stored on Export. It is global, versioned, and lives in config under source control — changing it is a reviewed commit, not a per-mission field.' mutationFloor and coverageDeltaMin must NOT become columns. `configPreimage` is a separate open question — types.ts calls it 'the INVENTED part and the loudest thing in this file', because GOLDEN-FIXTURE requires gate.config_sha256 while placing the config outside the package, so there are no bytes to hash.",
	},
};

/* ── RenderAgent ────────────────────────────────────────────────────────── */

const AGENT: Record<keyof RenderAgent, Mapping> = {
	slug: { status: "mapped", table: "agent_templates", column: "slug" },
	phase: {
		status: "conflict",
		table: "roster_entries",
		column: "waves",
		detail:
			"SHAPE MISMATCH, flagged by types.ts itself: 'A scalar here; RosterEntry models waves as an array.' An agent active in waves ['B','C'] has no single phase, and MISSION.md's table has one Phase cell per agent. Either the renderer collapses (by what rule?) or the roster is wrong to allow multiple.",
	},
	kind: { status: "mapped", table: "agent_templates", column: "kind" },
	runtime: {
		status: "mapped",
		table: "agent_templates",
		column: "runtime",
		note: "pgEnum agent_runtime, NOT NULL DEFAULT 'model'. The vocabulary was given by render/types.ts rather than invented, which is what separated this from pr_status.",
	},
	writable: {
		status: "mapped",
		table: "agent_templates",
		column: "writable_paths",
		override: { table: "roster_entries", column: "writable_paths" },
		note: "Resolved from the template, overridden per mission. Null on the entry means 'use the template's'; [] means 'may write nothing', which is a different instruction. Whatever is ruled for appendOnly and readonly should follow this exact pattern, because it is the one already in the schema.",
	},
	appendOnly: {
		status: "mapped",
		table: "agent_templates",
		column: "append_only_paths",
		override: { table: "roster_entries", column: "append_only_paths" },
		note: "GOLDEN-FIXTURE:221 — 'the Mission 002 finding encoded'. Same template-plus-override shape as writable_paths, and for the same reason: null on the entry inherits, {} means genuinely none, and collapsing those two removes the only way to say 'this agent may append nowhere on this mission'.",
	},
	readonly: {
		status: "mapped",
		table: "agent_templates",
		column: "readonly_paths",
		override: { table: "roster_entries", column: "readonly_paths" },
		note: "DECLARATIVE, not enforced — the same caveat skills.type='capability' carries, since nothing restricts a read at runtime. The fixture uses ['**'] for a quality agent, so 'everything' is a real value.",
	},
	owns: {
		status: "unmodelled",
		question:
			"'The Owns cell in MISSION.md. Prose, one line.' No column on agent_templates or roster_entries. Probably per-mission (what this agent owns on THIS mission) rather than per-template, but that is exactly the horizontal/feature distinction and worth ruling rather than assuming.",
	},
	identityMd: {
		status: "mapped",
		table: "agent_templates",
		column: "identity_md",
	},
	depthMd: { status: "mapped", table: "agent_templates", column: "depth_md" },
	skills: {
		status: "derived",
		from: "roster_entry_skills joined to skills.content_md",
		note: "The renderer wants { slug, body }; skills carries slug and content_md as stored prose, which is the same thing.",
	},
};

/* ── RenderPlaybook ─────────────────────────────────────────────────────── */

const PLAYBOOK: Record<keyof RenderPlaybook, Mapping> = {
	missionType: { status: "mapped", table: "playbooks", column: "mission_type" },
	waves: { status: "mapped", table: "playbooks", column: "waves_applicable" },
	gates: { status: "mapped", table: "playbooks", column: "gates" },
	deliverable: { status: "mapped", table: "playbooks", column: "deliverable" },
	requiredFields: {
		status: "mapped",
		table: "playbooks",
		column: "required_fields",
	},
	hardBlock: {
		status: "unmodelled",
		question:
			"playbooks has no hard_block column and DATA-CONTRACTS-V2's Playbook block does not list one. The rule itself is described in prose — 'at least one active agent in the earliest wave the playbook declares' — and computeCoherence computes it. So this may be a RENDERED STRING of a computed rule rather than stored text, in which case there is no column.",
	},
};

/* ── the checks ─────────────────────────────────────────────────────────── */

const ALL: Array<[string, Record<string, Mapping>]> = [
	["RenderMission", MISSION],
	["RenderAgent", AGENT],
	["RenderPlaybook", PLAYBOOK],
];

/** "table.column" for every column the schema module declares. */
function schemaColumns(): Set<string> {
	const out = new Set<string>();
	for (const value of Object.values(schema)) {
		if (!is(value, PgTable)) continue;
		const config = getTableConfig(value);
		for (const column of config.columns) {
			out.add(`${config.name}.${column.name}`);
		}
	}
	return out;
}

function entries(): Array<[string, string, Mapping]> {
	return ALL.flatMap(([type, map]) =>
		Object.entries(map).map(
			([field, mapping]) => [type, field, mapping] as [string, string, Mapping],
		),
	);
}

describe("every render field is classified against the schema", () => {
	it("points every mapped field at a column that exists", () => {
		// The check that catches a wrong name, a wrong table, or a column someone
		// renamed out from under this map. No database needed: it reads the
		// schema module, which is what drizzle-kit generates from.
		const columns = schemaColumns();
		const broken: string[] = [];
		for (const [type, field, m] of entries()) {
			if (m.status !== "mapped" && m.status !== "conflict") continue;
			// Both halves, not just the primary. A typo in an override name was
			// caught only by the reverse check, which is scoped to four tables — so
			// an override naming a table outside that set would have slipped
			// through entirely. Found by mutating this file rather than by reading.
			const refs = [`${m.table}.${m.column}`];
			if (m.status === "mapped" && m.override) {
				refs.push(`${m.override.table}.${m.override.column}`);
			}
			for (const ref of refs) {
				if (!columns.has(ref)) broken.push(`${type}.${field} -> ${ref}`);
			}
		}

		expect(
			broken,
			"These render fields claim a column that does not exist in schema.ts. " +
				"Either the column was renamed and this map went stale, or the mapping " +
				"was wrong when it was written.",
		).toEqual([]);
	});

	it("leaves no column of a render-source table unaccounted for", () => {
		// The REVERSE direction: adding a column without mapping it should fail,
		// otherwise a column drifts in that the renderer never learns about.
		//
		// Scoped to the tables the renderer actually draws from, and ignoring
		// infrastructure (identity, timestamps, soft delete, FK plumbing) plus
		// columns with a documented non-render purpose.
		const SOURCE_TABLES = new Set([
			"missions",
			"playbooks",
			"roster_entries",
			"agent_templates",
		]);
		const IGNORED = new Set([
			// infrastructure
			"id",
			"created_at",
			"updated_at",
			"deleted_at",
			// FK plumbing, resolved by joins rather than rendered
			"engagement_id",
			"mission_id",
			"agent_template_id",
			"default_preset_id",
			// documented non-render purposes
			"status", // mission lifecycle, not rendered
			"repo_url", // "a DEFAULT, not the binding destination"
			"spend_ceiling_usd", // cost governance, read by nothing today
			"cut_rationale", // override rationale; distinct from cut_evidence
			"version", // playbook counter
			"name", // agent_templates.name / playbooks.name
			"team", // roster grouping, not a render field
			"active", // whether the agent is on the mission, filters rather than renders
			"monitor_priority", // wezterm pane priority
			"customized_md", // per-mission agent prose
			"wave_defaults", // template default for roster_entries.waves
		]);

		const claimed = new Set<string>();
		for (const [, , m] of entries()) {
			if (m.status !== "mapped" && m.status !== "conflict") continue;
			claimed.add(`${m.table}.${m.column}`);
			if (m.status === "mapped" && m.override) {
				claimed.add(`${m.override.table}.${m.override.column}`);
			}
		}

		const unaccounted: string[] = [];
		for (const value of Object.values(schema)) {
			if (!is(value, PgTable)) continue;
			const config = getTableConfig(value);
			if (!SOURCE_TABLES.has(config.name)) continue;
			for (const column of config.columns) {
				const ref = `${config.name}.${column.name}`;
				if (IGNORED.has(column.name)) continue;
				if (!claimed.has(ref)) unaccounted.push(ref);
			}
		}

		expect(
			unaccounted,
			"These columns sit on a table the renderer draws from and no render " +
				"field claims them. Either map the field, or add the column to IGNORED " +
				"with the reason it is not rendered.",
		).toEqual([]);
	});

	/**
	 * THE GAP, AS A NUMBER.
	 *
	 * Pinned so it cannot drift quietly in either direction. It should go DOWN,
	 * one ruling at a time, and the person who closes a gap edits this line in
	 * the same commit that adds the column. A count that moves on its own means
	 * a render field appeared or vanished without anyone classifying it.
	 */
	it("has exactly the known gaps, no more and no fewer", () => {
		const unmodelled = entries()
			.filter(([, , m]) => m.status === "unmodelled")
			.map(([type, field]) => `${type}.${field}`);
		const conflicts = entries()
			.filter(([, , m]) => m.status === "conflict")
			.map(([type, field]) => `${type}.${field}`);

		expect(unmodelled.sort()).toEqual([
			"RenderAgent.owns",
			"RenderMission.contract",
			"RenderMission.conventions",
			"RenderMission.cutEvidence",
			"RenderMission.decisionLog",
			"RenderMission.doneCommands",
			"RenderMission.edges",
			"RenderMission.phases",
			"RenderMission.title",
			"RenderMission.whatShips",
			"RenderPlaybook.hardBlock",
		]);

		// Not gaps — columns that exist and are the wrong shape. A migration does
		// not fix these; a ruling does.
		expect(conflicts.sort()).toEqual([
			"RenderAgent.phase",
			"RenderMission.brief",
		]);
	});

	it("states a question for every unmodelled field", () => {
		// A gap with no question recorded is a gap someone will fill by guessing.
		for (const [type, field, m] of entries()) {
			if (m.status !== "unmodelled") continue;
			expect(
				m.question.length,
				`${type}.${field} is unmodelled with no question stated`,
			).toBeGreaterThan(80);
		}
	});
});
