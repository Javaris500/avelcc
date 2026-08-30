import type { ReactNode } from "react";

import { cn } from "#/utils/cn";

/**
 * The shell header. Presentational and route-agnostic.
 *
 * The complaint it answers was "a divider with nothing on it". The strip read
 * as decorative because every page printed its own title inside the content,
 * leaving the bar above it holding a status pill and a horizontal rule. Moving
 * the `h1` up here is what stops it reading as a divider.
 *
 * NO RULE UNDERNEATH. Panes separate by tone and gap, not by a hairline — a
 * 1px line is what you reach for when two surfaces share a colour, and after
 * the ramp they do not. Where a boundary still needs marking it is a shadow,
 * never a line.
 *
 * FOUR SLOTS, THREE OWNERS. Title, subtitle, definition and the module actions
 * belong to the route. Run state belongs to the shell. The core controls belong
 * to the operator and live in the sidebar footer, not here — see the note on
 * `core` below.
 */
export function PageHeader({
	title,
	breadcrumb,
	subtitle,
	definition,
	actions,
	core,
	className,
}: {
	/** A real h1, in plain words. The page's name, not its route. */
	title: string;
	/**
	 * Only where nesting is REAL, as in Clients > Northwind. A bare "Missions >"
	 * is noise, so this is absent on a top-level route rather than empty.
	 */
	breadcrumb?: ReactNode;
	/** One line of orienting context: counts, status, last activity. */
	subtitle?: ReactNode;
	/**
	 * SEPARATE FROM subtitle, and the separation is the point. Subtitle carries
	 * counts; this carries the one plain sentence that names the jargon on
	 * screen. Two lines, two jobs — collapsing them costs either the counts or
	 * the explanation, and a screen can put five invented nouns in front of an
	 * operator inside one viewport. Requested independently by two sessions,
	 * which is the strongest evidence a slot is real.
	 */
	definition?: ReactNode;
	/** The route's own actions. Changes per page. Empty is a valid state. */
	actions?: ReactNode;
	/**
	 * SHELL-OWNED AND NEVER MOVING. Found by muscle memory, so its position
	 * cannot depend on whether the route supplied actions — which is why the
	 * actions slot below is RESERVED rather than collapsed when empty.
	 */
	core?: ReactNode;
	className?: string;
}) {
	return (
		<header
			className={cn(
				"flex flex-wrap items-start gap-x-4 gap-y-2 px-6 py-3.5",
				className,
			)}
			data-testid="page-header"
		>
			<div className="flex min-w-0 flex-col gap-0.5">
				{breadcrumb ? (
					<nav
						aria-label="Breadcrumb"
						className="flex items-center gap-1.5 text-micro text-text-subtle"
						data-testid="page-breadcrumb"
					>
						{breadcrumb}
					</nav>
				) : null}

				<h1
					className="font-display text-title font-semibold text-text"
					data-testid="page-title"
				>
					{title}
				</h1>

				{subtitle ? (
					<p className="text-sm text-text-muted" data-testid="page-subtitle">
						{subtitle}
					</p>
				) : null}

				{definition ? (
					<p
						className="max-w-[68ch] text-sm leading-relaxed text-text-subtle"
						data-testid="page-definition"
					>
						{definition}
					</p>
				) : null}
			</div>

			{/*
			 * RESERVED, NOT COLLAPSED. `min-h` and the auto margin keep the core
			 * group in the same place whether or not the route supplied actions. A
			 * control that moves between pages cannot be found by muscle memory,
			 * which is the whole reason the core group is fixed.
			 */}
			<div
				className="ml-auto flex shrink-0 flex-wrap items-center gap-2"
				data-testid="page-actions"
			>
				{actions}
				{core}
			</div>
		</header>
	);
}
