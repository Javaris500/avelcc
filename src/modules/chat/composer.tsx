import { ArrowUp, Square } from "lucide-react";
import { type ReactNode, type RefObject, useId } from "react";
import { ModePill } from "#/modules/chat/mode-pill";
import type { ChatModeId } from "#/modules/chat/modes";
import { sendControlFor, shouldSendOnKey } from "#/modules/chat/send-control";
import type { ChatStatus } from "#/modules/chat/types";
import { cn } from "#/utils/cn";

/**
 * The composer. UI-PLAN section 10.
 *
 * IT TAKES `status` AND `onStop` DIRECTLY, because those are what `useChat`
 * returns. When `@ai-sdk/react` lands, wiring this is:
 *
 *   const { status, stop, sendMessage } = useChat({ ... });
 *   <Composer status={status} onStop={stop} onSend={(t) => sendMessage({ text: t })} ... />
 *
 * No adapter, no rename. The component was built against the hook's shape
 * rather than against a shape that would need translating later.
 *
 * WHAT IS NOT HERE, AND WHY. The reference's control row also carries an attach
 * button, a model dropdown and a microphone. None of the three is built, none
 * is decided (UI-PLAN section 14 still has model choice open), and section 12's
 * rule is "never show a control that does not work". The row holds the two
 * controls that do: the permission gate, and send/stop.
 *
 * `@` FOR CONTEXT IS ALSO ABSENT. Section 10 wants it and is right to, since it
 * is what makes a tool call receive a real id rather than a name the model
 * inferred from prose. It needs an entity picker over data nothing on this
 * screen can read yet, so advertising it in the placeholder would promise a
 * feature that does nothing.
 */

export type ComposerProps = {
	value: string;
	onChange: (value: string) => void;
	/** Called with the trimmed text. Never called while the control is blocked. */
	onSend: (text: string) => void;
	/** `useChat().stop`. */
	onStop: () => void;
	/** `useChat().status`. */
	status: ChatStatus;
	mode: ChatModeId;
	onModeChange: (mode: ChatModeId) => void;
	/**
	 * Set while there is nowhere to send to. Printed beside the button, not
	 * hidden in a title attribute.
	 */
	blockedReason?: string;
	textareaRef?: RefObject<HTMLTextAreaElement | null>;
};

export function Composer({
	value,
	onChange,
	onSend,
	onStop,
	status,
	mode,
	onModeChange,
	blockedReason,
	textareaRef,
}: ComposerProps) {
	const labelId = useId();
	const control = sendControlFor({
		status,
		hasText: value.trim() !== "",
		blockedReason,
	});

	const send = () => {
		if (control.kind !== "send" || control.disabled) return;
		onSend(value.trim());
	};

	return (
		<div className="flex flex-col gap-1.5" data-testid="chat-composer">
			<div
				className={cn(
					"flex flex-col gap-2 rounded-md border border-[var(--elevation-border-rest)] bg-app-panel p-2",
					"shadow-e1 transition-colors duration-[var(--duration-state)] ease-[var(--ease-avel)]",
					"focus-within:border-[var(--elevation-border-raised)] motion-reduce:transition-none",
				)}
			>
				<label className="sr-only" htmlFor={labelId}>
					Ask the Command Center
				</label>
				{/*
				  `field-sizing-content` grows the box with the text in CSS. The
				  usual version of this is a ref, a scrollHeight read and a layout
				  write on every keystroke, which is a lot of JavaScript for
				  something the platform now does.
				*/}
				<textarea
					aria-describedby={control.reason ? `${labelId}-reason` : undefined}
					className="app-scroll max-h-48 min-h-16 w-full resize-none bg-transparent px-2 pt-1 text-sm leading-relaxed text-text outline-none placeholder:text-text-subtle field-sizing-content"
					data-testid="chat-input"
					id={labelId}
					onChange={(event) => onChange(event.target.value)}
					onKeyDown={(event) => {
						if (!shouldSendOnKey(event)) return;
						event.preventDefault();
						send();
					}}
					placeholder="Ask the Command Center"
					ref={textareaRef}
					value={value}
				/>

				<div className="flex items-center gap-2">
					<ModePill mode={mode} onChange={onModeChange} />

					<div className="ml-auto flex items-center gap-2">
						<SendStopButton control={control} onSend={send} onStop={onStop} />
					</div>
				</div>
			</div>

			{/*
			  The reason sits under the composer in the reading order, so it is
			  found by someone who has just tried to press the button. Under
			  `aria-describedby` it would also be read out on focus.
			*/}
			{control.reason ? (
				<p
					className="px-1 text-xs leading-relaxed text-text-subtle"
					data-testid="chat-blocked-reason"
					id={`${labelId}-reason`}
				>
					{control.reason}
				</p>
			) : null}
		</div>
	);
}

/**
 * THE ONE MORPH THAT MUST SHIP.
 *
 * "`useChat` returns `status` and `stop()`. The same button is send when
 * `ready` and stop when `streaming`. A stream the operator cannot cancel is a
 * hang, and a hang is indistinguishable from a broken app."
 *
 * Which button it is comes from `sendControlFor`, a pure function with its own
 * test covering all four statuses. This is only the paint.
 *
 * The crossfade is CSS. Both glyphs are stacked in the same box and swap on
 * opacity and scale, driven off `data-kind` on the button, on
 * `--duration-state` and `--ease-avel`. Nothing is imported to do it. UI-PLAN
 * section 11 recommends staying CSS-only for the first cut and revisiting when
 * a morph fails to look right in CSS; a two-glyph crossfade is not that morph.
 */
function SendStopButton({
	control,
	onSend,
	onStop,
}: {
	control: ReturnType<typeof sendControlFor>;
	onSend: () => void;
	onStop: () => void;
}) {
	const isStop = control.kind === "stop";

	return (
		<button
			aria-label={control.label}
			className={cn(
				"group relative inline-flex size-8 shrink-0 items-center justify-center rounded-full",
				"transition-colors duration-[var(--duration-micro)] ease-[var(--ease-avel)] motion-reduce:transition-none",
				"disabled:pointer-events-none disabled:opacity-[var(--opacity-disabled)]",
				isStop
					? "border border-[var(--elevation-border-raised)] bg-app-raised text-text hover:bg-app-float"
					: "bg-primary text-primary-foreground hover:bg-accent-hover",
			)}
			data-kind={control.kind}
			data-testid={control["data-testid"]}
			disabled={control.disabled}
			onClick={isStop ? onStop : onSend}
			type="button"
		>
			<Glyph shown={!isStop}>
				<ArrowUp size={16} strokeWidth={2.4} />
			</Glyph>
			<Glyph shown={isStop}>
				{/* Filled, so stop reads as a hard end rather than an outline. */}
				<Square className="fill-current" size={10} strokeWidth={0} />
			</Glyph>
		</button>
	);
}

/** One layer of the crossfade. Absolute, so neither glyph moves the button. */
function Glyph({ shown, children }: { shown: boolean; children: ReactNode }) {
	return (
		<span
			aria-hidden="true"
			className={cn(
				"absolute inset-0 flex items-center justify-center",
				"transition-[opacity,transform] duration-[var(--duration-state)] ease-[var(--ease-avel)]",
				"motion-reduce:transition-none",
				shown ? "scale-100 opacity-100" : "scale-50 opacity-0",
			)}
		>
			{children}
		</span>
	);
}
