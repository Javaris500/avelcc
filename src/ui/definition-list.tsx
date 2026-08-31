import type { ReactNode } from "react";

import { cn } from "#/utils/cn";

/**
 * Label/value pairs, as a real `<dl>`.
 *
 * Replaces a temporary stand-in that lived in the client module and has since
 * been deleted; see the note in `section-card.tsx` on why neither is named.
 *
 * A `<dl>` rather than a two-column grid of divs because the relationship
 * between a label and its value is the entire content here, and it is the one
 * thing a grid of divs does not carry to anything that is not looking at the
 * screen.
 */

export type Definition = {
	label: string;
	value: ReactNode;
};

export function DefinitionList({
	items,
	testId,
	className,
}: {
	items: Definition[];
	testId: string;
	className?: string;
}) {
	return (
		<dl
			className={cn("grid gap-x-6 gap-y-2 sm:grid-cols-2", className)}
			data-testid={testId}
		>
			{items.map((item) => (
				/*
				 * `<div>` WRAPPING EACH PAIR IS VALID AND IS WHAT KEEPS THEM TOGETHER.
				 * HTML permits a div between `<dl>` and its `<dt>`/`<dd>` precisely so
				 * a pair can be grouped, and without it the grid lays out ten loose
				 * children and a label can end a row while its value starts the next.
				 */
				<div className="flex flex-col gap-0.5" key={item.label}>
					<dt className="text-micro text-text-subtle">{item.label}</dt>
					<dd className="text-sm text-text">{present(item.value)}</dd>
				</div>
			))}
		</dl>
	);
}

/**
 * AN EMPTY FIELD SAYS SO, because blank looks like a rendering fault while a
 * dash says the field is empty on purpose. Same call `missions.index.tsx`
 * makes for its null columns.
 *
 * THE EMPTY STRING IS THE CASE THE STAND-IN MISSED, and it is the one that
 * actually reaches here: `value ?? "—"` catches null and undefined and passes
 * `""` straight through to render as nothing at all — which is the blank the
 * dash exists to prevent, arriving by the route a nullish check cannot see.
 * A trimmed-whitespace string is the same fact wearing a space.
 *
 * `0` and `false` are NOT empty. They are values a field can legitimately
 * hold, so they render, which is why this is an explicit comparison rather
 * than a falsiness test.
 */
function present(value: ReactNode): ReactNode {
	if (value === null || value === undefined) return "—";
	if (typeof value === "string" && value.trim() === "") return "—";
	return value;
}
