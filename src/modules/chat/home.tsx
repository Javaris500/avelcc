import { useRef, useState } from "react";
import { Composer } from "#/modules/chat/composer";
import { Conversation, ConversationEmpty } from "#/modules/chat/conversation";
import { type ChatModeId, DEFAULT_MODE } from "#/modules/chat/modes";
import { StatusStrip } from "#/modules/chat/status-strip";
import { Suggestions } from "#/modules/chat/suggestions";
import type { ChatStatus, UIMessage } from "#/modules/chat/types";

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

export function ChatHome() {
	// Stand-ins for `useChat`, in its exact shape. `messages` and `status` are
	// held rather than hardcoded so the components below are driven by state the
	// hook will drive, not by literals a swap would have to unpick.
	const [messages] = useState<UIMessage[]>([]);
	const [status] = useState<ChatStatus>("ready");
	const [input, setInput] = useState("");
	const [mode, setMode] = useState<ChatModeId>(DEFAULT_MODE);
	const inputRef = useRef<HTMLTextAreaElement>(null);

	return (
		// h-full rather than min-h-screen: `main` in the shell is the scroll
		// container and already has a resolved height, so filling it exactly
		// keeps the composer at the bottom of the pane instead of at the bottom
		// of the conversation.
		<div className="flex h-full flex-col gap-4" data-testid="chat-home">
			<StatusStrip />

			{/*
			  One measure for the conversation and the composer. UI-PLAN polish
			  item 5: `main` has no max-width, so on a wide display a response
			  runs past 1300px. The strip above stays full-bleed because it is a
			  band, not prose.
			*/}
			<div className="mx-auto flex w-full max-w-[72ch] min-h-0 flex-1 flex-col gap-4">
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
