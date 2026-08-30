import { describe, expect, it } from "vitest";
import {
	CHAT_MODES,
	type ChatModeId,
	coerceMode,
	DEFAULT_MODE,
	modeById,
} from "#/modules/chat/modes";

describe("chat modes", () => {
	it("offers exactly the three modes UI-PLAN section 10 names", () => {
		expect(CHAT_MODES.map((m) => m.id)).toEqual(["ask", "plan", "act"]);
	});

	it("defaults to the lowest permission", () => {
		expect(DEFAULT_MODE).toBe("ask");
		expect(modeById(DEFAULT_MODE).tools).toBe("read-only");
	});

	/**
	 * The mechanism, not the manners. A mode switched off without a stated
	 * reason renders as a dead control, which is the one rule section 12
	 * records as already violated once.
	 */
	it("states a reason for every mode it disables", () => {
		for (const mode of CHAT_MODES) {
			if (mode.available) continue;
			expect(mode.unavailableReason.length).toBeGreaterThan(0);
		}
	});

	it("keeps Act unavailable while ConfirmAction does not exist", () => {
		const act = modeById("act");
		expect(act.available).toBe(false);
	});

	it("never lets a write mode be reached by coercion", () => {
		expect(coerceMode("act")).toBe("ask");
		expect(coerceMode("plan")).toBe("plan");
		expect(coerceMode("nonsense")).toBe("ask");
		expect(coerceMode(undefined)).toBe("ask");
		expect(coerceMode(null)).toBe("ask");
	});

	it("falls back rather than throwing on an unknown id", () => {
		expect(modeById("mystery" as ChatModeId).id).toBe("ask");
	});
});
