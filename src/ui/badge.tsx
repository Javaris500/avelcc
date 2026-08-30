import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";

import { cn } from "#/utils/cn.ts";

/**
 * Gate and diff status, on shadcn's badge base.
 *
 * Tones are TRIPLES — fill, soft background, line — never a bare hue. The
 * patch's reasoning: "A single hue forces whoever builds the component to
 * invent a background, and invented backgrounds are how contrast breaks."
 *
 * pending and stale are neutral by design, not by omission: the brand rule is
 * one chromatic colour, and a blue "pending" would collide with the cyan on
 * exactly the screen where that matters most.
 */
const badgeVariants = cva(
	[
		"inline-flex w-fit shrink-0 items-center justify-center gap-1.5 whitespace-nowrap",
		"rounded-full border px-2 py-0.5 text-micro font-medium",
		"focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
		"[&>svg]:pointer-events-none [&>svg]:size-3",
	],
	{
		variants: {
			tone: {
				pass: "border-gate-pass-line bg-gate-pass-soft text-gate-pass",
				block: "border-gate-block-line bg-gate-block-soft text-gate-block",
				warn: "border-gate-warn-line bg-gate-warn-soft text-gate-warn",
				pending: "border-transparent bg-gate-pending-soft text-gate-pending",
				stale: "border-transparent bg-gate-stale-soft text-gate-stale",
				neutral: "border-transparent bg-secondary text-muted-foreground",
			},
		},
		defaultVariants: { tone: "neutral" },
	},
);

type Tone = NonNullable<VariantProps<typeof badgeVariants>["tone"]>;

/**
 * The glyph carries the state for anyone who cannot separate the hues, so the
 * shapes are deliberately distinct rather than one dot in five colours.
 * "Icons never carry meaning alone" — every state has glyph AND label AND
 * colour.
 */
const GLYPH: Record<Tone, string> = {
	pass: "✓",
	block: "✕",
	warn: "⚠",
	pending: "·",
	stale: "◦",
	neutral: "",
};

export type StatusBadgeProps = React.ComponentProps<"span"> &
	VariantProps<typeof badgeVariants> & {
		asChild?: boolean;
		/** Set false only where the text alone already names the state. */
		glyph?: boolean;
		"data-testid": string;
	};

export function StatusBadge({
	className,
	tone,
	glyph = true,
	asChild = false,
	children,
	...props
}: StatusBadgeProps) {
	const Comp = asChild ? Slot.Root : "span";
	const mark = GLYPH[tone ?? "neutral"];
	return (
		<Comp
			className={cn(badgeVariants({ tone }), className)}
			data-slot="badge"
			data-tone={tone ?? "neutral"}
			{...props}
		>
			{glyph && mark ? (
				<span aria-hidden="true" className="font-mono">
					{mark}
				</span>
			) : null}
			{children}
		</Comp>
	);
}

/** A pill is a badge with no state: a count, a label, a filter chip. */
export function Pill({
	className,
	children,
	...props
}: React.ComponentProps<"span"> & { "data-testid": string }) {
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-0.5",
				"text-micro text-muted-foreground",
				className,
			)}
			{...props}
		>
			{children}
		</span>
	);
}

/**
 * A tag is square-cornered and monospaced: slugs, paths, refs, hashes.
 *
 * ITS FILL IS DERIVED FROM THE TEXT COLOUR, NOT FROM A SURFACE TOKEN, and that
 * is the only way one value is right in both themes.
 *
 * It was `bg-muted`, which resolves to app-recessed — the WELL tone, tuned for
 * inputs and code blocks that sit BELOW the page. A chip sits ON a panel, and
 * in dark that put it at L* 8.2 against a panel at 16.6: 8.4 L* below its own
 * surface, reading as a black hole rather than a label. Measured on the
 * missions list, rgb(22,24,29) on rgb(36,41,53).
 *
 * The token could not simply be changed: `bg-muted` also backs `input.tsx` and
 * the catalog's `<pre>` blocks, which genuinely ARE wells and want that tone.
 * One token, two jobs.
 *
 * `color-mix` with `--color-text` solves it without a new token. Text is light
 * in dark and dark in light, so a 10% mix lifts on a dark panel and darkens on
 * a white one — the elevation rule this app already follows, falling out of the
 * theme rather than being restated per theme.
 */
export function Tag({
	className,
	children,
	...props
}: React.ComponentProps<"span"> & { "data-testid": string }) {
	return (
		<span
			className={cn(
				"inline-flex items-center rounded-xs px-1.5 py-0.5",
				"bg-[color-mix(in_oklab,var(--color-text)_10%,transparent)]",
				"font-mono text-micro text-muted-foreground",
				className,
			)}
			{...props}
		>
			{children}
		</span>
	);
}

export { badgeVariants };
