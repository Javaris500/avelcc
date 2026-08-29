import { describe, expect, it } from "vitest";

import {
	blocksDelivery,
	ERROR_MAP,
	presentError,
} from "#/contract/errors/error-map";
import {
	ERROR_CODES,
	isOverridable,
	VIOLATION_CODES,
} from "#/contract/shared/errors";

describe("error map", () => {
	it("covers every code in the union, with none left over", () => {
		expect(Object.keys(ERROR_MAP).sort()).toEqual([...ERROR_CODES].sort());
	});

	it("carries BLAST-RADIUS's twelve, plus the two added since", () => {
		expect(ERROR_CODES).toHaveLength(14);
		// Named, not just counted: a count is satisfied by any two additions, and
		// each of these exists for a reason worth asserting. IDEMPOTENCY_REPLAY
		// was declared by the contract before the union could express it;
		// GITHUB_REJECTED separates a refusal from an outage.
		expect(ERROR_CODES).toContain("IDEMPOTENCY_REPLAY");
		expect(ERROR_CODES).toContain("GITHUB_REJECTED");
	});

	/**
	 * The distinction this code exists for. EXTERNAL_GITHUB tells the operator
	 * to retry; GITHUB_REJECTED must never do that, because the same request
	 * will be refused identically. If these two ever offer the same recovery,
	 * the second code has stopped earning its place.
	 */
	it("does not offer a retry for a request GitHub refused", () => {
		expect(presentError("EXTERNAL_GITHUB").recovery.kind).toBe("retry");
		expect(presentError("GITHUB_REJECTED").recovery.kind).toBe("none");
		expect(presentError("GITHUB_REJECTED").body).toMatch(/same answer/i);
		expect(blocksDelivery("GITHUB_REJECTED")).toBe(true);
		expect(isOverridable("GITHUB_REJECTED")).toBe(false);
	});

	/**
	 * A replay is not a failure and must not be dressed as one, but it must also
	 * not leave the deliver button live — the delivery already happened, and an
	 * override cannot make a completed write un-happen.
	 */
	it("treats a replay as un-overridable without calling it a failure", () => {
		expect(isOverridable("IDEMPOTENCY_REPLAY")).toBe(false);
		expect(blocksDelivery("IDEMPOTENCY_REPLAY")).toBe(true);
		expect(presentError("IDEMPOTENCY_REPLAY").severity).not.toBe("loud");
		expect(presentError("IDEMPOTENCY_REPLAY").body).not.toMatch(
			/fail|error|wrong/i,
		);
	});

	it("keeps the six violation codes as a separate union", () => {
		expect(VIOLATION_CODES).toHaveLength(6);
		for (const v of VIOLATION_CODES) {
			expect(ERROR_CODES).not.toContain(
				v as unknown as (typeof ERROR_CODES)[number],
			);
		}
	});

	it("writes copy for a person, not a log", () => {
		for (const code of ERROR_CODES) {
			const p = presentError(code);
			expect(p.title.length).toBeGreaterThan(15);
			expect(p.body.length).toBeGreaterThan(40);
			// No code names leaking into operator-facing prose.
			expect(p.title).not.toMatch(/[A-Z]{4,}_[A-Z]/);
		}
	});

	it("never offers an override for a violation or a determinism failure", () => {
		expect(isOverridable("BLAST_RADIUS_VIOLATION")).toBe(false);
		expect(isOverridable("DETERMINISM_VIOLATION")).toBe(false);
		expect(blocksDelivery("BLAST_RADIUS_VIOLATION")).toBe(true);
		expect(blocksDelivery("DETERMINISM_VIOLATION")).toBe(true);
	});

	it("marks a determinism failure loud, because it is not a user error", () => {
		expect(presentError("DETERMINISM_VIOLATION").severity).toBe("loud");
	});

	it("treats an empty repository as a state, not a failure", () => {
		expect(presentError("EMPTY_REPOSITORY").severity).toBe("recoverable");
		expect(blocksDelivery("EMPTY_REPOSITORY")).toBe(false);
	});
});
