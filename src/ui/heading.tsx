import {
	createContext,
	type HTMLAttributes,
	type ReactNode,
	useContext,
	useMemo,
} from "react";

/**
 * A heading that knows how deep it is.
 *
 * WHY THIS IS A CONTEXT AND NOT A PROP. `EmptyState` and `ErrorState` render at
 * page level, inside a section, and inside a conversation turn — three
 * different correct levels for the same component. A `headingLevel` prop would
 * put the answer at every call site and be wrong at the first one somebody
 * forgot, which is an attestation rather than a mechanism, and attestations are
 * this project's named recurring failure. Nesting is a property of the tree, so
 * the tree carries it.
 *
 * THE DEFAULT IS 2 BECAUSE THE SHELL HEADER OWNS h1. Every route renders inside
 * a document whose only h1 is the page title in `PageHeader`, so the first
 * heading a route can legitimately produce is an h2. The exception is a route
 * that renders its OWN document outside the Shell — the signed-out front door —
 * which keeps its own h1 and never reaches this.
 *
 * The defect this fixes: both state titles were `<p>` styled as headings —
 * `font-display text-lg font-semibold` — so a screen reader met the page title
 * and then no structure at all beneath it. Styled as a heading is not marked as
 * one. Found by avel-bb reading the heading outline of a page I had just
 * changed the top of.
 */

type Level = 2 | 3 | 4 | 5 | 6;

const HeadingLevelContext = createContext<Level>(2);

/**
 * Everything inside renders one level deeper. A section that carries its own
 * heading wraps its body in this, so the states inside it land beneath rather
 * than beside it.
 */
export function HeadingLevel({ children }: { children: ReactNode }) {
	const level = useContext(HeadingLevelContext);
	// h6 is the floor. Deeper nesting than that is a layout problem, and
	// emitting <h7> would be invalid rather than merely wrong.
	const next = useMemo<Level>(
		() => (level < 6 ? ((level + 1) as Level) : 6),
		[level],
	);
	return (
		<HeadingLevelContext.Provider value={next}>
			{children}
		</HeadingLevelContext.Provider>
	);
}

/** The current level, for a component that needs to know rather than render. */
export function useHeadingLevel(): Level {
	return useContext(HeadingLevelContext);
}

export function Heading({
	children,
	...props
}: HTMLAttributes<HTMLHeadingElement>) {
	const level = useContext(HeadingLevelContext);
	const Tag = `h${level}` as const;
	return <Tag {...props}>{children}</Tag>;
}
