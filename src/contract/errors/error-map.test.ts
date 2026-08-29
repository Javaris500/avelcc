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

	it("carries BLAST-RADIUS's twelve, plus IDEMPOTENCY_REPLAY", () => {
		expect(ERROR_CODES).toHaveLength(13);
		// Named explicitly: the count alone would be satisfied by any thirteenth,
		// and this one exists because the contract declared it before the union
		// could express it.
		expect(ERROR_CODES).toContain("IDEMPOTENCY_REPLAY");
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
