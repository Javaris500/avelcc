import { ChevronRight, Wrench } from "lucide-react";
import { entitiesFromToolOutput } from "#/modules/chat/entity";
import {
	EntityList,
	InlineEntityCard,
} from "#/modules/chat/inline-entity-card";
import {
	isToolPart,
	type ToolUIPart,
	toolNameOf,
	toolStateLabel,
	toolStateTone,
	type UIMessage,
	type UIMessagePart,
} from "#/modules/chat/types";
import { StatusBadge } from "#/ui/badge";
import { cn } from "#/utils/cn";

/**
 * One message, rendered from its PARTS.
 *
 * THE TRAP, and it is worth restating at the render site because this is where
 * it would be sprung. A `UIMessage` is `{ id, role, parts[], metadata? }`.
 * There is no `content`. Every pre-v5 example on the internet maps over
 * `message.content` and produces an empty conversation with no error anywhere,
 * because `undefined` renders as nothing. `types.ts` omits the field so the
 * mistake does not compile, and this file is the reason that mattered.
 *
 * The parts array is also where the value is. A tool part is how the agent's
 * database read becomes a rendered mission card instead of a paragraph of prose
 * about a mission. That is `InlineEntityCard`, below.
 *
 * NO MARKDOWN YET. AI Elements' `Response` renders markdown through
 * streamdown; neither it nor any markdown renderer is installed, and adding one
 * is a dependency decision that belongs with the AI SDK install in UI-PLAN step
 * 10. Text renders as text, with whitespace preserved. An asterisk shows as an
 * asterisk. That is a visible gap rather than a hidden one, which is the right
 * way round.
 */

export function Message({ message }: { message: UIMessage }) {
	const isUser = message.role === "user";

	return (
		<article
			className={cn("flex w-full flex-col gap-2", isUser && "items-end")}
			data-role={message.role}
			data-testid={`chat-message-${message.id}`}
		>
			{/* Screen readers get the speaker; sighted readers get the alignment
			    and the surface, which is faster to scan than a repeated label. */}
			<span className="sr-only">
				{isUser ? "You said" : "The Command Center said"}
			</span>

			<div
				className={cn(
					"flex flex-col gap-3",
					isUser
						? "max-w-[52ch] rounded-md border border-[var(--elevation-border-rest)] bg-app-panel px-3 py-2"
						: "w-full max-w-[72ch]",
				)}
			>
				{message.parts.map((part, index) => (
					<MessagePart
						// Parts have no id and are append-only within a message, so the
						// index is genuinely their identity. They never reorder.
						// biome-ignore lint/suspicious/noArrayIndexKey: parts are positional and append-only
						key={index}
						part={part}
					/>
				))}
			</div>
		</article>
	);
}

function MessagePart({ part }: { part: UIMessagePart }) {
	if (isToolPart(part)) return <ToolPart part={part} />;

	switch (part.type) {
		case "text":
			return (
				<p
					className="text-sm leading-relaxed whitespace-pre-wrap text-text"
					data-testid="chat-part-text"
				>
					{part.text}
					{part.state === "streaming" ? <StreamCaret /> : null}
				</p>
			);

		case "reasoning":
			return <ReasoningPart text={part.text} />;

		// A boundary between model turns. It renders as nothing, and it is in
		// the switch so an unknown kind is a compile error rather than a
		// silent default branch.
		case "step-start":
			return null;
	}
}

/**
 * Marks where the text has got to while it streams. DELIBERATELY STATIC.
 *
 * A blinking caret was the obvious version and it is wrong twice. `patch.css`
 * reserves `animate-period` as the one signature loop, to be used once per page
 * and never beside another animated element, and the sidebar wordmark already
 * spends it. And UI-PLAN polish item 2 makes the point that streaming text is
 * already a lot of motion, in an app that honours `prefers-reduced-motion`
 * nowhere. The text itself is the movement. The caret only has to say where it
 * stopped.
 */
function StreamCaret() {
	return (
		<span
			aria-hidden="true"
			className="ml-0.5 inline-block h-[0.9em] w-[2px] translate-y-[0.1em] bg-accent-text align-baseline"
			data-testid="chat-stream-caret"
		/>
	);
}

/**
 * Reasoning, collapsed. `<details>` rather than state and a click handler: the
 * disclosure is native, keyboard-accessible for free, and needs no JavaScript,
 * which matters for something that appears many times in a long conversation.
 */
function ReasoningPart({ text }: { text: string }) {
	return (
		<details className="group" data-testid="chat-part-reasoning">
			<summary className="interactive inline-flex cursor-pointer list-none items-center gap-1.5 rounded-xs py-0.5 text-xs text-text-subtle">
				<ChevronRight
					aria-hidden="true"
					className="transition-transform duration-[var(--duration-micro)] ease-[var(--ease-avel)] group-open:rotate-90 motion-reduce:transition-none"
					size={12}
					strokeWidth={2.2}
				/>
				Thinking
			</summary>
			{/*
			  Indent and tone, no left rule. The quote bar is a rule like any
			  other, and this one would have repeated down a long conversation
			  once per reasoning block.
			*/}
			<p className="mt-1 pl-5 text-xs leading-relaxed whitespace-pre-wrap text-text-subtle">
				{text}
			</p>
		</details>
	);
}

/**
 * A tool call. The header says what the agent looked at and how it went; the
 * body is either entity cards or, when the result is a shape the parser does
 * not recognise, the raw JSON behind a disclosure.
 *
 * Showing the raw result rather than nothing is deliberate. A tool that returns
 * something unexpected should be visible, not silently dropped, or the first
 * sign of a broken tool is an agent confidently summarising an empty read.
 */
function ToolPart({ part }: { part: ToolUIPart }) {
	const entities =
		part.state === "output-available"
			? entitiesFromToolOutput(part.output)
			: [];
	const showRaw =
		part.state === "output-available" &&
		entities.length === 0 &&
		part.output !== undefined;

	return (
		<section
			className="flex flex-col gap-2"
			data-testid={`chat-tool-${part.toolCallId}`}
			data-tool-state={part.state}
		>
			<div className="flex items-center gap-2">
				<Wrench
					aria-hidden="true"
					className="shrink-0 text-text-subtle"
					size={12}
					strokeWidth={1.8}
				/>
				<span className="font-mono text-micro text-text-subtle">
					{toolNameOf(part)}
				</span>
				<StatusBadge
					data-testid={`chat-tool-${part.toolCallId}-state`}
					tone={toolStateTone(part.state)}
				>
					{toolStateLabel(part.state)}
				</StatusBadge>
			</div>

			{entities.length ? (
				<EntityList>
					{entities.map((entity) => (
						<InlineEntityCard
							entity={entity}
							key={`${entity.kind}:${entity.id}`}
						/>
					))}
				</EntityList>
			) : null}

			{part.state === "output-error" ? (
				<p className="text-xs leading-relaxed text-gate-block">
					{part.errorText ?? "The tool failed and said nothing about why."}
				</p>
			) : null}

			{showRaw ? (
				<details data-testid={`chat-tool-${part.toolCallId}-raw`}>
					<summary className="cursor-pointer list-none text-xs text-text-subtle">
						It returned something this screen cannot draw. Show it.
					</summary>
					<pre className="app-scroll mt-1 max-h-64 overflow-auto rounded-xs bg-app-recessed p-2 font-mono text-micro text-text-muted">
						{safeJson(part.output)}
					</pre>
				</details>
			) : null}
		</section>
	);
}

/** A tool result can hold a cycle. Stringifying one throws inside the render. */
function safeJson(value: unknown): string {
	try {
		return JSON.stringify(value, null, 2) ?? String(value);
	} catch {
		return "This result could not be displayed.";
	}
}
