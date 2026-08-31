import type { ReactNode } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "#/ui/tooltip";

/**
 * Wraps a trigger in a tooltip only when its visible label is gone.
 *
 * Lives in its own file rather than in `sidebar.tsx` because the sidebar and
 * the search block both need it, and search was extracted out. Importing it
 * back from `sidebar.tsx` would make the two files circular; a shared leaf
 * makes the dependency a line rather than a loop.
 *
 * An icon alone is not a label, which is why this exists at all: the collapsed
 * rail hides every visible label and the tooltip is what keeps each control
 * nameable.
 */
export function LabelWhenCollapsed({
	collapsed,
	label,
	testId,
	children,
}: {
	collapsed: boolean;
	label: string;
	testId: string;
	children: ReactNode;
}) {
	if (!collapsed) return children;
	return (
		<Tooltip>
			<TooltipTrigger asChild>{children}</TooltipTrigger>
			<TooltipContent data-testid={testId} side="right">
				{label}
			</TooltipContent>
		</Tooltip>
	);
}
