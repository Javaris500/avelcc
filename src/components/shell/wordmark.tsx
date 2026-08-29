import { cn } from "#/components/cn";

/**
 * `avel.` — lowercase, Space Grotesk 700, -0.02em. LOGO-BRIEF: "We already
 * have a wordmark. Do not redesign it."
 *
 * The period carries the one signature animation. The patch is explicit:
 * "Use once per page, never adjacent to another animated element."
 */
export function Wordmark({ className }: { className?: string }) {
	return (
		<span
			className={cn(
				"font-display text-[17px] font-bold tracking-[var(--tracking-wordmark)] text-text",
				className,
			)}
			data-testid="wordmark"
		>
			avel
			<span aria-hidden="true" className="animate-period text-accent">
				.
			</span>
		</span>
	);
}
