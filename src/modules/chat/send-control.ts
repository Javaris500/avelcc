import type { ChatStatus } from "#/modules/chat/types";

/**
 * The send and stop swap. UI-PLAN section 10 calls it the one morph that must
 * ship, and the reason is not that it looks good: "a stream the operator
 * cannot cancel is a hang, and a hang is indistinguishable from a broken app."
 *
 * The decision is a pure function of `useChat().status` so it can be tested.
 * The component is a thin render of what this returns. A swap implemented as
 * three ternaries inside JSX is a swap that is only ever verified by looking
 * at it, and vitest here cannot look at a .tsx.
 *
 * WHY BOTH `submitted` AND `streaming` SHOW STOP. `submitted` means the
 * request is out and no tokens have come back. That is exactly the window in
 * which an operator decides the app has frozen, so it is the window that most
 * needs a cancel. Showing send there, greyed, would be a control that does
 * nothing during the only moment it is wanted.
 */

export type SendControl = {
	/** Which button this is. The component switches icon and handler on it. */
	kind: "send" | "stop";
	/** Accessible name. Visible only to a screen reader; the icon carries it. */
	label: string;
	disabled: boolean;
	/**
	 * Why it is disabled, in plain words, or undefined when it is not. Rendered
	 * beside the composer rather than as a tooltip: a disabled control whose
	 * reason is behind a hover is a disabled control with no reason.
	 */
	reason?: string;
	"data-testid": string;
};

export type SendControlInput = {
	status: ChatStatus;
	/** False when the textarea is empty or whitespace. */
	hasText: boolean;
	/**
	 * Set while there is nothing to send to. Today that is the whole time:
	 * `/api/chat` does not exist, so sending would fail with no explanation.
	 * Passing the reason rather than a boolean is what puts it on screen.
	 */
	blockedReason?: string;
};

export function sendControlFor({
	status,
	hasText,
	blockedReason,
}: SendControlInput): SendControl {
	if (status === "submitted" || status === "streaming") {
		return {
			kind: "stop",
			label: "Stop",
			// Never disabled. This is the escape hatch; disabling it recreates
			// exactly the hang it exists to prevent.
			disabled: false,
			"data-testid": "chat-stop",
		};
	}

	if (blockedReason) {
		return {
			kind: "send",
			label: "Send",
			disabled: true,
			reason: blockedReason,
			"data-testid": "chat-send",
		};
	}

	return {
		kind: "send",
		label: "Send",
		disabled: !hasText,
		// No reason when the textarea is empty. "Type something first" is noise
		// beside an empty box the operator is already looking at.
		"data-testid": "chat-send",
	};
}

/**
 * Enter sends, Shift+Enter opens a line. Split out for the same reason as the
 * swap: it is a rule, it can be wrong, and a keydown handler in JSX cannot be
 * tested here.
 *
 * `isComposing` guards the IME. Enter while a candidate list is open commits
 * the candidate; treating that as a send truncates the word the operator was
 * halfway through typing, and it is invisible to anyone testing in English.
 */
export function shouldSendOnKey(event: {
	key: string;
	shiftKey: boolean;
	nativeEvent?: { isComposing?: boolean };
}): boolean {
	if (event.key !== "Enter") return false;
	if (event.shiftKey) return false;
	if (event.nativeEvent?.isComposing) return false;
	return true;
}

/**
 * What a screen reader is told when the request state changes.
 *
 * Pressing send swaps the button under the operator: the glyph crossfades, the
 * accessible name goes from Send to Stop, and someone who cannot see it gets
 * silence. The control they just pressed became a different control and nothing
 * said so. Raised by avel-a8, and it is the same class as the blocked reason —
 * a state that is real and reaches sighted users only.
 *
 * Empty string for `ready`, so the region does not announce on every return to
 * rest. A live region that speaks when nothing has happened trains people to
 * ignore it.
 */
export function statusAnnouncement(status: ChatStatus): string {
	switch (status) {
		case "submitted":
			return "Sent. Waiting for a reply.";
		case "streaming":
			return "Replying. Press stop to cancel.";
		case "error":
			return "That did not get an answer.";
		case "ready":
			return "";
	}
}
