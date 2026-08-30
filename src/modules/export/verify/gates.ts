import type { GatePolicy, GateSource } from "#/contract/shared/errors";

/**
 * Gate evaluation: turning a playbook's declared gates into a verdict.
 *
 * PURE. No clock, no database, no test runner. `computedAt` is stamped by the
 * caller for the same reason `computeBlastRadius` is forbidden one — a function
 * that reads the time cannot be tested against a fixed expectation.
 *
 * THE POINT OF THIS MODULE IS THE `source` FIELD, not the states.
 * CLAUDE.md: "An attestation rendered identically to a mechanical pass is the
 * failure mode this project exists to prevent, appearing inside the product."
 * Everything below exists to make that distinction impossible to lose.
 */

/** A verdict a gate can reach, as distinct from not having reached one. */
export type GateVerdict = "pass" | "block" | "warn";

/** No verdict yet. `stale` means a verdict existed and its inputs moved. */
export type GateNonVerdict = "pending" | "stale";

/**
 * A gate result.
 *
 * A UNION, SO A VERDICT CANNOT BE RECORDED WITHOUT SAYING HOW IT WAS REACHED.
 * `GATE_SOURCES` is documented as "a required field, not an optional flag — a
 * gate cannot be rendered without answering how it was decided", and a single
 * optional `source` would let a caller write `pass` with nothing beside it.
 * Here `pass` without a source does not typecheck, and `pending` with one does
 * not either: a gate that has not run was not decided mechanically OR attested,
 * it simply has no answer.
 */
export type GateResult =
	| {
			gate: string;
			policy: GatePolicy;
			state: GateVerdict;
			source: GateSource;
			detail?: string;
	  }
	| {
			gate: string;
			policy: GatePolicy;
			state: GateNonVerdict;
			source: null;
			detail?: string;
	  };

/** What a gate declares in `playbooks.gates`. */
export type DeclaredGate = { gate: string; policy: GatePolicy };

/** A gate that actually ran, or that a person signed for. */
export type Measurement = {
	gate: string;
	state: GateVerdict;
	source: GateSource;
	detail?: string;
};

/** The contract's shape, ruled 2026-08-29. */
export type GateOverride = {
	gate: string;
	rationale: string;
	overriddenBy: string;
	overriddenAt: string;
};

export type Verification = {
	gates: GateResult[];
	/**
	 * Mandatory gates that are not passing and are not overridden. Non-empty
	 * means delivery must not proceed.
	 */
	blocking: string[];
	/** Cleared by the override rather than by passing. Always 0 or 1 today. */
	overridden: string[];
	/**
	 * Measurements naming a gate the playbook does not declare, and an override
	 * naming one that is absent or already passing. Surfaced rather than
	 * dropped: silently ignoring either hides a real disagreement about which
	 * gates this mission is subject to.
	 */
	unexpected: string[];
};

/**
 * Evaluates declared gates against whatever actually ran.
 *
 * AN UNMEASURED GATE IS `pending`, NEVER `pass`. There is no test runner and no
 * coverage source wired into this project, so today almost every gate lands
 * here — and that is the honest output, not a deficiency in this function.
 * Defaulting an unmeasured gate to `pass` would manufacture exactly the
 * confidence the product exists to refuse.
 */
export function evaluateGates(
	declared: readonly DeclaredGate[],
	measured: readonly Measurement[],
	override: GateOverride | null,
): Verification {
	const byGate = new Map(measured.map((m) => [m.gate, m]));
	const declaredNames = new Set(declared.map((d) => d.gate));

	const gates: GateResult[] = declared.map((d) => {
		const m = byGate.get(d.gate);
		if (!m) {
			return {
				gate: d.gate,
				policy: d.policy,
				state: "pending",
				source: null,
				detail: "Nothing has measured this gate.",
			};
		}
		return {
			gate: d.gate,
			policy: d.policy,
			state: m.state,
			source: m.source,
			...(m.detail === undefined ? {} : { detail: m.detail }),
		};
	});

	const unexpected = measured
		.filter((m) => !declaredNames.has(m.gate))
		.map((m) => `measurement for undeclared gate ${m.gate}`);

	/**
	 * AN OVERRIDE DOES NOT CHANGE A GATE'S STATE, and that is deliberate.
	 *
	 * It changes whether delivery proceeds; it does not change what was true.
	 * Rewriting a blocked gate to `pass` because someone accepted the risk would
	 * destroy the record of what they accepted — and an override of a `pending`
	 * gate is someone waving through a check that never ran, which is precisely
	 * the thing a reader must be able to see afterwards. The state stays, and
	 * the gate's name appears in `overridden` beside it.
	 */
	const overridden: string[] = [];
	if (override) {
		const target = gates.find((g) => g.gate === override.gate);
		if (!target) {
			unexpected.push(
				`override names gate ${override.gate}, which this playbook does not declare`,
			);
		} else if (target.state === "pass") {
			unexpected.push(
				`override names gate ${override.gate}, which is already passing`,
			);
		} else {
			overridden.push(override.gate);
		}
	}

	const blocking = gates
		.filter(
			(g) =>
				g.policy === "mandatory" &&
				g.state !== "pass" &&
				!overridden.includes(g.gate),
		)
		.map((g) => g.gate);

	return { gates, blocking, overridden, unexpected };
}

/**
 * How many gates reached a verdict by measurement rather than by assertion.
 *
 * Exists to be RENDERED. "18 of 20 attested" and "18 of 20 mechanical" describe
 * very different deliveries, and a screen that shows only a count of passes
 * cannot tell them apart — which is the failure this whole module is built
 * around.
 */
export function sourceSummary(v: Verification): {
	mechanical: number;
	attested: number;
	undecided: number;
} {
	let mechanical = 0;
	let attested = 0;
	let undecided = 0;
	for (const g of v.gates) {
		if (g.source === "mechanical") mechanical += 1;
		else if (g.source === "attested") attested += 1;
		else undecided += 1;
	}
	return { mechanical, attested, undecided };
}
