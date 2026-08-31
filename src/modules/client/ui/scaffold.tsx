import { ChevronRightIcon } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

import { Pill } from "#/ui/badge";
import { Heading, HeadingLevel } from "#/ui/heading";
import { cn } from "#/utils/cn";
import type { SectionBuildState } from "./sections";

/**
 * TEMPORARY. Delete this file when avel-71 lands `src/ui/`.
 *
 * These are stand-ins for `SectionCard` and `DefinitionList`, which are
 * avel-71's to build. They exist so the clients routes can be structured,
 * reviewed and reasoned about before those primitives land, and they are in ONE
 * file on purpose: swapping to the real primitives is then one deletion and one
 * import change, not a hunt through nine call sites.
 *
 * The reason that matters: four sessions each hand-rolling a SectionCard is the
 * specific outcome the work split exists to prevent. A stand-in that is
 * obviously temporary and confined to one file is a different thing from a
 * second implementation quietly becoming permanent — but only while it stays
 * confined. Nothing outside `src/modules/client/ui/` may import from here.
 *
 * `SectionRailShell` WAS HERE AND IS GONE. The operator ruled the sections
 * vertical rather than horizontal, and the rail was the thing making the layout
 * horizontal. Collapse is what made it redundant rather than merely optional: a
 * closed section is one line carrying its title, count and state, so ten
 * stacked ARE the table of contents the rail was drawn to be — and a better
 * one, because a rail item could not say whether the section it pointed at had
 * anything in it. Deleted rather than left unused; two lists of the same ten
 * things is one list too many, and an unreferenced export is a thing the next
 * person has to work out is dead.
 *
 * Deliberately plain otherwise. No hover states, no elevation opinions, no
 * density control. Every design decision is left to the real primitive so that
 * when it lands there is nothing to reconcile.
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
	// `n` is accepted and deliberately NOT destructured. It stays in the props
	// below so the nine call sites keep compiling and the model keeps its
	// ordering, but nothing renders it — see the header comment.
	title,
	blurb,
	state,
	notBuiltReason,
	count,
	action,
	children,
}: {
	id: string;
	/** Kept for the model's ordering. Not rendered. */
	n?: number | null;
	title: string;
	blurb: string;
	state: SectionBuildState;
	notBuiltReason?: string | null;
	count?: number;
	action?: ReactNode;
	children?: ReactNode;
}) {
	/**
	 * OPEN WHERE THERE IS SOMETHING TO SAY, CLOSED WHERE THERE IS NOT.
	 *
	 * The operator's complaint was spacing, and an empty section was spending a
	 * heading plus a paragraph to report that nothing is there. Collapsed it
	 * costs one line and the explanation is one click away.
	 *
	 * This does NOT weaken the three-state rule. The section still renders, so
	 * an absent section is still distinguishable from one you scrolled past, and
	 * `not-built` still reads differently from `empty` once opened. What changes
	 * is how much vertical space a section spends saying "nothing yet".
	 *
	 * Initial state only. Once the operator has opened or closed something, that
	 * is their decision and a re-render must not overrule it.
	 */
	const [open, setOpen] = useState(state === "populated");

	/**
	 * A RAIL LINK MUST OPEN WHAT IT JUMPS TO.
	 *
	 * Nine of the ten rail links point at sections that may be collapsed. Without
	 * this, following one scrolls to a closed row and looks broken — and looks
	 * broken in the specific way that reads as "this app is unfinished" rather
	 * than "that section is empty", because the operator asked to go somewhere
	 * and apparently arrived nowhere.
	 *
	 * Browsers are beginning to auto-expand `<details>` for in-page anchors, but
	 * it is recent and uneven, so this does not rely on it. `hashchange` does not
	 * fire when the hash is set to its current value, which is why the click is
	 * also handled on the rail itself — see `SectionRailShell`.
	 */
	useEffect(() => {
		const openIfTargeted = () => {
			if (window.location.hash === `#${id}`) setOpen(true);
		};
		openIfTargeted();
		window.addEventListener("hashchange", openIfTargeted);
		return () => window.removeEventListener("hashchange", openIfTargeted);
	}, [id]);

	return (
		/*
		 * NATIVE `<details>`, not a button and a panel.
		 *
		 * Keyboard operation, the accessible expanded state and the open/close
		 * behaviour all come from the element. A hand-rolled disclosure would be a
		 * fourth way to draw one in this codebase and the first one whose ARIA is
		 * mine to get wrong.
		 *
		 * NO BORDER AND NO SURFACE OF ITS OWN. These sit INSIDE the detail pane,
		 * which is already `bg-app-panel`, so a card here would be a panel on a
		 * panel — and the operator asked for every divider removed.
		 */
		<details
			className="scroll-mt-16"
			data-build-state={state}
			data-testid={`client-section-${id}`}
			id={id}
			onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
			open={open}
		>
			{/*
			 * THE SUMMARY IS THE HEADING ROW, made pressable. Nothing new to design.
			 *
			 * Sticky, per UI-PLAN polish item 6, and it carries the pane's own
			 * background so scrolling content passes BEHIND it rather than through
			 * it. `list-none` plus the webkit rule removes the default triangle,
			 * which is replaced by a chevron that says the same thing in this app's
			 * own vocabulary.
			 */}
			<summary
				className={cn(
					"sticky top-0 z-10 flex cursor-pointer list-none flex-wrap items-baseline gap-2",
					"bg-app-panel py-2 [&::-webkit-details-marker]:hidden",
				)}
			>
				<ChevronRightIcon
					aria-hidden="true"
					className={cn(
						"size-3.5 shrink-0 self-center text-text-subtle",
						"transition-transform duration-[var(--duration-micro)] ease-[var(--ease-avel)]",
						// The global reduced-motion block is UI-PLAN polish item 2 and has
						// not landed. Until it does, this respects the setting locally
						// rather than waiting for a file that is not mine.
						"motion-reduce:transition-none",
						open && "rotate-90",
					)}
				/>
				{/*
				 * A REAL HEADING AT THE LEVEL THE TREE SAYS, not a hardcoded h2. The
				 * shell header owns the document's only h1, so a section here is an
				 * h2 — and the body below wraps its contents a level deeper.
				 *
				 * A heading inside `<summary>` is valid, and it is what keeps the
				 * page navigable by headings now that the rows are collapsible.
				 */}
				<Heading
					className="font-display text-sm font-semibold tracking-wide uppercase"
					id={`${id}-heading`}
				>
					{title}
				</Heading>
				{/*
				 * A count renders only when there IS one. Zero is a real count and
				 * shows as 0; `undefined` means nobody counted, and printing 0 for
				 * that would be the screen asserting an emptiness it never checked.
				 *
				 * It earns its place twice over now that sections collapse: on a
				 * closed row it is the only thing saying whether opening it is worth
				 * the click.
				 */}
				{count === undefined ? null : (
					<Pill data-testid={`client-section-${id}-count`}>{count}</Pill>
				)}
				{/*
				 * An action inside a `<summary>` toggles the disclosure when clicked,
				 * because the whole summary is the toggle. Stopping propagation here
				 * means a section's own control does what it says instead of also
				 * collapsing the thing it acts on. No section passes one today; this
				 * is the trap set for whoever adds the first.
				 */}
				{action ? (
					// biome-ignore lint/a11y/noStaticElementInteractions: not a control — it exists to stop the summary's toggle swallowing the real control inside it.
					<div
						className="ml-auto"
						onClick={(e) => e.stopPropagation()}
						onKeyDown={(e) => e.stopPropagation()}
					>
						{action}
					</div>
				) : null}
			</summary>

			<HeadingLevel>
				{/*
				 * THE BLURB IS NOT DECORATION. UI-PLAN section 12 rule 5 puts the one
				 * plain sentence that names the jargon on the section header, "rather
				 * than in a glossary nobody opens".
				 *
				 * Collapse moves it one click away, which is the one thing this
				 * ruling costs. It stays inside rather than above the summary
				 * because a closed row has to be one line to be worth closing, and
				 * because the sentence explains the CONTENT — an operator who opens
				 * a section to find out what a roster entry is meets it there.
				 */}
				{/*
				 * 54ch, NOT 68ch, AND THE UNIT IS THE REASON.
				 *
				 * `ch` is the advance of "0", which in this face is 8.2px, while the
				 * average advance of actual lowercase prose at 13px is 5.96px. So a
				 * `ch` constraint yields about 1.38 characters for every unit asked
				 * for: `68ch` was rendering ~94 characters per line, not 68, against
				 * a readable band of 45 to 75.
				 *
				 * Measured on the rendered page three ways rather than converted on
				 * paper — the discrepancy is invisible in the source, where the
				 * number looks like it is already in the right units.
				 */}
				<p className="max-w-[54ch] pt-1 text-sm leading-relaxed text-text-muted">
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
			</HeadingLevel>
		</details>
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
