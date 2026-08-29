import type { HTMLAttributes } from "react";

import { cn } from "#/utils/cn.ts";

/**
 * shadcn's skeleton, modified once at generation.
 *
 * Stock uses `animate-pulse` and `bg-accent`. Both are wrong here: --color-skeleton
 * is its own token precisely because "verification can run for an hour" and a
 * skeleton sharing the hover surface does not read as loading. The `skeleton`
 * utility in globals-patch.css carries the brand's own pulse timing.
 *
 * The helpers below are the reason this file is not stock. DAY-ONE-FRONTEND:
 * "Content-shaped skeletons, never a spinner." A skeleton without the shape of
 * the thing it stands in for teaches nothing, and the layout jumps on resolve.
 */
export function Skeleton({
	className,
	...props
}: HTMLAttributes<HTMLDivElement>) {
	return (
		<div
			aria-hidden="true"
			className={cn("skeleton", className)}
			data-slot="skeleton"
			data-testid="skeleton"
			{...props}
		/>
	);
}

/** One line of text. Width is a caller concern, so it takes a class. */
export function SkeletonLine({ className }: { className?: string }) {
	return <Skeleton className={cn("h-[0.9em] w-full", className)} />;
}

/** A list row: leading glyph, wide label, trailing value. */
export function SkeletonRow({ className }: { className?: string }) {
	return (
		<div
			className={cn(
				"flex items-center gap-3 py-[var(--row-pad,12px)]",
				className,
			)}
			data-testid="skeleton-row"
		>
			<Skeleton className="size-4 shrink-0" />
			<SkeletonLine className="max-w-[18ch]" />
			<SkeletonLine className="ml-auto max-w-[8ch]" />
		</div>
	);
}

/** N rows, for a list whose length is not knowable yet. */
export function SkeletonRows({ count = 5 }: { count?: number }) {
	return (
		<div data-testid="skeleton-rows">
			{Array.from({ length: count }, (_, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: placeholders are positional and never reorder
				<SkeletonRow key={i} />
			))}
		</div>
	);
}
