import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
	type CoherenceAgent,
	computeCoherence,
} from "#/contract/shared/coherence";

/**
 * These run against the REAL golden fixture, not a mock.
 *
 * That coupling is deliberate. Session 3 hand-wrote the fixture from
 * GOLDEN-FIXTURE.md without seeing this function; this function was written
 * from DATA-CONTRACTS-V2.md without seeing the fixture. If they disagree, the
 * disagreement is a defect in the spec rather than in either of them, and it
 * should fail here rather than be discovered by a client.
 */
const ROSTER = "fixtures/golden/slice-1/.avel/roster/roster.json";

type RosterFile = {
	phases: string[];
	agents: Array<{
		slug: string;
		phase: string;
		kind: "feature" | "horizontal";
		runtime?: "model" | "human" | "code";
		writable: string[];
	}>;
};

function loadAgents(): { agents: CoherenceAgent[]; phases: string[] } {
	const roster: RosterFile = JSON.parse(readFileSync(ROSTER, "utf8"));
	return {
		phases: roster.phases,
		agents: roster.agents.map((a) => ({
			slug: a.slug,
			wave: a.phase,
			kind: a.kind,
			runtime: a.runtime ?? "model",
			active: true,
			writable: a.writable,
		})),
	};
}

describe("computeCoherence against the golden fixture", () => {
	it("passes the hard block under the fixture's own wave vocabulary", () => {
		const { agents, phases } = loadAgents();
		const result = computeCoherence(agents, { waves: phases });
		expect(result.block).toBeUndefined();
	});

	it("blocks under the DATA-CONTRACTS wave vocabulary — D2 is unresolved", () => {
		// DATA-CONTRACTS-V2.md:391 says full-build's earliest wave "resolves to
		// phase1". No agent in this roster is in a wave named phase1, so the same
		// roster blocks. This test documents that D1 is closed by D2's resolution
		// and not independently. It is not a bug in this function.
		const { agents } = loadAgents();
		const result = computeCoherence(agents, { waves: ["phase1", "phase2"] });
		expect(result.block?.code).toBe("no_agents_in_first_wave");
		expect(result.block?.wave).toBe("phase1");
	});

	it("detects the nemi/transactions writable overlap", () => {
		// Found by session 3 by hand. This is the mechanical form of that finding.
		// CLAUDE.md claims "Testers never modify code under test. Enforced by the
		// mount, not by discipline." In the canonical fixture that is false.
		const { agents, phases } = loadAgents();
		const result = computeCoherence(agents, { waves: phases });
		const overlap = result.warnings.filter(
			(w) => w.code === "writable_overlap",
		);
		expect(overlap.length).toBeGreaterThan(0);
		const first = overlap[0];
		if (first?.code !== "writable_overlap")
			throw new Error("expected a writable_overlap");
		expect(first.agents).toEqual(["nemi", "transactions"]);
		// The witness is pinned, not merely non-empty: this exact path is writable
		// by the tester and by the agent whose code it tests.
		expect(first.witness).toBe("apps/web/src/app/transactions/w.test.tsx");
	});

	it("reports the operator as the agent satisfying the block", () => {
		const { agents, phases } = loadAgents();
		const earliest = agents.filter((a) => a.wave === phases[0]);
		expect(earliest.map((a) => a.slug)).toEqual(["operator"]);
		expect(earliest[0]?.runtime).toBe("human");
	});
});

describe("computeCoherence unit behaviour", () => {
	const agent = (over: Partial<CoherenceAgent> = {}): CoherenceAgent => ({
		slug: "a",
		wave: "A",
		kind: "feature",
		runtime: "model",
		active: true,
		writable: ["src/a/**"],
		...over,
	});

	it("is vocabulary-agnostic — waves[0] is whatever the playbook declares", () => {
		const a = [agent({ wave: "phase1" })];
		expect(
			computeCoherence(a, { waves: ["phase1", "phase2"] }).block,
		).toBeUndefined();
		expect(computeCoherence(a, { waves: ["A", "B"] }).block?.wave).toBe("A");
	});

	it("ignores inactive agents when deciding the block", () => {
		const a = [agent({ active: false })];
		expect(computeCoherence(a, { waves: ["A"] }).block?.code).toBe(
			"no_agents_in_first_wave",
		);
	});

	it("blocks when the playbook declares no waves at all", () => {
		expect(computeCoherence([agent()], { waves: [] }).block?.code).toBe(
			"no_agents_in_first_wave",
		);
	});

	it("never fabricates an overlap for genuinely disjoint sets", () => {
		const a = [
			agent({
				slug: "h",
				kind: "horizontal",
				writable: ["packages/shared/**"],
			}),
			agent({
				slug: "f",
				kind: "feature",
				writable: ["apps/api/src/modules/tx/**"],
			}),
		];
		const w = computeCoherence(a, { waves: ["A"] }).warnings;
		expect(w.filter((x) => x.code === "writable_overlap")).toHaveLength(0);
	});

	it("is pure — same input, same output, input unmutated", () => {
		const a = [agent()];
		const snapshot = JSON.stringify(a);
		const first = computeCoherence(a, { waves: ["A"] });
		const second = computeCoherence(a, { waves: ["A"] });
		expect(first).toEqual(second);
		expect(JSON.stringify(a)).toBe(snapshot);
	});
});
