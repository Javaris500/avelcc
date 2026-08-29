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
 * The ring mark beside the wordmark. Reference `.brand .logo`: a 22px ring in
 * the text colour with a filled core, drawn from the border and a pseudo
 * element. Rendered here as two nested elements rather than `::after`, which
 * Tailwind cannot express without arbitrary-variant escapes.
 */
export function BrandMark() {
	return (
		<span
			aria-hidden="true"
			className="relative size-[22px] shrink-0 rounded-full border-[1.5px] border-text"
			data-testid="brand-mark"
		>
			<span className="absolute inset-[5px] rounded-full bg-text" />
		</span>
	);
}
