import { cva, type VariantProps } from "class-variance-authority";
import type { ReactNode } from "react";

import { cn } from "#/components/cn";

/**
 * Gate and diff states are rendered as triples (fill, soft background, line),
 * never a bare hue. The patch's reasoning: "A single hue forces whoever builds
 * the component to invent a background, and invented backgrounds are how
 * contrast breaks."
 *
 * pending and stale are neutral by design, not by omission.
 */
const badge = cva(
	"inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[12px] font-medium leading-none",
	{
		variants: {
			tone: {
				pass: "text-gate-pass bg-gate-pass-soft border-gate-pass-line",
				block: "text-gate-block bg-gate-block-soft border-gate-block-line",
				warn: "text-gate-warn bg-gate-warn-soft border-gate-warn-line",
				pending: "text-gate-pending bg-gate-pending-soft border-transparent",
				stale: "text-gate-stale bg-gate-stale-soft border-transparent",
				neutral: "text-text-muted bg-app-raised border-transparent",
			},
		},
		defaultVariants: { tone: "neutral" },
	},
);

/**
 * The glyph carries the state for anyone who cannot separate the hues, so the
 * shapes are deliberately distinct rather than the same dot in five colours.
 */
const GLYPH: Record<NonNullable<VariantProps<typeof badge>["tone"]>, string> = {
	pass: "✓",
	block: "✕",
	warn: "⚠",
	pending: "·",
	stale: "◦",
	neutral: "",
};

export type StatusBadgeProps = VariantProps<typeof badge> & {
	children: ReactNode;
	className?: string;
	/** Set false only where the text alone already names the state. */
	glyph?: boolean;
	"data-testid": string;
};

export function StatusBadge({
	tone,
	children,
	className,
	glyph = true,
	...props
}: StatusBadgeProps) {
	const mark = GLYPH[tone ?? "neutral"];
	return (
		<span className={cn(badge({ tone }), className)} {...props}>
			{glyph && mark ? (
				<span aria-hidden="true" className="font-mono">
					{mark}
				</span>
			) : null}
			{children}
		</span>
	);
}

/** A pill is a badge with no state — a count, a label, a filter chip. */
export function Pill({
	children,
	className,
	...props
}: {
	children: ReactNode;
	className?: string;
	"data-testid": string;
}) {
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1.5 rounded-full bg-app-raised px-2.5 py-0.5",
				"text-[12px] leading-none text-text-muted",
				className,
			)}
			{...props}
		>
			{children}
		</span>
	);
}

/** A tag is square-cornered and monospaced: slugs, paths, refs, hashes. */
export function Tag({
	children,
	className,
	...props
}: {
	children: ReactNode;
	className?: string;
	"data-testid": string;
}) {
	return (
		<span
			className={cn(
				"inline-flex items-center rounded-xs bg-app-recessed px-1.5 py-0.5",
				"font-mono text-[12px] leading-none text-text-muted",
				className,
			)}
			{...props}
		>
			{children}
		</span>
	);
}
