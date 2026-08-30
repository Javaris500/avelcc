/**
 * The AI SDK's UI vocabulary, transcribed rather than imported.
 *
 * `ai` and `@ai-sdk/react` are not in package.json and not in node_modules.
 * Verified, both. UI-PLAN section 6 puts the dependency, `/api/chat` and the
 * read-only tools at step 10, which is backend work and not this session's.
 * So the chat UI is built against the SDK's shapes without taking the
 * dependency: every component here is prop-driven, and none imports a package
 * that does not exist.
 *
 * WHAT THIS COSTS. A transcription can drift from the package. The mitigation
 * is that it is deliberately narrow. It covers the part kinds this UI renders
 * and nothing else, so when `ai` lands the diff is "delete this file, import
 * from `ai`" rather than a reconciliation.
 *
 * WHAT IT BUYS, and it is the reason to write it out rather than reach for
 * `any`: `UIMessage` below has NO `content` field. UI-PLAN section 6 calls
 * `message.content` the one API fact that will bite, because every pre-v5
 * example maps over it and renders an empty conversation. Here it is a type
 * error. That moves the trap from a comment somebody reads to a compiler
 * failure nobody can skip, which is the same move `Surface` makes by requiring
 * all four states.
 */

/**
 * `useChat().status`. Four values, which is the same four-state discipline
 * `Surface` enforces for queries.
 */
export type ChatStatus = "submitted" | "streaming" | "ready" | "error";

/** Streaming parts arrive incomplete. `state` says whether this one is final. */
export type PartState = "streaming" | "done";

export type TextUIPart = {
	type: "text";
	text: string;
	state?: PartState;
};

export type ReasoningUIPart = {
	type: "reasoning";
	text: string;
	state?: PartState;
};

/**
 * `step-start` marks a boundary between model turns in a multi-step call. It
 * renders as nothing. It is in the union so an exhaustive switch does not have
 * to fall through a default that hides an unknown kind.
 */
export type StepStartUIPart = { type: "step-start" };

/**
 * A tool part. The SDK types these as `tool-${NAME}` with the tool's own input
 * and output types; here both stay `unknown` and are narrowed at the render
 * site by `toEntityRef`. A tool output is JSON off the wire, so treating it as
 * trusted at the boundary is how a malformed row takes down the conversation.
 */
export type ToolUIPart = {
	type: `tool-${string}`;
	toolCallId: string;
	state:
		| "input-streaming"
		| "input-available"
		| "output-available"
		| "output-error";
	input?: unknown;
	output?: unknown;
	errorText?: string;
};

export type UIMessagePart =
	| TextUIPart
	| ReasoningUIPart
	| ToolUIPart
	| StepStartUIPart;

export type UIMessageRole = "system" | "user" | "assistant";

/** `{ id, role, parts[], metadata? }`. There is no `content`. */
export type UIMessage = {
	id: string;
	role: UIMessageRole;
	parts: UIMessagePart[];
	metadata?: unknown;
};

/** True for `tool-*`, which is the only templated member of the union. */
export function isToolPart(part: UIMessagePart): part is ToolUIPart {
	return part.type.startsWith("tool-");
}

/** `tool-listMissions` reads as `listMissions` in the UI. */
export function toolNameOf(part: ToolUIPart): string {
	return part.type.slice("tool-".length);
}

/**
 * How a tool call reads while it is happening. The mapping is here rather than
 * inside the component because it is a decision that can be wrong, and a
 * mapping written inline in JSX is only ever checked by looking at it.
 *
 * `input-streaming` and `input-available` both read as pending. The difference
 * between "the model is still writing the arguments" and "the arguments are
 * complete, the tool has not returned" is real to a developer and not to an
 * operator, who in both cases is waiting.
 */
export function toolStateTone(
	state: ToolUIPart["state"],
): "pending" | "pass" | "block" {
	switch (state) {
		case "input-streaming":
		case "input-available":
			return "pending";
		case "output-available":
			return "pass";
		case "output-error":
			return "block";
	}
}

/**
 * The label beside the tool name. Plain words: the operator is not technical
 * and "input-available" tells them nothing. Section 12 rule 5, naming the
 * jargon once where it is met.
 */
export function toolStateLabel(state: ToolUIPart["state"]): string {
	switch (state) {
		case "input-streaming":
		case "input-available":
			return "looking";
		case "output-available":
			return "found";
		case "output-error":
			return "failed";
	}
}
