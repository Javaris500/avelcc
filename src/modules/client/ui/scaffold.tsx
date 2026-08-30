import type { ReactNode } from "react";

import { cn } from "#/utils/cn";
import type { SectionBuildState } from "./sections";

/**
 * TEMPORARY. Delete this file when avel-71 lands `src/ui/`.
 *
 * These are stand-ins for `SectionCard`, `SectionRail` and `DataTable`, which
 * are avel-71's to build. They exist so the clients routes can be structured,
 * reviewed and reasoned about before those primitives land, and they are all in
 * ONE file on purpose: swapping to the real primitives is then one deletion and
 * one import change, not a hunt through nine call sites.
 *
 * The reason that matters: four sessions each hand-rolling a SectionCard is the
 * specific outcome the work split exists to prevent. A stand-in that is
 * obviously temporary and confined to one file is a different thing from a
 * second implementation quietly becoming permanent — but only while it stays
 * confined. Nothing outside `src/modules/client/ui/` may import from here.
 *
 * Deliberately plain. No hover states, no elevation opinions, no density
 * control. Every design decision is left to the real primitive so that when it
 * lands there is nothing to reconcile.
 */

/**
 * A section on the client page.
 *
 * `state` is the three-way from `sections.ts`, and it is the one piece of this
 * file worth carrying into the real `SectionCard`. `not-built` and `empty` must
 * not render the same, because "we have not asked" and "we asked and there is
 * nothing" are different facts, and only one of them is the operator's problem.
 */
export function SectionShell({
	id,
	n,
	title,
	blurb,
	state,
	notBuiltReason,
	count,
	action,
	children,
}: {
	id: string;
	n: number | null;
	title: string;
	blurb: string;
	state: SectionBuildState;
	notBuiltReason?: string | null;
	count?: number;
	action?: ReactNode;
	children?: ReactNode;
}) {
	return (
		<section
			aria-labelledby={`${id}-heading`}
			/*
			 * NO BORDER AND NO SURFACE OF ITS OWN. These sections sit INSIDE the
			 * detail pane, which is already `bg-app-panel`, so a card here would be
			 * a panel on a panel — and the operator asked for every divider removed.
			 * Separation is gap and the heading's own weight, per that ruling.
			 */
			className="scroll-mt-16"
			data-build-state={state}
			data-testid={`client-section-${id}`}
			id={id}
		>
			{/*
			 * Sticky, per UI-PLAN polish item 6: "sticky SectionCard titles on the
			 * client page, so scrolling through ten sections never loses the label
			 * of the one you are in". On a ten-section page the heading is the only
			 * thing telling you where you are.
			 *
			 * It carries the pane's own background so scrolling content passes
			 * BEHIND it rather than through it. A transparent sticky heading over
			 * moving text is unreadable at exactly the moment it is needed.
			 */}
			<header className="sticky top-0 z-10 flex flex-wrap items-center gap-2 bg-app-panel py-2">
				{n === null ? null : (
					<span className="font-mono text-micro text-text-subtle">{n}</span>
				)}
				<h2
					className="font-display text-sm font-semibold tracking-wide uppercase"
					id={`${id}-heading`}
				>
					{title}
				</h2>
				{/*
				 * A count renders only when there IS one. Zero is a real count and
				 * shows as 0; `undefined` means nobody counted, and printing 0 for
				 * that would be the screen asserting an emptiness it never checked.
				 */}
				{count === undefined ? null : (
					<span
						className="font-mono text-micro text-text-subtle"
						data-testid={`client-section-${id}-count`}
					>
						{count}
					</span>
				)}
				{action ? <div className="ml-auto">{action}</div> : null}
			</header>

			{/*
			 * THE BLURB IS NOT DECORATION. UI-PLAN section 12 rule 5 puts the one
			 * plain sentence that names the jargon on the section header, "rather
			 * than in a glossary nobody opens". For an operator who is not
			 * technical this is the only place `roster entry`, `engagement` or
			 * `cut` is ever defined.
			 */}
			<p className="max-w-[68ch] pt-1 text-sm leading-relaxed text-text-muted">
				{blurb}
			</p>

			{state === "not-built" ? (
				<p
					className="py-3 text-sm text-text-subtle"
					data-testid={`client-section-${id}-not-built`}
				>
					Not built. {notBuiltReason}
				</p>
			) : (
				<div className="py-3">{children}</div>
			)}
		</section>
	);
}

/**
 * The in-page nav. Anchors only — no scroll-spy, no active state.
 *
 * Left out deliberately rather than forgotten: scroll-spy is behaviour the real
 * `SectionRail` should own once, and a version here would be a second one to
 * throw away. Plain anchors already do the job the rail exists for, which is
 * reaching section 9 without scrolling past eight.
 */
export function SectionRailShell({
	items,
	className,
}: {
	items: { id: string; label: string }[];
	className?: string;
}) {
	return (
		<nav
			aria-label="Sections"
			className={cn("flex flex-col gap-1", className)}
			data-testid="client-section-rail"
		>
			{items.map((item) => (
				<a
					className="interactive rounded-sm px-2 py-1 text-sm text-text-muted"
					data-testid={`client-rail-${item.id}`}
					href={`#${item.id}`}
					key={item.id}
				>
					{item.label}
				</a>
			))}
		</nav>
	);
}

/**
 * A label/value pair list. Stand-in for `DefinitionList`.
 *
 * A null value renders as an em dash rather than as blank. Blank looks like a
 * rendering fault; the dash says the field is empty on purpose. Same call
 * `missions.index.tsx` makes for its null columns.
 */
export function DefinitionListShell({
	items,
	testId,
}: {
	items: { label: string; value: ReactNode }[];
	testId: string;
}) {
	return (
		<dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2" data-testid={testId}>
			{items.map((item) => (
				<div className="flex flex-col gap-0.5" key={item.label}>
					<dt className="text-micro text-text-subtle">{item.label}</dt>
					<dd className="text-sm text-text">{item.value ?? "—"}</dd>
				</div>
			))}
		</dl>
	);
}
