import type { JsonValue } from "#/modules/export/render/json";

/**
 * THE INPUT SHAPES render() REQUIRES.
 *
 * These are CONTRACT REQUESTS, not a schema. They live here because
 * src/modules/db has clients, engagements, skill_sources, skills and
 * agent_templates and nothing else — no Mission, no RosterEntry, no Playbook.
 * Defining them here keeps the renderer buildable and testable without
 * inventing columns in someone else's mount.
 *
 * Every field below is a field the renderer actually reaches for, which is the
 * point GOLDEN-FIXTURE.md makes: producing the output once is how you discover
 * the data model, and a field nothing touches was speculation.
 *
 * Three of these have no home in any entity today and are the sharpest asks:
 * `appendOnly`, `readonly` and `runtime` on an agent. AgentTemplate carries
 * `writable_paths` alone.
 */

export type Cut = "horizontal" | "vertical";
export type CutSource = "derived" | "overridden";
export type AgentKind = "horizontal" | "feature";

/** What executes an agent, as distinct from `kind`, which describes the cut. */
export type AgentRuntime = "model" | "human" | "code";

export type GatePolicy = "mandatory" | "warn";

export type RenderAgent = {
	slug: string;
	/** Wave label. A scalar here; RosterEntry models `waves` as an array. */
	phase: string;
	kind: AgentKind;
	runtime: AgentRuntime;
	writable: string[];
	/** UNMODELLED. The composition-root finding, with nowhere to live. */
	appendOnly: string[];
	/** UNMODELLED. */
	readonly: string[];
	/** The "Owns" cell in MISSION.md. Prose, one line. */
	owns: string;
	/** Model context. Absent when runtime is not "model". */
	identityMd?: string;
	depthMd?: string;
	/**
	 * Granted skills, one file each under `roster/<slug>/skills/`. Stored prose,
	 * frontmatter and all, exactly like identityMd — the body IS the data, not
	 * something the renderer derives from the frontmatter fields. Empty for an
	 * agent granted none.
	 */
	skills: { slug: string; body: string }[];
};

/** A declared artifact handoff. No entity models edges at all. */
export type RenderEdge = {
	from: string;
	artifact: string;
	to: string[];
};

export type RenderPlaybook = {
	missionType: string;
	/** Ordered. A sequence, never sorted. */
	waves: string[];
	gates: { gate: string; policy: GatePolicy }[];
	deliverable: string;
	requiredFields: string[];
	hardBlock: string;
};

export type DecisionLogEntry = {
	sequence: string;
	agent: string;
	sprint: number;
	phase: string;
	decision: string;
	context: string;
	alternatives: string;
	consequence: string;
	/** An earlier sequence number, or "none". Never a rewrite. */
	supersedes: string;
};

/**
 * The gate bar this mission shipped against.
 *
 * `configPreimage` is the INVENTED part and the loudest thing in this file.
 * GOLDEN-FIXTURE requires manifest.gate.config_sha256 and simultaneously places
 * the versioned gate config outside the package, so there are no bytes to hash.
 * The renderer hashes this string. Any other value produces a different
 * manifest, so it is an input rather than a constant.
 */
export type RenderGateConfig = {
	mutationFloor: number;
	coverageDeltaMin: number;
	configPreimage: string;
};

export type RenderMission = {
	avelVersion: string;
	/** A stable input. Never generated at render time. */
	missionId: string;
	sprint: number;
	cut: Cut;
	cutSource: CutSource;
	/** Renders as "vertical (derived — feature-organized codebase)". */
	cutEvidence: string;
	missionType: string;
	client: string;
	title: string;
	whatShips: string;
	doneCommands: string[];
	agents: RenderAgent[];
	edges: RenderEdge[];
	phases: string[];
	playbook: RenderPlaybook;
	/** Stored prose. mission/brief.md. */
	brief: string;
	/** Stored prose, one file each under conventions/. */
	conventions: { slug: string; body: string }[];
	/** The client's frozen phase-1 surface, serialized canonically. */
	contract: JsonValue;
	decisionLog: DecisionLogEntry[];
	gate: RenderGateConfig;
};
