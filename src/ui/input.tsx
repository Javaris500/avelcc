import type * as React from "react";

import { cn } from "#/utils/cn.ts";

/**
 * shadcn's input, modified once at generation.
 *   - every `dark:` utility removed; this app has no `dark` class
 *   - data-testid required, same reasoning as Button
 *   - :user-invalid, not :invalid. A required empty field is invalid from the
 *     moment it renders, and colouring it red before the operator has typed
 *     punishes them for not having started.
 */
export type InputProps = React.ComponentProps<"input"> & {
	"data-testid": string;
};

export function Input({ className, type, ...props }: InputProps) {
	return (
		<input
			className={cn(
				"flex h-9 w-full min-w-0 rounded-xs border border-input bg-muted px-2.5 py-1 text-sm",
				"placeholder:text-muted-foreground transition-[color,box-shadow] outline-none",
				"file:inline-flex file:border-0 file:bg-transparent file:text-sm file:font-medium",
				"focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
				"user-invalid:border-destructive user-invalid:ring-destructive/20",
				"disabled:pointer-events-none disabled:opacity-[var(--opacity-disabled)]",
				className,
			)}
			data-slot="input"
			type={type}
			{...props}
		/>
	);
}
