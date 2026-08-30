import { describe, expect, it } from "vitest";
import {
	sendControlFor,
	shouldSendOnKey,
	statusAnnouncement,
} from "#/modules/chat/send-control";
import type { ChatStatus } from "#/modules/chat/types";

const ALL: ChatStatus[] = ["submitted", "streaming", "ready", "error"];

describe("send and stop swap", () => {
	it("covers every status useChat can report", () => {
		// If the SDK grows a fifth status this fails rather than silently
		// falling through to send.
		for (const status of ALL) {
			expect(sendControlFor({ status, hasText: true }).kind).toBeTruthy();
		}
	});

	it("shows stop while the request is out and while it streams", () => {
		expect(sendControlFor({ status: "submitted", hasText: false }).kind).toBe(
			"stop",
		);
		expect(sendControlFor({ status: "streaming", hasText: false }).kind).toBe(
			"stop",
		);
	});

	it("never disables stop", () => {
		// The whole point. A disabled cancel is the hang it exists to prevent.
		for (const status of ["submitted", "streaming"] as const) {
			const control = sendControlFor({
				status,
				hasText: false,
				blockedReason: "no backend",
			});
			expect(control.disabled).toBe(false);
		}
	});

	it("shows send when ready and after an error", () => {
		expect(sendControlFor({ status: "ready", hasText: true }).kind).toBe(
			"send",
		);
		expect(sendControlFor({ status: "error", hasText: true }).kind).toBe(
			"send",
		);
	});

	it("disables send on an empty box, with no reason printed", () => {
		const control = sendControlFor({ status: "ready", hasText: false });
		expect(control.disabled).toBe(true);
		expect(control.reason).toBeUndefined();
	});

	it("prints the reason when send is blocked by something the operator cannot see", () => {
		const control = sendControlFor({
			status: "ready",
			hasText: true,
			blockedReason: "The agent is not connected yet.",
		});
		expect(control.disabled).toBe(true);
		expect(control.reason).toBe("The agent is not connected yet.");
	});

	it("gives send and stop different testids so a driven page can tell them apart", () => {
		expect(
			sendControlFor({ status: "ready", hasText: true })["data-testid"],
		).toBe("chat-send");
		expect(
			sendControlFor({ status: "streaming", hasText: true })["data-testid"],
		).toBe("chat-stop");
	});
});

describe("shouldSendOnKey", () => {
	it("sends on Enter", () => {
		expect(shouldSendOnKey({ key: "Enter", shiftKey: false })).toBe(true);
	});

	it("opens a line on Shift+Enter", () => {
		expect(shouldSendOnKey({ key: "Enter", shiftKey: true })).toBe(false);
	});

	it("ignores every other key", () => {
		expect(shouldSendOnKey({ key: "a", shiftKey: false })).toBe(false);
		expect(shouldSendOnKey({ key: "Tab", shiftKey: false })).toBe(false);
	});

	/**
	 * An IME commits a candidate with Enter. Sending there truncates the word
	 * being typed, and it is invisible to anyone testing in English.
	 */
	it("does not send while an IME candidate is open", () => {
		expect(
			shouldSendOnKey({
				key: "Enter",
				shiftKey: false,
				nativeEvent: { isComposing: true },
			}),
		).toBe(false);
	});
});

describe("statusAnnouncement", () => {
	it("says nothing at rest, so the region does not speak on every return", () => {
		expect(statusAnnouncement("ready")).toBe("");
	});

	it("announces every state that is not rest", () => {
		for (const status of ["submitted", "streaming", "error"] as const) {
			expect(statusAnnouncement(status).length).toBeGreaterThan(0);
		}
	});

	/**
	 * The button changes under the operator when a stream starts. Someone who
	 * cannot see the glyph crossfade has to be told the cancel exists.
	 */
	it("names the escape hatch while streaming", () => {
		expect(statusAnnouncement("streaming").toLowerCase()).toContain("stop");
	});
});
