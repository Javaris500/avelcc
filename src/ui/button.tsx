import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";

import { cn } from "#/utils/cn.ts";

/**
 * shadcn's button, modified ONCE at generation. Three deliberate departures,
 * each recorded so nobody "restores" it to stock.
 *
 * 1. VARIANTS ARE OURS. default/destructive/outline/link are replaced by
 *    primary/secondary/ghost/danger. The variant list is the component's API;
 *    a className that changes colour or weight is an undocumented variant.
 *
 * 2. EVERY `dark:` UTILITY IS REMOVED. shadcn assumes Tailwind's `dark` class
 *    strategy. This app puts `.light` on the shell wrapper with dark as the
 *    default and NO `dark` class anywhere, so every dark: rule shadcn ships is
 *    dead code that reads as though it works. Both themes resolve through the
 *    token aliases instead.
 *
 * 3. DANGER IS OUTLINED, NEVER FILLED. A filled red button attracts the click
 *    it exists to discourage. Revoking a connection is the largest real risk
 *    surface in this product.
 */
const buttonVariants = cva(
	[
		"inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap",
		"rounded-sm font-medium transition-all outline-none",
		"focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
		"aria-invalid:border-destructive aria-invalid:ring-destructive/20",
		// Disabled is opacity and a real pointer block, never a colour swap: a
		// disabled danger button must stay recognisably danger.
		"disabled:pointer-events-none disabled:opacity-[var(--opacity-disabled)]",
		"[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
	],
	{
		variants: {
			variant: {
				primary: "bg-primary text-primary-foreground hover:bg-accent-hover",
				secondary:
					"border border-border-strong bg-secondary text-secondary-foreground hover:bg-accent-surface",
				ghost:
					"text-muted-foreground hover:bg-accent-surface hover:text-foreground",
				danger:
					"border border-destructive text-destructive hover:bg-destructive/10",
			},
			size: {
				sm: "h-8 px-3 text-xs",
				md: "h-9 px-4 text-sm",
				icon: "size-9",
			},
		},
		defaultVariants: { variant: "secondary", size: "md" },
	},
);

export type ButtonProps = React.ComponentProps<"button"> &
	VariantProps<typeof buttonVariants> & {
		asChild?: boolean;
		/**
		 * Required, not optional. "Every component gets its data-testid in the
		 * same commit. Adding them later means adding them wrong, and the browser
		 * gate ends up selecting on CSS classes that break the next restyle."
		 * The compiler enforces it so nobody has to remember.
		 */
		"data-testid": string;
	};

export function Button({
	className,
	variant,
	size,
	asChild = false,
	...props
}: ButtonProps) {
	const Comp = asChild ? Slot.Root : "button";
	return (
		<Comp
			className={cn(buttonVariants({ variant, size }), className)}
			data-slot="button"
			data-variant={variant ?? "secondary"}
			{...props}
		/>
	);
}

export { buttonVariants };
