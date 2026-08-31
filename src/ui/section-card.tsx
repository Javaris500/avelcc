import { ChevronRightIcon } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

import { Pill } from "#/ui/badge";
import { Heading, HeadingLevel } from "#/ui/heading";
import { NotBuilt } from "#/ui/states";
import { cn } from "#/utils/cn";

/**
 * A collapsible section on a long page.
 *
 * Replaces a temporary stand-in that lived in the client module and has since
 * been deleted. Nearly all of the design below is that stand-in's, carried
 * over rather than re-decided — the three-state union, the native `<details>`,
 * the heading inside the summary and the deep-link effect are avel-c2's, and
 * re-deriving them would have produced a second spelling of answers that were
 * already right.
 *
 * IT IS NO LONGER NAMED HERE, and that is the point rather than vagueness.
 * This used to name the stand-in and its file, which was useful for exactly as
 * long as it took avel-c2 to do the swap — that swap deleted both, and
 * `commentSymbols.test.ts` had the dead names inside the hour. An allowlist
 * entry would have preserved a pointer at something no reader can open. The
 * credit and the reasoning are what survive the thing they refer to.
 *
 * Naming it even to explain its absence puts it back: my first rewrite quoted
 * the old sentence verbatim, backticks included, and the checker failed again
 * on the one symbol the paragraph exists to stop citing.
 *
 * WHAT IS NOT CARRIED OVER, and why, since a diff during a swap is where a
 * silent change hides:
 *
 *   `n`      accepted and never rendered. The stand-in kept it so its call
 *            sites would compile; a new primitive taking a prop that does
 *            nothing is dead weight from the first commit.
 *   testids  derived from a required `testId` rather than hardcoding a
 *            `client-section-` prefix. Nothing in `src/ui/` may know what a
 *            client is.
 *   blurb    optional here. It is required by the CLIENT page's model, which
 *            is where that rule belongs; a section elsewhere need not define
 *            jargon it does not use.
 */

/**
 * THREE STATES, NOT TWO, and the type is what enforces the third.
 *
 *   not-built  no query exists. We do not know whether there is anything here.
 *   empty      a query ran and returned nothing. We know there is nothing.
 *   populated  there is something here.
 *
 * A section printing "Nothing yet" when nothing ever asked the database is a
 * screen inventing a fact, and it is indistinguishable from a working one.
 *
 * The union is the mechanism. A `not-built` section CANNOT be written without
 * saying what is missing, and a built one cannot carry a stale reason left
 * over from when it was not. The second direction is the one that actually
 * rots: a required field only stops a reason being MISSING, and this codebase
 * loses to reasons that are still present and no longer true.
 */
export type SectionBuild = "not-built" | "empty" | "populated";

type SectionCardProps = {
	/** The anchor. Used as the DOM id and as the target of `#id` deep links. */
	id: string;
	title: string;
	/**
	 * One plain sentence under the heading, naming any jargon in the section at
	 * its first encounter rather than in a glossary nobody opens.
	 */
	blurb?: string;
	/**
	 * Rendered only when there IS one. Zero is a real count and shows as 0;
	 * `undefined` means nobody counted, and printing 0 for that would be the
	 * screen asserting an emptiness it never checked.
	 */
	count?: number;
	action?: ReactNode;
	/** Sub-testids derive from this: `${testId}-count`, `${testId}-not-built`. */
	testId: string;
	className?: string;
} /*
 * Both arms derive from `SectionBuild` rather than restating its members. A
 * fourth state would land in the body-rendering arm automatically, which is
 * the safe default — and if that is wrong for it, the change fails here
 * instead of widening in silence.
 */ & (
	| {
			state: Extract<SectionBuild, "not-built">;
			notBuiltReason: string;
			children?: never;
	  }
	| {
			state: Exclude<SectionBuild, "not-built">;
			notBuiltReason?: never;
			children?: ReactNode;
	  }
);

export function SectionCard(props: SectionCardProps) {
	const { id, title, blurb, count, action, testId, className } = props;
	const state = props.state;
	// `children` exists only on the states that render a body. The union makes
	// that structural rather than conventional.
	const children = props.state === "not-built" ? undefined : props.children;

	/**
	 * OPEN WHERE THERE IS SOMETHING TO SAY, CLOSED WHERE THERE IS NOT.
	 *
	 * An empty section spending a heading plus a paragraph to report that
	 * nothing is there was the spacing complaint. Closed it costs one line and
	 * the explanation is one click away.
	 *
	 * This does not weaken the three-state rule: the section still renders, so
	 * an absent one is still distinguishable from one you scrolled past, and
	 * `not-built` still reads differently from `empty` once opened.
	 *
	 * Initial state only. Once the operator has opened or closed something that
	 * is their decision, and a re-render must not overrule it.
	 */
	const [open, setOpen] = useState(state === "populated");

	/**
	 * A DEEP LINK MUST OPEN WHAT IT POINTS AT, INCLUDING THE SECOND TIME.
	 *
	 * A URL carrying `#cost` — bookmarked, pasted, arrived at with the back
	 * button — targets a section that may be closed. Landing on a collapsed row
	 * reads as "this app is unfinished" rather than "that section is empty":
	 * the operator asked to go somewhere and apparently arrived nowhere.
	 *
	 * TWO EVENTS, AND THE SECOND IS THE TRAP. `hashchange` covers the first
	 * arrival. It does NOT fire when the hash is already `#cost` and the
	 * operator clicks a `#cost` link again — which is precisely the case that
	 * matters, because between the two clicks they may have closed the section
	 * by hand. A listener on `hashchange` alone works perfectly in testing and
	 * fails the moment anyone uses the same link twice.
	 *
	 * So a capture-phase click listener handles the same-hash case: resolve
	 * whatever anchor was clicked against the current URL, and open if it
	 * points at this section on this page. Capture, because a handler on the
	 * anchor may call `preventDefault` and never let it bubble.
	 *
	 * Browsers are beginning to auto-expand `<details>` for in-page anchors,
	 * but it is recent and uneven, so none of this relies on it.
	 */
	useEffect(() => {
		const openIfTargeted = () => {
			if (window.location.hash === `#${id}`) setOpen(true);
		};
		openIfTargeted();

		const openIfAnchored = (event: MouseEvent) => {
			const anchor = (event.target as Element | null)?.closest?.("a[href]");
			if (!(anchor instanceof HTMLAnchorElement)) return;
			// Resolved through the URL parser rather than string-matched, so a
			// relative href, an absolute one and a bare "#cost" all answer the same
			// question: does this land on this section of this page?
			const url = new URL(anchor.href, window.location.href);
			if (url.pathname !== window.location.pathname) return;
			if (url.hash !== `#${id}`) return;
			setOpen(true);
		};

		window.addEventListener("hashchange", openIfTargeted);
		document.addEventListener("click", openIfAnchored, true);
		return () => {
			window.removeEventListener("hashchange", openIfTargeted);
			document.removeEventListener("click", openIfAnchored, true);
		};
	}, [id]);

	return (
		/*
		 * NATIVE `<details>`, not a button and a panel. Keyboard operation, the
		 * accessible expanded state and the open/close behaviour all come from the
		 * element. A hand-rolled disclosure would be a fourth way to draw one in
		 * this codebase and the first whose ARIA is ours to get wrong.
		 *
		 * NO BORDER AND NO SURFACE OF ITS OWN. These sit inside a pane that is
		 * already `bg-app-panel`, so a card here would be a panel on a panel.
		 */
		<details
			className={cn("scroll-mt-16", className)}
			data-build-state={state}
			data-testid={testId}
			id={id}
			onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
			open={open}
		>
			{/*
			 * THE SUMMARY IS THE HEADING ROW, MADE PRESSABLE. Sticky, carrying the
			 * pane's own background so scrolling content passes behind it rather
			 * than through it.
			 *
			 * `bg-app-panel` is hardcoded and that is a real constraint rather than
			 * an oversight: a sticky header has to match the surface it scrolls
			 * over, and `bg-inherit` resolves to the `<details>`'s own transparent
			 * background, which would let text through. A caller placing this on a
			 * different surface has to say so; no prop exists for it yet because no
			 * caller does.
			 *
			 * `list-none` plus the webkit rule removes the default triangle, which
			 * a chevron replaces in this app's own vocabulary.
			 */}
			<summary
				className={cn(
					"sticky top-0 z-10 flex cursor-pointer list-none flex-wrap items-baseline gap-2",
					"bg-app-panel py-2 [&::-webkit-details-marker]:hidden",
				)}
			>
				{/*
				 * No `motion-reduce:transition-none` here. The stand-in carried one
				 * with a comment saying the global block "has not landed" — it has
				 * since, as the `prefers-reduced-motion` floor at the end of
				 * `styles/patch.css`, which zeroes every transition and animation in
				 * the app. Two mechanisms for one rule is how one of them goes stale.
				 */}
				<ChevronRightIcon
					aria-hidden="true"
					className={cn(
						"size-3.5 shrink-0 self-center text-text-subtle",
						"transition-transform duration-[var(--duration-micro)] ease-[var(--ease-avel)]",
						open && "rotate-90",
					)}
				/>
				{/*
				 * A REAL HEADING AT THE LEVEL THE TREE SAYS, not a hardcoded h2 — see
				 * ui/heading.tsx. A heading inside `<summary>` is valid, and it is
				 * what keeps a page navigable by headings once its rows collapse.
				 */}
				<Heading
					className="font-display text-sm font-semibold tracking-wide uppercase"
					id={`${id}-heading`}
				>
					{title}
				</Heading>
				{count === undefined ? null : (
					<Pill data-testid={`${testId}-count`}>{count}</Pill>
				)}
				{/*
				 * AN ACTION INSIDE A `<summary>` TOGGLES THE DISCLOSURE, because the
				 * whole summary is the toggle. Stopping propagation means a section's
				 * own control does what it says instead of also collapsing the thing
				 * it acts on. The trap is set for whoever adds the first one.
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
				 * 54ch, NOT 68ch, AND THE UNIT IS THE REASON. `ch` is the advance of
				 * "0", 8.2px in this face, while lowercase prose at 13px averages
				 * 5.96px — so a ch constraint yields about 1.38 characters per unit
				 * asked for, and `68ch` was rendering ~94 characters per line against
				 * a readable band of 45 to 75. Measured on the page, because the
				 * number looks like it is already in characters in the source.
				 */}
				{blurb ? (
					<p className="max-w-[54ch] pt-1 text-sm leading-relaxed text-text-muted">
						{blurb}
					</p>
				) : null}

				{props.state === "not-built" ? (
					<NotBuilt
						reason={props.notBuiltReason}
						testId={`${testId}-not-built`}
					/>
				) : (
					<div className="py-3">{children}</div>
				)}
			</HeadingLevel>
		</details>
	);
}
