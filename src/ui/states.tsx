import type { ReactNode } from "react";
import { Button } from "#/ui/button";
import { Heading } from "#/ui/heading";
import { cn } from "#/utils/cn";

/**
 * Empty is a designed screen, not a blank. ROUTES.md on the mission list:
 * "this is the screen a new operator sees before anything exists. Design it as
 * onboarding, not as a blank table."
 */
export function EmptyState({
	title,
	body,
	action,
	inset = "page",
	className,
}: {
	title: string;
	body: string;
	action?: ReactNode;
	/**
	 * WHERE THIS EMPTY STATE SITS, because the padding differs and the caller
	 * should not have to cancel it.
	 *
	 * `page` is the original: generous, for an empty state that IS the screen.
	 * `section` drops the horizontal padding, because inside a section the
	 * container already owns its inset and the two fight. avel-c2 was passing
	 * `className="px-0"` at five call sites to undo it, and an override repeated
	 * five times is a prop that has not been written yet.
	 */
	inset?: "page" | "section";
	className?: string;
}) {
	return (
		<div
			className={cn(
				"flex flex-col items-start gap-2",
				inset === "page" ? "px-6 py-14" : "py-6",
				className,
			)}
			data-testid="empty-state"
		>
			{/* A REAL HEADING, not a paragraph that looks like one. This was a
			    <p> with heading type, so a screen reader met the page title and
			    then no structure beneath it. The level comes from the tree — see
			    ui/heading.tsx — because this component renders at page level,
			    inside a section and inside a conversation turn, which are three
			    different correct answers. */}
			<Heading className="font-display text-lg font-semibold text-text">
				{title}
			</Heading>
			<p className="max-w-[52ch] text-sm leading-relaxed text-text-muted">
				{body}
			</p>
			{action ? <div className="pt-2">{action}</div> : null}
		</div>
	);
}

/**
 * Deliberately prop-driven and contract-free. The error map lands in step 6 and
 * supplies `code`, `title` and `body`; this component never parses a message
 * and never imports a domain type.
 */
export function ErrorState({
	code,
	title,
	body,
	retry,
	action,
	inset = "page",
	className,
}: {
	code: string;
	title: string;
	body: string;
	retry?: () => void;
	/**
	 * The recovery that is NOT a retry. ERROR_MAP gives several codes a `link`
	 * or a `switch-target` — REPO_NO_ACCESS points at connections,
	 * POLICY_FORBIDS_TARGET offers a pull request instead — and until this slot
	 * existed every one of them rendered as no action at all, which quietly
	 * made the map's recovery column decorative for two thirds of its kinds.
	 *
	 * A ReactNode rather than a typed recovery, so this component stays
	 * prop-driven and contract-free: it must not learn what a target or a
	 * connection is. The caller knows what it can actually DO and passes the
	 * control; this only decides where it sits.
	 */
	action?: ReactNode;
	/**
	 * Identical to EmptyState's, and deliberately not a second spelling of it.
	 *
	 * The two components sit side by side, take the same shape of content and
	 * fill the same slots, so a section that insets one insets the other.
	 * EmptyState got the prop first; avel-c2's blanket sweep of the `px-0`
	 * overrides then hit an ErrorState call and tsc caught it, which left that
	 * one site working around a gap the other five no longer had.
	 */
	inset?: "page" | "section";
	className?: string;
}) {
	return (
		<div
			className={cn(
				"flex flex-col items-start gap-2",
				inset === "page" ? "px-6 py-14" : "py-6",
				className,
			)}
			data-testid="error-state"
		>
			<span
				className="font-mono text-xs text-gate-block"
				data-testid="error-code"
			>
				{code}
			</span>
			{/* A real heading, level from the tree. See EmptyState above. */}
			<Heading className="font-display text-lg font-semibold text-text">
				{title}
			</Heading>
			<p className="max-w-[52ch] text-sm leading-relaxed text-text-muted">
				{body}
			</p>
			{retry || action ? (
				<div className="flex flex-wrap items-center gap-3 pt-2">
					{retry ? (
						<Button
							data-testid="error-retry"
							onClick={retry}
							variant="secondary"
						>
							Try again
						</Button>
					) : null}
					{action}
				</div>
			) : null}
		</div>
	);
}

/**
 * A surface with NO QUERY BEHIND IT YET. The third state, and the one a screen
 * gets wrong by having only two.
 *
 * NOT AN EmptyState AND NOT AN ErrorState, and the distinction is the whole
 * point. "No deliveries yet" when nothing was ever asked is the screen
 * asserting an emptiness it never checked. A red code with a Try again is worse
 * still: it blames a read that was never attempted, in front of an operator who
 * did nothing wrong and can do nothing about it.
 *
 * WHY IT LIVES HERE. Four independent implementations of this treatment existed
 * — two byte-identical copies in the missions routes, one in the catalog screen
 * and one in the client scaffold — with three different paddings and three
 * different testid schemes. Three sessions reinvented it separately, which is
 * why it became a written rule; a rule that is real enough to be written down
 * is real enough to be a component, or it gets re-derived by whoever needs it
 * next and drifts a little further each time.
 *
 * The reason is REQUIRED. A screen that says "not built" without saying what is
 * missing has told the operator only that it is not their fault, which they
 * could already see.
 */
export function NotBuilt({
	reason,
	testId = "not-built",
	className,
}: {
	/** What is missing, in plain words. Rendered after "Not built." */
	reason: string;
	testId?: string;
	className?: string;
}) {
	return (
		<p
			className={cn(
				// A reading measure, because this is prose. 52ch renders about 71
				// characters in this face — `ch` is the advance of "0" and digits run
				// wider than lowercase, so a ch constraint yields roughly 1.37
				// characters per unit. Measured, not assumed.
				"max-w-[52ch] py-3 text-sm leading-relaxed text-text-subtle",
				className,
			)}
			data-testid={testId}
		>
			Not built. {reason}
		</p>
	);
}
