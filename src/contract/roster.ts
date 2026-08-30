import { initContract } from "@ts-rest/core";
import { z } from "zod";

import { crudErrorEnvelope, success } from "#/contract/shared/envelope";

const c = initContract();

export const rosterEntrySchema = z.object({
	id: z.string().uuid(),
	missionId: z.string().uuid(),
	agentTemplateId: z.string().uuid(),
	active: z.boolean(),
	/**
	 * A SCALAR, and nullable. Was `waves: string[]` and drifted behind the schema.
	 *
	 * ROSTER-V2:33 makes phases global and sequential — "Team or feature is a
	 * label, not a schedule" — and an agent spanning waves reintroduces the
	 * ordering contradiction that global phases exist to prevent. Every consumer
	 * is already singular: MISSION.md renders one Phase cell per agent and
	 * roster.json emits `phase`. Null means not yet assigned, which is a real
	 * state and not a missing value.
	 */
	wave: z.string().nullable(),
	monitorPriority: z.number().int().nullable(),
	customizedMd: z.string().nullable(),
	/**
	 * THE THREE MOUNT KINDS, and they are not three shades of one thing.
	 *
	 * `writable` is edit freely. `appendOnly` is add your own and never remove or
	 * reorder anyone else's — the distinction a mount check enforces by failing
	 * on any REMOVED line, and the reason a feature agent can register its own
	 * module without being able to unregister another's. `readonly` is read but
	 * never write.
	 *
	 * All three are nullable OVERRIDES of the template's. Null means inherit;
	 * `[]` means genuinely none. Collapsing those two would lose the difference
	 * between an agent nobody configured and one configured to have no grant.
	 */
	writablePaths: z.array(z.string()).nullable(),
	appendOnlyPaths: z.array(z.string()).nullable(),
	readonlyPaths: z.array(z.string()).nullable(),
	skillIds: z.array(z.string().uuid()),
});

/**
 * One agent as the roster screen needs it: the entry joined to its template,
 * with the override rule already applied.
 *
 * THE SERVER RESOLVES THE OVERRIDE, not the screen. Each path set is a nullable
 * override of the template's, and having every consumer re-derive
 * `entry.paths ?? template.paths` is how two screens end up disagreeing about
 * what an agent may write. Both layers are returned so a UI can show that an
 * override happened; `effective` is what actually applies.
 */
export const rosterAgentSchema = z.object({
	entryId: z.string().uuid(),
	agentTemplateId: z.string().uuid(),
	slug: z.string(),
	name: z.string(),
	kind: z.enum(["horizontal", "feature"]),
	/**
	 * What EXECUTES the agent, as distinct from `kind`, which describes the cut.
	 * A non-model agent is real, not a placeholder — a roster can hold a role
	 * carried by a person or by a script, and a screen that assumes every agent
	 * is a language model misrepresents the roster on its first real render.
	 */
	runtime: z.enum(["model", "human", "code"]),
	active: z.boolean(),
	wave: z.string().nullable(),
	monitorPriority: z.number().int().nullable(),
	effective: z.object({
		writablePaths: z.array(z.string()),
		appendOnlyPaths: z.array(z.string()),
		readonlyPaths: z.array(z.string()),
	}),
	/** True where the entry overrode the template rather than inheriting it. */
	overridden: z.object({
		writablePaths: z.boolean(),
		appendOnlyPaths: z.boolean(),
		readonlyPaths: z.boolean(),
	}),
});

/**
 * CLOSED 2026-08-29, and kept because what it got wrong is the useful part.
 *
 * The gap below was real when written and is now filled on both layers:
 * agent_templates carries `runtime`, `append_only_paths` and `readonly_paths`
 * (migration 0011), and roster_entries carries nullable overrides for the two
 * path sets. `rosterEntrySchema` above declares them.
 *
 * The note said "two sessions are hitting this from opposite directions — the
 * renderer needs them to emit, the schema needs them to store." A third arrived
 * later and settled it: the real client roster this project is being built for
 * enforces exactly these three boundaries in practice, as may_edit /
 * may_append_only / must_not_touch. The shapes were derived from the renderer
 * before anyone had read that, and they matched.
 *
 * The original text follows.
 *
 * OPEN CONTRACT GAP, recorded rather than filled.
 *
 * GOLDEN-FIXTURE's roster.json carries `append_only`, `readonly` and `runtime`
 * for every agent, and calls append_only "the Mission 002 finding encoded" —
 * the composition root belongs to no feature and every feature must register in
 * it, so omitting it means the first agent cannot load its own module.
 *
 * No entity in DATA-CONTRACTS-V2 declares any of the three. They are absent
 * here for the same reason they are absent from the schema: adding them would
 * invent a shape the contract does not define, which is the one thing the
 * contract rule forbids. Two sessions are hitting this from opposite directions
 * — the renderer needs them to emit, the schema needs them to store.
 *
 * AND THE GAP IS TWO LAYERS DEEP. AgentTemplate declares none of the three, and
 * RosterEntry — which carries `writablePaths` as a per-mission override — has no
 * corresponding override for the other three. So if append_only really is "the
 * Mission 002 finding encoded", a mission cannot currently vary it. Found by
 * session 2 building the table.
 */

export const coherenceBlock = z.object({
	code: z.literal("no_agents_in_first_wave"),
	reason: z.string(),
	wave: z.string(),
});

export const coherenceResult = z.object({
	block: coherenceBlock.optional(),
	warnings: z.array(
		z.object({ code: z.string(), reason: z.string() }).passthrough(),
	),
});

export const rosterContract = c.router({
	/**
	 * The loadout screen's read. Coherence is NOT returned here: computeCoherence
	 * is pure and lives in contract/shared, so the client runs the same
	 * implementation locally for instant feedback and the server runs it again at
	 * gate time for permission. One implementation, zero round trips, no drift —
	 * and a client that lies about coherence still cannot ship.
	 */
	getWithRoster: {
		method: "GET",
		path: "/missions/:missionId/roster",
		responses: {
			200: success(z.object({ entries: z.array(rosterEntrySchema) })),
			404: crudErrorEnvelope,
		},
	},

	upsert: {
		method: "PUT",
		path: "/missions/:missionId/roster",
		body: z.object({ entries: z.array(rosterEntrySchema.omit({ id: true })) }),
		responses: {
			200: success(z.object({ entries: z.array(rosterEntrySchema) })),
			422: crudErrorEnvelope, // PRECONDITION_FAILED — the hard block
		},
	},

	/**
	 * MATERIALIZES. The name has to make it obvious that applying is a write:
	 * it copies the preset into RosterEntries, copy-then-edit, and the preset
	 * holds no mission state afterward.
	 */
	applyPreset: {
		method: "POST",
		path: "/missions/:missionId/roster/apply-preset",
		body: z.object({ presetId: z.string().uuid() }),
		responses: {
			200: success(z.object({ entries: z.array(rosterEntrySchema) })),
			404: crudErrorEnvelope,
			422: crudErrorEnvelope,
		},
	},
});
