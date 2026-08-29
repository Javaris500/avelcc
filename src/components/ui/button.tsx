import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";

import { cn } from "#/components/cn";

/**
 * Disabled is opacity, never a colour swap — the patch is explicit that "a
 * disabled danger button must stay recognisably danger". A button that stops
 * looking dangerous when disabled has stopped telling the truth about what it
 * would do.
 */
const button = cva(
	[
		"interactive inline-flex items-center justify-center gap-2",
		"rounded-sm font-medium whitespace-nowrap select-none",
		"disabled:pointer-events-none disabled:opacity-[var(--opacity-disabled)]",
	],
	{
		variants: {
			variant: {
				primary: "bg-accent text-bg hover:bg-accent hover:brightness-110",
				secondary:
					"bg-app-raised text-text border border-[var(--elevation-border-rest)]",
				ghost: "bg-transparent text-text-muted hover:text-text",
				danger: "bg-danger text-bg hover:brightness-110",
			},
			size: {
				sm: "h-7 px-2.5 text-sm",
				md: "h-9 px-3.5 text-sm",
			},
		},
		defaultVariants: { variant: "secondary", size: "md" },
	},
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
	VariantProps<typeof button> & {
		/**
		 * Required, not optional. DAY-ONE-FRONTEND: "Every component gets its
		 * data-testid in the same commit. Adding them later means adding them
		 * wrong, and the browser gate ends up selecting on CSS classes that break
		 * the next restyle." The compiler enforces it so nobody has to remember.
		 */
		"data-testid": string;
	};

export function Button({ className, variant, size, ...props }: ButtonProps) {
	return (
		<button className={cn(button({ variant, size }), className)} {...props} />
	);
}
