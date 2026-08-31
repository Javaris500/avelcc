import { cn } from "#/utils/cn";

/**
 * `avel.` — lowercase, Space Grotesk 700, -0.02em. LOGO-BRIEF: "We already
 * have a wordmark. Do not redesign it."
 *
 * 15px matches the reference's `.brand .nm`. The period takes `--accent-text`
 * rather than `--accent`: they are the same #0092ca in dark, but light shifts
 * accent-text to #0078ab for contrast, and the period would otherwise fail on
 * white.
 *
 * The period carries the one signature animation. The patch is explicit:
 * "Use once per page, never adjacent to another animated element."
 */
export function Wordmark({ className }: { className?: string }) {
	return (
		<span
			className={cn(
				"font-display text-lg font-bold tracking-[var(--tracking-wordmark)] text-text",
				className,
			)}
			data-testid="wordmark"
		>
			avel
			<span aria-hidden="true" className="animate-period text-accent-text">
				.
			</span>
		</span>
	);
}

/**
 * `A.` — the monogram, per the operator's selected logo system: **3a, bare
 * monogram.** "Type, unhoused. Lightest in the sidebar, and the period reads as
 * the same stop as the wordmark's."
 *
 * WAS A RING — a 22px circle with a filled core, from the reference's
 * `.brand .logo`. The selected system is a letterform, and "unhoused" is the
 * operative word: no ring, no plate, no container. The mark is type.
 *
 * THE PERIOD IS THE SAME STOP AS THE WORDMARK'S, which is why it takes
 * `--accent-text` rather than `--accent`. They are the same #0092ca in dark;
 * light shifts accent-text to #0078ab for contrast, and a period on the accent
 * value would fail against white. Two marks, one stop, one token.
 *
 * AND IT DOES NOT ANIMATE, deliberately. The wordmark's period carries the
 * one signature animation, and the patch is explicit that it is used "once per
 * page, never adjacent to another animated element" — this sits directly
 * beside it. Two blinking stops in one lockup would spend the signature twice
 * and read as a fault rather than a flourish.
 *
 * The default 22px box is the ring's old footprint, kept so the collapsed rail
 * and the expanded sidebar align on the same axis. Collapsed, this is the only
 * brand element rendered, so it is also the rail's whole identity.
 *
 * `className` exists for one caller: the login page, where the sheet's STACKED
 * lockup puts the monogram above the wordmark at roughly twice its size. Size
 * is the only thing a caller may change — the letterform, the stop and its
 * token are the mark.
 */
export function BrandMark({ className }: { className?: string }) {
	return (
		<span
			aria-hidden="true"
			/*
			 * NOT a flex container. `flex` made the letter and the period separate
			 * flex items — no kerning between them, and `innerText` returned the
			 * letter and the stop on separate lines, because they were laid out as
			 * siblings rather than as a word.
			 * The selected system is TYPE; it has to flow as type.
			 */
			className={cn(
				"inline-block w-[22px] shrink-0 text-center font-display text-lg font-bold leading-[22px] tracking-[var(--tracking-wordmark)] text-text",
				className,
			)}
			data-testid="brand-mark"
		>
			A<span className="text-accent-text">.</span>
		</span>
	);
}
