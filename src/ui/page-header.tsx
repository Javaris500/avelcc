import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import type { PageAction } from "#/modules/shell/use-page-header";
import { Button } from "#/ui/button";

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
	subtitle?: string;
	/**
	 * SEPARATE FROM subtitle, and the separation is the point. Subtitle carries
	 * counts; this carries the one plain sentence that names the jargon on
	 * screen. Two lines, two jobs — collapsing them costs either the counts or
	 * the explanation, and a screen can put five invented nouns in front of an
	 * operator inside one viewport. Requested independently by two sessions,
	 * which is the strongest evidence a slot is real.
	 */
	definition?: string;
	/**
	 * The route's own actions, as DATA. The header builds the controls, so a
	 * route never constructs an element and cannot hand the shell a value whose
	 * identity changes every render. See PageAction.
	 */
	actions?: PageAction[];
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
			{/* min-w-0 lets the column shrink; without it a long title keeps its
			    intrinsic width, the flex row overflows, and `flex-wrap` drops the
			    core group onto a second line where `ml-auto` shoves it hard right.
			    The title truncates instead. */}
			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
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
					className="truncate font-display text-title font-semibold text-text"
					// DISTINCT FROM the routes' own in-content h1, which still exists
					// on every page. Sharing `page-title` gave two elements one id and
					// made every selector ambiguous — the same duplicate-testid defect
					// this codebase already fixed once in the violations list.
					data-testid="page-header-title"
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
			 * RESERVED, NOT COLLAPSED — and it now actually is.
			 *
			 * This comment promised that "`min-h` and the auto margin keep the core
			 * group in the same place", and `min-h` appeared NOWHERE in the file
			 * except in the sentence claiming it. The only thing holding the group
			 * was `ml-auto`, which fixes the horizontal position and says nothing
			 * about the vertical one — so the run pill rode up and down with
			 * whatever the title block happened to contain.
			 *
			 * `min-h-8` is the pill's own height, so the row keeps its box whether
			 * or not the route supplied actions. A control that moves between pages
			 * cannot be found by muscle memory, which is the whole reason the core
			 * group is fixed.
			 *
			 * `items-start` rather than `items-center`: the parent aligns to the top
			 * and the title block grows DOWNWARD as a subtitle or definition
			 * appears. Centring here would float the pill against a tall block and
			 * put it level with the subtitle on one page and the title on the next.
			 */}
			<div
				className="ml-auto flex min-h-8 shrink-0 flex-wrap items-start gap-2"
				data-testid="page-actions"
			>
				{actions?.map((action) => (
					<PageActionButton action={action} key={action.label} />
				))}
				{core}
			</div>
		</header>
	);
}

/**
 * One descriptor, one control. A `to` renders a link and an `onClick` renders a
 * button; a descriptor carrying both is a programming error rather than a
 * runtime branch, so the link wins and the handler is ignored.
 */
function PageActionButton({ action }: { action: PageAction }) {
	const testId = action.testId ?? `page-action-${action.label}`;

	/**
	 * A DISABLED ACTION SAYS WHY. Rendered as a real disabled button carrying
	 * the reason, rather than hidden — an operator who cannot find a control
	 * cannot learn that it exists and what it waits on. Disabled BY STATE, never
	 * by styling, which is the same rule the pre-flight deliver button follows.
	 * A `to` is ignored while disabled: a link cannot be disabled in HTML, and
	 * rendering one anyway would leave it clickable.
	 */
	if (action.disabled) {
		return (
			<Button
				data-testid={testId}
				disabled
				title={action.disabledReason}
				variant={action.variant ?? "secondary"}
			>
				{action.label}
			</Button>
		);
	}

	if (action.to) {
		return (
			<Button
				asChild
				data-testid={testId}
				variant={action.variant ?? "secondary"}
			>
				<Link to={action.to}>{action.label}</Link>
			</Button>
		);
	}
	return (
		<Button
			data-testid={testId}
			onClick={action.onClick}
			variant={action.variant ?? "secondary"}
		>
			{action.label}
		</Button>
	);
}
