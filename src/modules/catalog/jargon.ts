/**
 * ONE PLAIN SENTENCE PER TERM, WRITTEN ONCE.
 *
 * UI-PLAN section 12 rule 5: "Name the jargon once, where it is first met.
 * `roster entry`, `playbook`, `preset` and `cut` each need one plain sentence
 * at first encounter, on the section header, rather than in a glossary nobody
 * opens."
 *
 * The catalog is the densest jargon in the product. An operator lands on
 * `/catalog/skills` and meets skill, source, agent template, runtime, roster
 * entry and package inside one viewport. So the sentences live here, in one
 * file, for the same reason the error map lives in one file: a definition
 * restated on three screens drifts, and CLAUDE.md records that happening three
 * times on this project already.
 *
 * RULES FOR EDITING THIS FILE.
 *
 * - One sentence. If it needs two, the concept is not being explained, it is
 *   being documented, and documentation goes in `docs/`.
 * - No jargon inside a definition. `TERM.roster` may not use the word
 *   "template". This is checked by reading it, not by a tool.
 * - Say what it IS and what it is FOR. "A skill is a file" is true and useless.
 * - Nothing here claims a capability the product does not have. `capability`
 *   below says "names" rather than "grants", because schema.ts:64 is explicit
 *   that nothing enforces it and "a badge implying enforcement would be the
 *   product lying about itself".
 */

export const TERM = {
	/** The `/catalog/skills` header. */
	skill:
		"A skill is a piece of know-how you attach to an agent so it carries that know-how into every mission it works on.",

	/** Rendered beside the `knowledge` filter and on a knowledge row's detail. */
	knowledgeSkill:
		"Knowledge is written guidance. It goes into the agent's instructions and shapes how the work is done.",

	/**
	 * NAMES, NOT GRANTS. schema.ts:64 requires the UI to label this declarative.
	 * The sentence has to carry that without using the word "declarative", which
	 * is itself jargon.
	 */
	capabilitySkill:
		"A capability names a tool the agent is expected to use. Naming it does not switch it on, and nothing here checks that the tool is available.",

	/** The `/catalog/sources` header. */
	source:
		"A source is where a skill came from. Every skill in the catalog was imported from one, and the catalog starts empty.",

	/** The `/catalog/agents` header. */
	agentTemplate:
		"An agent template is a reusable description of one worker: what it knows, what it may change, and what runs it. A mission copies templates in to build its team.",

	/**
	 * The concept a non-technical operator is least likely to have a model for,
	 * and the one that caused a shipped bug. Worth its own sentence on the
	 * runtime column header rather than a tooltip.
	 */
	runtime:
		"Runtime is what actually does the work: an AI model, a person, or a script. Only an AI model can be given written context, so the other two are described here but never sent any.",

	/** Used wherever a template's `kind` is shown. */
	horizontalAgent:
		"A horizontal agent belongs to one band of the work, like frontend or QA, and can be used by any client.",

	feature:
		"A feature agent belongs to one client's engagement and owns a single slice of it from top to bottom.",

	/** Used on a skill's attachment list. */
	rosterEntry:
		"A roster entry is one agent on one mission's team. It is a copy, so changing the template here does not change a mission already running.",

	/** Used in the revoked banner and the revoked filter. */
	revoked:
		"Revoked means the skill was withdrawn from the catalog. It stays listed because work already delivered still refers to it.",

	/** Used on the path grant lists. */
	writablePaths:
		"Writable paths are the files this agent is allowed to change. Anything it changes outside them fails the delivery check.",

	appendOnlyPaths:
		"Append-only paths are files this agent may add its own lines to and may never remove or reorder anyone else's.",

	readonlyPaths:
		"Read-only paths are files this agent is expected to read and not change. Nothing stops it from reading them, so this is a description rather than a lock.",

	/** Used on `waveDefaults`. */
	wave: "A wave is the phase of a mission an agent is scheduled into. Phases run in order for everyone.",
} as const;

export type Term = keyof typeof TERM;
