import { ArrowUp, Square } from "lucide-react";
import {
	type ReactNode,
	type RefObject,
	useCallback,
	useEffect,
	useId,
	useRef,
	useState,
} from "react";
import {
	composerShapeClasses,
	composerShapeFor,
} from "#/modules/chat/composer-shape";
import { ModePill } from "#/modules/chat/mode-pill";
import type { ChatModeId } from "#/modules/chat/modes";
import {
	sendControlFor,
	shouldSendOnKey,
	statusAnnouncement,
} from "#/modules/chat/send-control";
import type { ChatStatus } from "#/modules/chat/types";
import { cn } from "#/utils/cn";

/**
 * The composer. UI-PLAN section 10, plus the operator's ruling that it is a
 * rounded pill.
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
 * ONE ROW, NOT TWO. The section 10 reference stacks a control row under the
 * text, which is the right shape for a box and the wrong one for a pill: a pill
 * wrapped around two stacked rows reads as a stadium at rest, before anything
 * has been typed. So the text, the mode pill and send sit on one line, and the
 * whole control is one line tall until the text wraps. The radius steps down to
 * a box when it does, which is `composer-shape.ts`.
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
	const { measureRef, shape } = useComposerShape(textareaRef);

	const send = () => {
		if (control.kind !== "send" || control.disabled) return;
		onSend(value.trim());
	};

	return (
		<div className="flex flex-col gap-1.5" data-testid="chat-composer">
			{/*
			  Says out loud what the send/stop swap says visually. Pressing send
			  changes the button under the operator: the glyph crossfades and the
			  accessible name goes from Send to Stop. Someone who cannot see that
			  got silence, and the control they had just pressed had become a
			  different one. `statusAnnouncement` is a pure function with its own
			  tests, and it returns "" at rest so the region does not speak every
			  time the app returns to normal. Raised by avel-a8.
			*/}
			<p aria-live="polite" className="sr-only" data-testid="chat-status-live">
				{statusAnnouncement(status)}
			</p>
			<div
				className={cn(
					"group relative flex gap-2 border border-[var(--elevation-border-rest)] bg-app-panel px-2 py-1.5 shadow-e1",
					// The radius is what animates, so it is named rather than left to
					// `transition-all`. On `--duration-state`, like every other shape
					// change in the shell.
					"transition-[border-radius,border-color] duration-[var(--duration-state)] ease-[var(--ease-avel)]",
					// NO RING ON FOCUS. Operator ruling: no blue border when the
					// composer is focused. The ring was `ring-ring/60`, which is the
					// blue they meant.
					//
					// Focus is still indicated, and by two things rather than none.
					// The border steps to `--elevation-border-raised`, and the accent
					// underglow below lights at full opacity. The glow is the loud
					// half and is the reason dropping the ring is safe rather than a
					// regression: the operator asked for glow explicitly, so the
					// indicator moved onto the thing they wanted instead of the thing
					// they did not. Measured focused rather than assumed.
					"focus-within:border-[var(--elevation-border-raised)]",
					"motion-reduce:transition-none",
					composerShapeClasses(shape),
				)}
				data-shape={shape}
			>
				<label className="sr-only" htmlFor={labelId}>
					Ask the Command Center
				</label>
				{/*
				  `field-sizing-content` grows the box with the text in CSS, and it
				  is also what `composer-shape.ts` measures. The usual version of
				  this is a ref, a scrollHeight read and a layout write on every
				  keystroke, which is a lot of JavaScript for something the platform
				  now does. Firefox and Safari do not support it yet and hold the
				  one-line height, where the control stays a pill.
				*/}
				<textarea
					aria-describedby={control.reason ? `${labelId}-reason` : undefined}
					// Plain `outline-none`, no `!important`. It needed one until
					// `4a39b63` moved `*:focus-visible` into `@layer base`, because
					// an unlayered rule beats a layered utility whatever the
					// specificity. Inside a layer a utility wins normally, so the
					// escape came back out. Verified focused rather than assumed.
					//
					// The global rule is a good default and stays. This control opts
					// out because it supplies its own indicator: the border steps up
					// and the accent underglow lights, neither of which boxes a pill
					// in a rectangle.
					// `max-h-[8lh]`, EIGHT LINES, not `max-h-40`. The cap belongs to
					// the growth this box does, and growth is measured in lines. 40
					// was 160px, which is eight lines only while `--text-sm` is 13px
					// at `leading-relaxed`; move either and the cap silently becomes
					// some other number of lines. `lh` is the line box, so it tracks
					// the type scale on its own. Raised by avel-a8.
					className="app-scroll max-h-[8lh] min-w-0 flex-1 resize-none self-center bg-transparent py-1.5 pl-2 text-sm leading-relaxed text-text outline-none placeholder:text-text-subtle field-sizing-content"
					data-testid="chat-input"
					id={labelId}
					onChange={(event) => onChange(event.target.value)}
					onKeyDown={(event) => {
						if (!shouldSendOnKey(event)) return;
						event.preventDefault();
						send();
					}}
					// NOT the same words as the label. It was "Ask the Command
					// Center" in both, so a screen reader announced the name and then
					// the placeholder and said it twice. The label is the accessible
					// name and stays; the placeholder is free to do work the label
					// cannot, which is naming what the box actually takes. No mention
					// of `@`, which is not built.
					placeholder="Ask about a mission, a client, or a delivery"
					ref={measureRef}
					// TWO, and it only shows where `field-sizing-content` does not.
					// Chrome sizes to content and ignores `rows`, so the pill is one
					// line at rest there. Firefox and Safari have no field-sizing, so
					// `rows` IS the height, and at 1 a long message scrolled inside a
					// single visible line: `max-h-[8lh]` is a ceiling, never a floor.
					// The pill costs nothing on Chrome and the other two stop being
					// unusable for anything long. Raised by avel-a8.
					rows={2}
					value={value}
				/>

				{/*
				  `self-center`, AND THE BUG IT GUARDS DID NOT REPRODUCE. Worth the
				  space because the reasoning is sound and the result is not what it
				  predicts.

				  The row is `flex` with no `items-*`, the textarea sets
				  `self-center`, send sets `self-end`, and the pill set neither — so
				  on paper it inherits `stretch` and grows to the full row. Measured
				  with the box at 132px and the pill's `align-self` forced back to
				  `auto`, it stayed 31px. Chrome does not stretch a `<button>` here.

				  Kept anyway, and not out of superstition: button stretching in flex
				  is historically inconsistent between engines, this app already
				  ships to browsers with no `field-sizing-content`, and I can only
				  measure the one. An explicit alignment costs nothing and states the
				  intent. Predicted by avel-a8, measured here, held for the engines
				  neither of us can see.

				  `self-end`, NOT `self-center`, and that came from looking rather
				  than measuring. Centred, the pill floated 33px above send once the
				  box wrapped, because send is `self-end`. Two controls in one row
				  sitting on different baselines reads as a layout bug. They ride the
				  bottom edge together and the text grows above them.
				*/}
				<ModePill className="self-end" mode={mode} onChange={onModeChange} />
				<SendStopButton control={control} onSend={send} onStop={onStop} />

				{/*
				  THE UNDERGLOW, ON FOCUS. Deliberately the same three layers as
				  the active nav item in `nav/nav-tree.tsx`: a static hairline of
				  accent falling to nothing at both ends, a breathing bloom, and a
				  wider dimmer wash that bleeds past the edge. Built from
				  --color-accent through the same gradient, never a literal, so it
				  follows the theme and survives check-tokens.

				  Copying the technique rather than inventing one is the point. Two
				  glows built independently are two glows that drift, and the shell
				  has exactly one piece of personality.

				  ONE THING FOR THE RECORD, because it is a rule I am bending
				  rather than one I missed. UI-PLAN section 9 says "two glows at
				  once" is what to leave: one accent focal point per screen, and if
				  the composer glows the nav does not. On home the active nav item
				  is Home, so it is lit while this is focused. The reading I am
				  taking is that section 9 is about two AMBIENT glows competing at
				  rest, and this one is transient — it exists only while the
				  operator is in the box, which is also the only moment their
				  attention is here rather than there. If that is wrong the fix is
				  to delete this span; nothing else depends on it.

				  The hairline never animates and every animated layer carries
				  motion-reduce:animate-none, so with motion reduced the focused
				  composer is still lit, just still.
				*/}
				<span
					aria-hidden="true"
					className={cn(
						"pointer-events-none absolute inset-x-0 bottom-0 opacity-0",
						"transition-opacity duration-[var(--duration-state)] ease-[var(--ease-avel)]",
						"group-focus-within:opacity-100 motion-reduce:transition-none",
					)}
					data-testid="chat-composer-underglow"
				>
					<span className="absolute inset-x-6 bottom-0 h-px bg-[linear-gradient(to_right,transparent,var(--color-accent),transparent)]" />
					<span className="absolute inset-x-12 bottom-0 h-2 animate-pulse rounded-full bg-accent opacity-50 blur-md motion-reduce:animate-none" />
					{/*
					  The wash does not animate, so it carries no `motion-reduce`
					  guard. It had one, copied along with the rest of the technique
					  from `nav-tree.tsx`, where it is equally dead. A guard on an
					  element with nothing to guard reads as though reduced motion
					  was considered here, which is exactly the "looks finished"
					  failure one line wide. Reported to the nav's owner.
					*/}
					<span className="-bottom-1 absolute inset-x-24 h-3 rounded-full bg-accent opacity-25 blur-lg" />
				</span>
			</div>

			{/*
			  SCREEN-READER ONLY, NOT DELETED. Operator ruling: the text under the
			  input goes. It stays in the tree because the textarea's
			  `aria-describedby` points at its id, and removing the element would
			  leave that pointing at nothing — which is worse than the visible
			  line, because the disabled send button would then refuse silently
			  with no explanation available to anyone who cannot see it is grey.
			  Caught by avel-a8 reading the file.

			  So: the sighted operator gets a clean composer, and a keyboard or
			  screen-reader user still hears why send will not fire. The reason
			  itself is unchanged and still comes from `sendControlFor`.
			*/}
			{control.reason ? (
				<p
					className="sr-only"
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
 * Measures the textarea so the composer knows whether it is still one line.
 *
 * A `ResizeObserver` rather than a keystroke handler, because the height
 * changes for reasons that are not keystrokes: a paste, a window resize that
 * rewraps the text, a font loading late. Counting newlines in the value would
 * miss every soft wrap, which is most of them.
 *
 * The baseline is whatever the element measures the first time it has a real
 * height. The box is empty then, so that measurement IS one line, and taking it
 * rather than hardcoding it means a change to the type scale cannot strand it.
 */
function useComposerShape(external?: RefObject<HTMLTextAreaElement | null>) {
	const element = useRef<HTMLTextAreaElement | null>(null);
	const oneLine = useRef(0);
	const [height, setHeight] = useState(0);

	const measureRef = useCallback(
		(node: HTMLTextAreaElement | null) => {
			element.current = node;
			// Kept in sync so the caller can still focus it, which is what the
			// suggestions do.
			if (external) external.current = node;
		},
		[external],
	);

	useEffect(() => {
		const el = element.current;
		// Undefined in a non-browser render and in older Safari. Without it the
		// shape stays a pill, which is the resting shape anyway.
		if (!el || typeof ResizeObserver === "undefined") return;

		const observer = new ResizeObserver(() => {
			const next = el.getBoundingClientRect().height;
			// A zero height means the element is not laid out yet: a drawer that
			// has not opened, a pane still display:none. Recording that as the
			// baseline would make every later height read as wrapped.
			if (oneLine.current === 0 && next > 0) oneLine.current = next;
			setHeight(next);
		});
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	return {
		measureRef,
		shape: composerShapeFor({ height, oneLine: oneLine.current }),
	};
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
 * opacity and scale, on `--duration-state` and `--ease-avel`. Nothing is
 * imported to do it. UI-PLAN section 11 recommends staying CSS-only for the
 * first cut and revisiting when a morph fails to look right in CSS; a two-glyph
 * crossfade is not that morph.
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

	// Stop is RECESSED, not raised. In light mode `app-raised` resolves to the
	// same white as `app-panel`, which is the composer it sits inside, so a
	// raised stop button would have no edge of its own in exactly the theme and
	// exactly the moment the operator most needs to find it. Recessed separates
	// downward, which is the one direction light mode still has.
	return (
		<button
			aria-label={control.label}
			// `aria-disabled`, NOT `disabled`. A disabled button cannot be focused,
			// so it drops out of the tab order — and this is the control a keyboard
			// user reaches for when nothing happened and they want to know why.
			// Taking it out of the tab order undoes the blocked reason we just
			// wired to it. `aria-disabled` keeps it reachable and announced as
			// unavailable; `send()` already refuses on `control.disabled`, so the
			// click is still inert. Raised by avel-a8.
			aria-disabled={control.disabled}
			className={cn(
				"relative inline-flex shrink-0 items-center justify-center self-end rounded-full",
				// 32px on a pointer, 44px on touch. `ModePill` and the nav drawer
				// trigger already meet the 44px target, so the SECONDARY control
				// and the nav button cleared a bar the primary one did not. The
				// number is taken from what is already in the app rather than
				// invented.
				"size-8 max-md:size-11",
				"transition-colors duration-[var(--duration-micro)] ease-[var(--ease-avel)] motion-reduce:transition-none",
				// Keyed off aria-disabled now, since the native pseudo-class no
				// longer fires. `cursor-default` replaces the pointer block: the
				// element must stay hit-testable to be focusable and announceable.
				"aria-disabled:cursor-default aria-disabled:opacity-[var(--opacity-disabled)]",
				isStop
					? "border border-[var(--elevation-border-raised)] bg-app-recessed text-text"
					: "bg-primary text-primary-foreground not-aria-disabled:hover:bg-accent-hover",
			)}
			data-kind={control.kind}
			data-testid={control["data-testid"]}
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
