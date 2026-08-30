import { describe, expect, it } from "vitest";

import {
	type DeclaredGate,
	evaluateGates,
	type GateOverride,
	type Measurement,
	sourceSummary,
} from "#/modules/export/verify/gates";

const DECLARED: DeclaredGate[] = [
	{ gate: "tests", policy: "mandatory" },
	{ gate: "coverage", policy: "warn" },
	{ gate: "mutation", policy: "mandatory" },
];

const override = (over: Partial<GateOverride> = {}): GateOverride => ({
	gate: "tests",
	rationale: "Flaky on CI, verified locally.",
	overriddenBy: "operator@example.com",
	overriddenAt: "2026-08-29T12:00:00.000Z",
	...over,
});

const measured = (over: Partial<Measurement> = {}): Measurement => ({
	gate: "tests",
	state: "pass",
	source: "mechanical",
	...over,
});

describe("evaluateGates", () => {
	/**
	 * THE DEFAULT THAT MATTERS. Nothing runs tests or coverage in this project
	 * yet, so almost every gate lands here. An unmeasured gate must be `pending`
	 * with no source — never `pass`, which would manufacture the confidence the
	 * product exists to refuse, and never `attested`, which would claim a person
	 * signed for something nobody was asked about.
	 */
	it("leaves an unmeasured gate pending, with no source", () => {
		const v = evaluateGates(DECLARED, [], null);
		expect(v.gates).toHaveLength(3);
		for (const g of v.gates) {
			expect(g.state).toBe("pending");
			expect(g.source).toBeNull();
		}
	});

	it("blocks on mandatory gates that are not passing", () => {
		const v = evaluateGates(DECLARED, [], null);
		// coverage is `warn` policy, so it never blocks however it lands.
		expect(v.blocking).toEqual(["tests", "mutation"]);
	});

	it("does not block on a warn gate, even when it blocks", () => {
		const v = evaluateGates(
			DECLARED,
			[measured({ gate: "coverage", state: "block" })],
			null,
		);
		expect(v.blocking).not.toContain("coverage");
	});

	it("carries a measurement's state and source through", () => {
		const v = evaluateGates(
			DECLARED,
			[measured({ gate: "tests", state: "pass", source: "attested" })],
			null,
		);
		const tests = v.gates.find((g) => g.gate === "tests");
		expect(tests?.state).toBe("pass");
		expect(tests?.source).toBe("attested");
		expect(v.blocking).toEqual(["mutation"]);
	});

	/**
	 * THE DISTINCTION THE MODULE EXISTS FOR. A mechanical pass and an attested
	 * pass are both `pass` and must never be collapsed — "an attestation
	 * rendered identically to a mechanical pass is the failure mode this project
	 * exists to prevent".
	 */
	it("keeps an attested pass distinguishable from a mechanical one", () => {
		const mech = evaluateGates(
			DECLARED,
			[measured({ source: "mechanical" })],
			null,
		);
		const att = evaluateGates(
			DECLARED,
			[measured({ source: "attested" })],
			null,
		);

		const m = mech.gates.find((g) => g.gate === "tests");
		const a = att.gates.find((g) => g.gate === "tests");
		expect(m?.state).toBe(a?.state);
		expect(m?.source).not.toBe(a?.source);

		expect(sourceSummary(mech)).toEqual({
			mechanical: 1,
			attested: 0,
			undecided: 2,
		});
		expect(sourceSummary(att)).toEqual({
			mechanical: 0,
			attested: 1,
			undecided: 2,
		});
	});
});

describe("evaluateGates — overrides", () => {
	it("unblocks a mandatory gate the operator accepted", () => {
		const v = evaluateGates(
			DECLARED,
			[measured({ gate: "tests", state: "block" })],
			override({ gate: "tests" }),
		);
		expect(v.overridden).toEqual(["tests"]);
		expect(v.blocking).toEqual(["mutation"]);
	});

	/**
	 * THE LOAD-BEARING ONE. An override changes whether delivery proceeds, not
	 * what was true. Rewriting the gate to `pass` would destroy the record of
	 * what the operator actually accepted, and the rationale would then sit
	 * beside a gate that reads as having succeeded.
	 */
	it("does not rewrite the overridden gate's state", () => {
		const v = evaluateGates(
			DECLARED,
			[measured({ gate: "tests", state: "block" })],
			override({ gate: "tests" }),
		);
		const tests = v.gates.find((g) => g.gate === "tests");
		expect(tests?.state).toBe("block");
		expect(tests?.source).toBe("mechanical");
	});

	/**
	 * Overriding a gate that never ran is a person waving through a check
	 * nobody performed. It is allowed — that is what an override means — but it
	 * must stay visible: the state remains `pending` beside the gate's name in
	 * `overridden`, so a reader can tell this apart from accepting a known
	 * failure.
	 */
	it("keeps an override of an unmeasured gate visible as unmeasured", () => {
		const v = evaluateGates(DECLARED, [], override({ gate: "tests" }));
		const tests = v.gates.find((g) => g.gate === "tests");
		expect(tests?.state).toBe("pending");
		expect(tests?.source).toBeNull();
		expect(v.overridden).toEqual(["tests"]);
	});

	it("flags an override of a gate the playbook does not declare", () => {
		const v = evaluateGates(DECLARED, [], override({ gate: "nonexistent" }));
		expect(v.overridden).toEqual([]);
		expect(v.unexpected.join(" ")).toMatch(/does not declare/);
	});

	it("flags an override of a gate that is already passing", () => {
		const v = evaluateGates(
			DECLARED,
			[measured()],
			override({ gate: "tests" }),
		);
		expect(v.overridden).toEqual([]);
		expect(v.unexpected.join(" ")).toMatch(/already passing/);
	});

	/** One override clears one gate. It must not clear the other mandatory one. */
	it("clears only the gate it names", () => {
		const v = evaluateGates(
			DECLARED,
			[
				measured({ gate: "tests", state: "block" }),
				measured({ gate: "mutation", state: "block" }),
			],
			override({ gate: "tests" }),
		);
		expect(v.blocking).toEqual(["mutation"]);
	});
});

describe("evaluateGates — disagreement about which gates apply", () => {
	/**
	 * A measurement for a gate nobody declared means the runner and the playbook
	 * disagree about what this mission is subject to. Dropping it silently would
	 * hide that; it does not become a gate, but it is reported.
	 */
	it("reports a measurement for an undeclared gate without adopting it", () => {
		const v = evaluateGates(DECLARED, [measured({ gate: "lint" })], null);
		expect(v.gates.map((g) => g.gate)).not.toContain("lint");
		expect(v.unexpected.join(" ")).toMatch(/undeclared gate lint/);
	});

	it("produces nothing to block on when no gates are declared", () => {
		const v = evaluateGates([], [], null);
		expect(v.gates).toEqual([]);
		expect(v.blocking).toEqual([]);
	});
});
