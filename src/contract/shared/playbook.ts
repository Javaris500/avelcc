import type {
	GatePolicy,
	GateSource,
	GateState,
} from "#/contract/shared/errors";

export type Gate = {
	name: string;
	policy: GatePolicy;
	state: GateState;
	source: GateSource;
};

/**
 * The full-build gate set.
 *
 * NOT invented. Transcribed from the golden fixture's own playbook at
 * fixtures/golden/slice-1/.avel/mission/playbook.md, which is the reference
 * package the renderer must reproduce byte-for-byte.
 *
 * Every state is `pending` because that is TRUE: STATE.md's one-line status is
 * "Zero missions have run." Rendering a green gate here would be fabricated
 * product data inside a product whose thesis is that AI ships work which looks
 * finished and is not.
 *
 * `alignment` is attested rather than mechanical, per BLAST-RADIUS.md's
 * pre-flight wireframe — "alignment  mandatory  ⚠ attested" — and
 * CLIENT-CONTRACT-CONFORMANCE.md, which calls it the unbuilt half of the gate.
 * That single field is the most important thing on this screen.
 */
export const FULL_BUILD_GATES: readonly Gate[] = [
	{
		name: "phase1-close",
		policy: "mandatory",
		state: "pending",
		source: "mechanical",
	},
	{
		name: "alignment",
		policy: "mandatory",
		state: "pending",
		source: "attested",
	},
	{ name: "qa", policy: "mandatory", state: "pending", source: "mechanical" },
	{ name: "security", policy: "warn", state: "pending", source: "mechanical" },
	{
		name: "acceptance",
		policy: "mandatory",
		state: "pending",
		source: "mechanical",
	},
];
