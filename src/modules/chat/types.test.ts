import { describe, expect, it } from "vitest";
import {
	isToolPart,
	type ToolUIPart,
	toolNameOf,
	toolStateLabel,
	toolStateTone,
	type UIMessagePart,
} from "#/modules/chat/types";

const STATES: ToolUIPart["state"][] = [
	"input-streaming",
	"input-available",
	"output-available",
	"output-error",
];

function toolPart(state: ToolUIPart["state"]): ToolUIPart {
	return { type: "tool-listMissions", toolCallId: "call_1", state };
}

describe("isToolPart", () => {
	it("recognises a tool part by its templated type", () => {
		expect(isToolPart(toolPart("output-available"))).toBe(true);
	});

	it("leaves the fixed part kinds alone", () => {
		const parts: UIMessagePart[] = [
			{ type: "text", text: "hello" },
			{ type: "reasoning", text: "thinking" },
			{ type: "step-start" },
		];
		for (const part of parts) expect(isToolPart(part)).toBe(false);
	});
});

describe("toolNameOf", () => {
	it("strips the prefix the SDK adds", () => {
		expect(toolNameOf(toolPart("output-available"))).toBe("listMissions");
	});
});

describe("tool state", () => {
	/**
	 * Exhaustive rather than sampled. A fifth state added by the SDK falls out
	 * of the switch and TypeScript catches it, but only if every current state
	 * is named somewhere a human will update.
	 */
	it("maps every state the SDK can report to a badge tone", () => {
		expect(STATES.map(toolStateTone)).toEqual([
			"pending",
			"pending",
			"pass",
			"block",
		]);
	});

	it("says what is happening in words an operator can read", () => {
		expect(STATES.map(toolStateLabel)).toEqual([
			"looking",
			"looking",
			"found",
			"failed",
		]);
	});

	it("never labels a state with the SDK's own name", () => {
		for (const state of STATES) {
			expect(toolStateLabel(state)).not.toContain("-");
		}
	});
});
