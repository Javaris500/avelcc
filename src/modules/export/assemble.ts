import { and, eq, isNull } from "drizzle-orm";

import type { Db } from "#/modules/db/client";
import {
	agentTemplateSkills,
	agentTemplates,
	clients,
	engagements,
	missions,
	playbooks,
	rosterEntries,
	rosterEntrySkills,
	skills,
} from "#/modules/db/schema";
import { byCodepoint } from "#/modules/export/render/bytes";
import type { JsonValue } from "#/modules/export/render/json";
import { canonicalJson } from "#/modules/export/render/json";
import type {
	DecisionLogEntry,
	RenderAgent,
	RenderEdge,
	RenderGateConfig,
	RenderMission,
} from "#/modules/export/render/types";

/**
 * Mission row -> RenderMission. The thing that replaces the golden fixture.
 *
 * `render()` has produced a correct package since the day it was written, and
 * every export so far rendered the SAME fixture regardless of which mission was
 * asked for, because nothing assembled its input from the database. This is
 * that assembler.
 *
 * IT CANNOT BE COMPLETE, AND THE SIGNATURE SAYS SO. Nine of RenderMission's
 * fields have no column anywhere — verified against the schema by
 * renderMapping.test.ts, which pins the count so it can only go down
 * deliberately. Rather than default them to empty and emit a package that is
 * quietly wrong, they are REQUIRED INPUTS: `Unsourced` below is exactly the set
 * with no home, so this function cannot be called without confronting them.
 *
 * That is the whole design decision. An assembler that filled them with `[]`
 * would compile, run, and deliver a mission brief claiming the work ships
 * nothing and is done when no commands pass. The type carries the gap instead.
 */

/**
 * The fields with no database column. Supplied by the caller until they have
 * one; the list shrinks as the schema grows.
 *
 * Each is a real open question rather than an oversight — see
 * renderMapping.test.ts for the question attached to each, and note that two of
 * them may never become columns: `decisionLog` is written by agents INTO the
 * client repository during the mission, and `conventions` probably belongs to
 * the engagement rather than to any one mission.
 */
export type Unsourced = {
	/** The directory structure that decided the cut. Intake.derived_cut_evidence. */
	cutEvidence: string;
	whatShips: string;
	doneCommands: string[];
	edges: RenderEdge[];
	/** Ordered, never sorted: a sequence. */
	phases: string[];
	conventions: { slug: string; body: string }[];
	contract: JsonValue;
	decisionLog: DecisionLogEntry[];
	/** Per agent slug. The "Owns" cell in MISSION.md. */
	owns: Record<string, string>;
};

/**
 * Global and versioned, never per mission.
 *
 * DECISIONS-V2:330 is explicit: "The mutation floor is not stored on Export. It
 * is global, versioned, and lives in config under source control — changing it
 * is a reviewed commit, not a per-mission field." So this is config the caller
 * passes, and a column for it would be the mistake that doc is warning about.
 */
export type AssembleConfig = {
	avelVersion: string;
	gate: RenderGateConfig;
};

export type AssembleResult =
	| { ok: true; mission: RenderMission }
	| { ok: false; reason: string };

/**
 * jsonb brief -> the markdown that becomes `mission/brief.md`.
 *
 * DETERMINISTIC, BY CODEPOINT. The column stays jsonb (ruled) while
 * RenderMission.brief is a string, so something has to bridge them — and that
 * markdown is covered by `package_sha256`. Serializing an object in whatever
 * order Postgres returns its keys would move the package hash between runs and
 * break the determinism gate, which is the single property the export path
 * rests on. Same comparator `render/json.ts` uses for canonical JSON, for the
 * same reason.
 *
 * Nested values are JSON-encoded rather than flattened. A brief's shape is
 * owned by its mission type and this function does not know it; inventing a
 * heading structure for arbitrary nesting would be this module deciding what a
 * brief looks like, which is the mission type's job.
 */
export function briefToMarkdown(brief: Record<string, unknown>): string {
	const keys = Object.keys(brief).sort(byCodepoint);
	if (keys.length === 0) return "";

	return `${keys
		.map((k) => {
			const v = brief[k];
			/**
			 * `canonicalJson`, NOT `JSON.stringify` with a replacer array.
			 *
			 * The first version passed `Object.keys(v).sort()` as a replacer to
			 * get deterministic ordering. A replacer ARRAY is an allowlist applied
			 * at EVERY DEPTH, not a top-level key order — so a nested object kept
			 * only the keys that happened to appear at depth 1, and
			 * `{items:[{name:"x"}]}` serialized as `[{}]`. Silent, total loss of
			 * nested brief content in a file handed to a client and covered by
			 * package_sha256.
			 *
			 * canonicalJson already sorts by codepoint at every depth and leaves
			 * array order alone, which is exactly what was wanted. It existed the
			 * whole time.
			 */
			const body =
				typeof v === "string" ? v : canonicalJson(v as JsonValue).trimEnd();
			return `## ${k}\n\n${body}`;
		})
		.join("\n\n")}\n`;
}

/**
 * One roster entry + its template -> the agent the renderer receives.
 *
 * PURE, and extracted for that reason. It carries two rules that decide what
 * reaches a client package, and both were previously buried inside a function
 * that needs a database, so neither had a test.
 */
export function toRenderAgent(
	entry: {
		wave: string | null;
		writablePaths: string[] | null;
		appendOnlyPaths: string[] | null;
		readonlyPaths: string[] | null;
	},
	template: {
		slug: string;
		kind: "horizontal" | "feature";
		runtime: "model" | "human" | "code";
		writablePaths: string[];
		appendOnlyPaths: string[];
		readonlyPaths: string[];
		identityMd: string;
		depthMd: string | null;
	},
	owns: Record<string, string>,
	/** Resolved by the caller: entry grants override the template's. */
	skills: { slug: string; body: string }[],
): RenderAgent {
	return {
		slug: template.slug,
		// Null wave renders as unassigned rather than as a guess.
		phase: entry.wave ?? "",
		kind: template.kind,
		runtime: template.runtime,
		/**
		 * The entry's mount OVERRIDES the template's; null inherits, [] is a
		 * real empty grant. Resolved exactly as the roster endpoint resolves it,
		 * so a rendered package and the screen cannot disagree about what an
		 * agent may write.
		 */
		writable: entry.writablePaths ?? template.writablePaths,
		appendOnly: entry.appendOnlyPaths ?? template.appendOnlyPaths,
		readonly: entry.readonlyPaths ?? template.readonlyPaths,
		owns: owns[template.slug] ?? "",
		/**
		 * MODEL CONTEXT ONLY FOR A MODEL. render.ts branches on PRESENCE — "a
		 * runtime:human agent loads no model context, so it has neither file" —
		 * and identity_md is NOT NULL, so passing it unconditionally would ship
		 * an identity.md into a client package for something that is not a
		 * language model. That is the exact case `runtime` was added to tell
		 * apart.
		 */
		...(template.runtime === "model"
			? {
					identityMd: template.identityMd,
					...(template.depthMd === null ? {} : { depthMd: template.depthMd }),
				}
			: {}),
		skills,
	};
}

export async function assembleRenderMission(
	db: Db,
	missionId: string,
	unsourced: Unsourced,
	config: AssembleConfig,
): Promise<AssembleResult> {
	const [row] = await db
		.select({
			mission: missions,
			clientName: clients.name,
		})
		.from(missions)
		.innerJoin(engagements, eq(missions.engagementId, engagements.id))
		.innerJoin(clients, eq(engagements.clientId, clients.id))
		.where(
			and(
				eq(missions.id, missionId),
				isNull(missions.deletedAt),
				isNull(engagements.deletedAt),
				isNull(clients.deletedAt),
			),
		)
		.limit(1);

	if (!row) return { ok: false, reason: `No mission with id ${missionId}.` };
	const m = row.mission;

	/**
	 * A mission with no derived cut cannot be rendered. `cut` is nullable
	 * because it is not knowable until a repository is connected, and
	 * MISSION.md renders it as a fact — "vertical (derived — ...)". Emitting a
	 * package that states a cut nobody derived is the failure `cut_source`
	 * exists to prevent, so this refuses instead.
	 */
	if (m.cut === null) {
		return {
			ok: false,
			reason: `Mission ${missionId} has no derived cut. The cut is read from the connected repository at setup; a package cannot state one that was never derived.`,
		};
	}

	/**
	 * `isNull(deletedAt)` is load-bearing, not decoration. The live-uniqueness
	 * index on mission_type is PARTIAL — `where deleted_at is null` — so once a
	 * playbook is soft-deleted, several rows can share a mission_type and an
	 * unfiltered `limit(1)` may return the dead one. Here that decides the
	 * playbook block rendered into a client package.
	 */
	const [playbook] = await db
		.select()
		.from(playbooks)
		.where(and(eq(playbooks.missionType, m.type), isNull(playbooks.deletedAt)))
		.limit(1);

	if (!playbook) {
		return {
			ok: false,
			reason: `No playbook for mission type "${m.type}". The playbook owns the waves, the gates and the deliverable; without it the package has no process to describe.`,
		};
	}

	/**
	 * SKILLS ARE RESOLVED, NOT DEFAULTED TO [].
	 *
	 * There are none in the database today, so an empty array would be the
	 * honest value right now — and hardcoding it would be a latent bug that
	 * fires the day somebody grants one: the package would silently omit a
	 * skill an agent was given, with nothing red anywhere. The join tables
	 * exist, so the resolution is written now while the answer is checkable
	 * against zero rows.
	 *
	 * A roster entry's grants OVERRIDE its template's, matching how the mount
	 * paths resolve one field over. `render()` writes each to
	 * `roster/<agent>/skills/<slug>.md` as stored prose.
	 */
	const entrySkills = await db
		.select({
			rosterEntryId: rosterEntrySkills.rosterEntryId,
			slug: skills.slug,
			body: skills.contentMd,
		})
		.from(rosterEntrySkills)
		.innerJoin(skills, eq(rosterEntrySkills.skillId, skills.id))
		// A revoked skill must not be written into the package, and the join is
		// scoped to this mission rather than fetching every grant in the system.
		.innerJoin(
			rosterEntries,
			eq(rosterEntrySkills.rosterEntryId, rosterEntries.id),
		)
		.where(
			and(eq(rosterEntries.missionId, missionId), isNull(skills.deletedAt)),
		);

	const templateSkills = await db
		.select({
			agentTemplateId: agentTemplateSkills.agentTemplateId,
			slug: skills.slug,
			body: skills.contentMd,
		})
		.from(agentTemplateSkills)
		.innerJoin(skills, eq(agentTemplateSkills.skillId, skills.id))
		.where(isNull(skills.deletedAt));

	const byEntry = new Map<string, { slug: string; body: string }[]>();
	for (const s of entrySkills) {
		const list = byEntry.get(s.rosterEntryId) ?? [];
		list.push({ slug: s.slug, body: s.body });
		byEntry.set(s.rosterEntryId, list);
	}
	const byTemplate = new Map<string, { slug: string; body: string }[]>();
	for (const s of templateSkills) {
		const list = byTemplate.get(s.agentTemplateId) ?? [];
		list.push({ slug: s.slug, body: s.body });
		byTemplate.set(s.agentTemplateId, list);
	}

	const entries = await db
		.select({ entry: rosterEntries, template: agentTemplates })
		.from(rosterEntries)
		.innerJoin(
			agentTemplates,
			eq(rosterEntries.agentTemplateId, agentTemplates.id),
		)
		// A soft-deleted template must not render an agent into the package.
		.where(
			and(
				eq(rosterEntries.missionId, missionId),
				isNull(agentTemplates.deletedAt),
			),
		);

	const agents: RenderAgent[] = entries
		.filter((r) => r.entry.active)
		.map((r) =>
			toRenderAgent(
				r.entry,
				r.template,
				unsourced.owns,
				byEntry.get(r.entry.id) ?? byTemplate.get(r.template.id) ?? [],
			),
		);

	return {
		ok: true,
		mission: {
			avelVersion: config.avelVersion,
			missionId: m.id,
			sprint: m.sprintN,
			cut: m.cut,
			cutSource: m.cutSource,
			cutEvidence: unsourced.cutEvidence,
			missionType: m.type,
			client: row.clientName,
			title: m.title ?? "",
			whatShips: unsourced.whatShips,
			doneCommands: unsourced.doneCommands,
			agents,
			edges: unsourced.edges,
			phases: unsourced.phases,
			playbook: {
				missionType: playbook.missionType,
				waves: playbook.wavesApplicable,
				gates: playbook.gates,
				deliverable: playbook.deliverable,
				requiredFields: playbook.requiredFields,
				// No column, and it may never be one: the rule is described in
				// prose and computed, so it could be a rendered string rather
				// than stored state.
				hardBlock: "",
			},
			brief: briefToMarkdown(m.brief),
			conventions: unsourced.conventions,
			contract: unsourced.contract,
			decisionLog: unsourced.decisionLog,
			gate: config.gate,
		},
	};
}
