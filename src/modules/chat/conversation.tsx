import { type ReactNode, useEffect, useRef } from "react";
import { Message } from "#/modules/chat/message";
import type { ChatStatus, UIMessage } from "#/modules/chat/types";
import { Button } from "#/ui/button";
import { EmptyState } from "#/ui/states";

/**
 * The conversation scroller.
 *
 * IT DOES NOT PAINT `bg-background`. UI-PLAN section 7 flags this as one of the
 * four things that will still go wrong with a component paste:
 * `--color-background` maps to `--color-app-panel`, which is the CARD surface.
 * A scroller painting itself `bg-background` sits on a card tone, so every
 * message card inside it is the same colour as its own container and the
 * layering disappears. It stays transparent and takes `app-bg` from the window,
 * which is what a conversation should sit on.
 *
 * IT KEEPS ITSELF PINNED TO THE BOTTOM, BUT ONLY IF IT ALREADY WAS. Scrolling
 * an operator back down while they are reading something further up is worse
 * than not following the stream at all, and it is the single most common defect
 * in a chat scroller.
 */

/** Under this many pixels from the bottom counts as "following the stream". */
const PIN_THRESHOLD = 64;

export function Conversation({
	messages,
	status,
	error,
	onRetry,
	empty,
}: {
	messages: UIMessage[];
	status: ChatStatus;
	/** `useChat().error`. */
	error?: Error;
	/** `useChat().regenerate`. Section 6: it needs a real button. */
	onRetry?: () => void;
	/** Rendered instead of the list when there is nothing yet. */
	empty: ReactNode;
}) {
	const scroller = useRef<HTMLDivElement>(null);
	const pinned = useRef(true);

	// Recorded on scroll rather than measured at append time: by the time a new
	// part has rendered the scroll height has already changed, so measuring then
	// answers a different question.
	useEffect(() => {
		const el = scroller.current;
		if (!el) return;
		const onScroll = () => {
			const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
			pinned.current = distance < PIN_THRESHOLD;
		};
		el.addEventListener("scroll", onScroll, { passive: true });
		return () => el.removeEventListener("scroll", onScroll);
	}, []);

	// Runs on every append and on every status change, because a status line
	// appearing below the last message grows the scroller the same way a new
	// part does.
	//
	// `messages` and `status` are TRIGGERS, not reads. The body touches only
	// refs, so the linter is right that they are unused inside it and wrong
	// about what to do: dropping them makes this a mount-only effect that
	// follows nothing. Verified by removing them, at which point the scroller
	// stops following an append.
	// biome-ignore lint/correctness/useExhaustiveDependencies: re-run triggers, deliberately not read in the body
	useEffect(() => {
		const el = scroller.current;
		if (!el || !pinned.current) return;
		el.scrollTop = el.scrollHeight;
	}, [messages, status]);

	return (
		<div
			className="app-scroll min-h-0 flex-1 overflow-y-auto"
			data-testid="chat-conversation"
			ref={scroller}
		>
			{messages.length === 0 ? (
				// CENTRED, and this is the difference between the screen looking
				// finished and looking like it failed to load. Top-aligned, the
				// empty state sat against the strip with roughly 360px of nothing
				// between it and the composer at the floor. Measured in a browser,
				// which is the first time anyone has driven this screen.
				//
				// The scroller keeps its own height rather than the content
				// deciding it, so the composer stays where it is and only the
				// empty state moves.
				<div className="flex h-full flex-col justify-center">{empty}</div>
			) : (
				<div className="flex flex-col gap-6 pb-4">
					{messages.map((message) => (
						<Message key={message.id} message={message} />
					))}

					{/*
					  `submitted` means the request is out and nothing has come back.
					  Without a marker here the app looks frozen for exactly as long as
					  the model takes to produce a first token, which is the window an
					  operator uses to decide it is broken.
					*/}
					{status === "submitted" ? (
						<p className="text-xs text-text-subtle" data-testid="chat-working">
							Working.
						</p>
					) : null}

					{status === "error" ? (
						<ChatError error={error} onRetry={onRetry} />
					) : null}
				</div>
			)}
		</div>
	);
}

/**
 * The error, in the conversation rather than as a toast, because it belongs to
 * the turn that failed. Follows `ErrorState`'s discipline: the screen says what
 * happened and what to do, and the code is for the log.
 */
function ChatError({
	error,
	onRetry,
}: {
	error?: Error;
	onRetry?: () => void;
}) {
	return (
		<div
			className="flex flex-col items-start gap-2 rounded-md border border-gate-block-line bg-gate-block-soft p-3"
			data-testid="chat-error"
		>
			<p className="text-sm font-medium text-text">
				That did not get an answer.
			</p>
			<p className="max-w-[52ch] text-xs leading-relaxed text-text-muted">
				{error?.message ?? "The request failed and gave no reason."}
			</p>
			{onRetry ? (
				<Button data-testid="chat-retry" onClick={onRetry} size="sm">
					Try again
				</Button>
			) : null}
		</div>
	);
}

/**
 * The empty conversation. UI-PLAN section 12 rule 4: an empty state says why,
 * and this one has a why worth saying. Reuses `EmptyState` from `src/ui/`
 * rather than inventing a second one.
 */
export function ConversationEmpty({ children }: { children: ReactNode }) {
	return (
		<div className="flex flex-col gap-4" data-testid="chat-empty">
			<EmptyState
				body="Ask about a mission, a client, or what is holding a delivery up. The Command Center reads the same data the rest of the app does."
				className="px-0 py-6"
				title="What would you like to do?"
			/>
			{children}
		</div>
	);
}
