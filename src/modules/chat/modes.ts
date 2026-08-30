/**
 * The composer's mode pill, which is the agent's permission gate.
 *
 * UI-PLAN section 10. Read-only tools ship first and write tools do not ride
 * along (section 6). That reads as a limitation until the modes are on screen,
 * at which point it is the product telling the operator what the agent is
 * allowed to do without them reading a system prompt.
 *
 * This file is DATA, not a component, for two reasons. It is the thing worth
 * testing, and vitest here runs `environment: node` over `src/**\/*.test.ts`,
 * so logic that lives in a .tsx cannot be tested at all. Anything in the chat
 * that can be wrong lives in a .ts beside a .test.ts.
 *
 * `Act` is unavailable and stays unavailable until `ConfirmAction` exists.
 * A mode the operator cannot select is honest. A write tool wired to a model's
 * judgement with no confirmation round-trip is not, and it is the exact shape
 * of the failure CLAUDE.md opens with: it would look finished.
 */

export type ChatModeId = "ask" | "plan" | "act";

export type ChatMode = {
	id: ChatModeId;
	/** What the operator reads on the pill. */
	label: string;
	/** One line, in plain words. Rendered in the menu, not hidden in a tooltip. */
	summary: string;
	/** What the agent may call in this mode. */
	tools: "read-only" | "read-only, and proposes" | "read and write";
	/** What stands between a tool call and a change. */
	confirmation: string;
	/**
	 * False renders the item disabled AND prints `unavailableReason`. The two
	 * are paired in the type below so a mode cannot be switched off silently:
	 * `available: false` without a reason does not compile.
	 */
} & (
	| { available: true; unavailableReason?: never }
	| { available: false; unavailableReason: string }
);

export const CHAT_MODES: readonly ChatMode[] = [
	{
		id: "ask",
		label: "Ask",
		summary: "Answers questions about what is already there.",
		tools: "read-only",
		confirmation: "None needed. Nothing changes.",
		available: true,
	},
	{
		id: "plan",
		label: "Plan",
		summary: "Works out what it would do and shows you, without doing it.",
		tools: "read-only, and proposes",
		confirmation: "You see the plan before anything runs.",
		available: true,
	},
	{
		id: "act",
		label: "Act",
		summary: "Makes changes.",
		tools: "read and write",
		confirmation: "Every change goes through a confirmation screen.",
		available: false,
		unavailableReason:
			"Act needs the confirmation screen, which is not built yet. Until it is, a write would run on the agent's judgement alone.",
	},
];

/**
 * Ask. The lowest permission that can still answer a question, which is the
 * right default for a control whose whole job is to make permission visible.
 */
export const DEFAULT_MODE: ChatModeId = "ask";

export function modeById(id: ChatModeId): ChatMode {
	const found = CHAT_MODES.find((m) => m.id === id);
	// Unreachable through the type, reachable through a stored preference or a
	// URL. Falling back beats throwing inside a render.
	return found ?? CHAT_MODES[0];
}

/** Never trust a stored or routed id. Anything unknown lands on the default. */
export function coerceMode(id: unknown): ChatModeId {
	const mode = CHAT_MODES.find((m) => m.id === id);
	if (!mode || !mode.available) return DEFAULT_MODE;
	return mode.id;
}
