import { useRef, useState } from "react";
import { Composer } from "#/modules/chat/composer";
import { Conversation, ConversationEmpty } from "#/modules/chat/conversation";
import { type ChatModeId, DEFAULT_MODE } from "#/modules/chat/modes";
import { StatusStrip } from "#/modules/chat/status-strip";
import { Suggestions } from "#/modules/chat/suggestions";
import type { ChatStatus, UIMessage } from "#/modules/chat/types";
import { usePageHeader } from "#/modules/shell/use-page-header";

/**
 * Home. A conversation with the Command Center, plus a strip that says what the
 * system is doing without being asked. UI-PLAN decision 1 and section 8.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * NOTHING IS CONNECTED, AND THE SCREEN SAYS SO.
 *
 * This session is frontend only. `ai`, `@ai-sdk/react` and `@ai-sdk/anthropic`
 * are absent from package.json and from node_modules; both were checked, not
 * assumed. `/api/chat` does not exist. UI-PLAN step 10 puts the dependency, the
 * route and the read-only tools together, before any of this, and that is the
 * right order.
 *
 * So the composer is built, wired, and DISABLED WITH ITS REASON PRINTED. Two
 * alternatives were considered and rejected:
 *
 *   - Enabled, sending into a 404. The failure would be real rather than
 *     fabricated, which is in its favour. It was rejected because it cannot be
 *     verified from here: another session holds the dev server, so what a
 *     TanStack Start dev build actually returns for a missing api route is
 *     unknown, and shipping a path nobody has run is the thing this project
 *     exists to stop.
 *   - A stub that answers. Rejected outright. An invented assistant turn is a
 *     fabricated artifact, and it would make an unbuilt feature demo well.
 *
 * The disabled state is the same move the `Act` mode makes. A control that says
 * why it cannot be used is honest. One that looks live and is not is the defect
 * CLAUDE.md opens with.
 *
 * WHAT WIRING IT LOOKS LIKE, when step 10 lands. Delete `blockedReason`, delete
 * the four `useState` lines below, and replace them with:
 *
 *   const { messages, sendMessage, status, stop, regenerate, error } = useChat({
 *     transport: new DefaultChatTransport({ api: "/api/chat" }),
 *   });
 *
 * Every prop below already has that name and that shape. Nothing else changes.
 * ────────────────────────────────────────────────────────────────────────────
 */

const NOT_CONNECTED =
	"The Command Center agent is not connected yet. There is no /api/chat and no model behind this box, so nothing would be sent.";

/**
 * STRINGS, NOT NODES, AND IT IS NOT A STYLE CHOICE.
 *
 * `usePageHeader` depends on its own arguments: `[set, title, subtitle,
 * definition, actions]`. Strings compare by value across renders, so a string
 * title settles after one pass. A `ReactNode` is a fresh object every render,
 * so the effect re-runs, calls `set`, re-renders, and builds another one. That
 * is an unbounded loop, and it is the `actions` slot the hook exists for.
 *
 * Reported to the shell owner rather than worked around here. These two are
 * strings, so this route is safe either way.
 */
const HEADER_TITLE = "Command Center";
const HEADER_SUBTITLE =
	"Ask about a mission, a client, or what is holding a delivery up.";

export function ChatHome() {
	// Stand-ins for `useChat`, in its exact shape. `messages` and `status` are
	// held rather than hardcoded so the components below are driven by state the
	// hook will drive, not by literals a swap would have to unpick.
	const [messages] = useState<UIMessage[]>([]);
	const [status] = useState<ChatStatus>("ready");
	const [input, setInput] = useState("");
	const [mode, setMode] = useState<ChatModeId>(DEFAULT_MODE);
	const inputRef = useRef<HTMLTextAreaElement>(null);

	/**
	 * NO `actions` HERE, AND IT IS DELIBERATE. Home's module slot is meant to
	 * carry `New chat` primary and `History` secondary. Neither can work yet.
	 * `New chat` clears a conversation, and there is no conversation to clear;
	 * `History` opens a thread list, and UI-PLAN section 14 still has thread
	 * persistence open, so there is nothing to list. Shipping both would put two
	 * dead controls in the one slot the header reserves for the page's real
	 * action, which is section 12 rule 6 in the place it is most visible.
	 *
	 * Section 2 already allows for this: "Empty is a valid state, and the header
	 * must not reserve space for it." They land with `useChat` and the
	 * persistence decision, in that order.
	 */
	usePageHeader({ subtitle: HEADER_SUBTITLE, title: HEADER_TITLE });

	return (
		// h-full rather than min-h-screen: `main` in the shell is the scroll
		// container and already has a resolved height, so filling it exactly
		// keeps the composer at the bottom of the pane instead of at the bottom
		// of the conversation.
		// gap-6 rather than gap-4, and it is load-bearing. The strip used to
		// carry a `border-b`; with the rule gone the gap is the whole of what
		// separates chrome from conversation.
		<div className="flex h-full flex-col gap-6" data-testid="chat-home">
			<StatusStrip />

			{/*
			  ONE MEASURE for the conversation and the composer, and it owns the
			  measure alone. UI-PLAN polish item 5: `main` has no max-width, so on
			  a wide display a response runs past 1300px. The strip above stays
			  full-bleed because it is a band, not prose.

			  52ch, AND THE NUMBER IS MEASURED RATHER THAN CHOSEN. This was 72ch,
			  which I had reported as roughly 540px from an estimate of `ch`. Driven
			  in a browser it was 636px carrying 101 characters per line, against a
			  readable band of 45 to 75. The estimate was wrong and the operator
			  calling it wide was right.

			  `ch` is the width of "0", and it resolves against THIS element at the
			  14px base, so 1ch here is 8.83px. A message renders at 13px where
			  average prose runs 6.32px per character. 52ch is 459px is 73
			  characters, which is the top of the band with the composer's controls
			  still comfortable inside it.
			*/}
			<div className="mx-auto flex w-full max-w-[52ch] min-h-0 flex-1 flex-col gap-4">
				<Conversation
					empty={
						<ConversationEmpty>
							<Suggestions
								onSelect={(text) => {
									setInput(text);
									// Focus, do not send. The operator edits the opening
									// before it goes, which is how they learn what the
									// agent takes.
									inputRef.current?.focus();
								}}
							/>
						</ConversationEmpty>
					}
					messages={messages}
					status={status}
				/>

				<Composer
					blockedReason={NOT_CONNECTED}
					mode={mode}
					onChange={setInput}
					onModeChange={setMode}
					// Unreachable while `blockedReason` is set: the composer refuses
					// to call it when the control is disabled, and `sendControlFor`
					// has a test for that. It is here so the prop is not invented on
					// the day the hook arrives.
					onSend={() => undefined}
					onStop={() => undefined}
					status={status}
					textareaRef={inputRef}
					value={input}
				/>
			</div>
		</div>
	);
}
