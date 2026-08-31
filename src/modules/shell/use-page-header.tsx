import {
	createContext,
	type Dispatch,
	type ReactNode,
	type SetStateAction,
	useContext,
	useEffect,
	useState,
} from "react";

/**
 * How a route hands the shell its header without the shell importing route code.
 *
 * UI-PLAN section 2 gives the title, subtitle, definition and the module action
 * slot to the ROUTE and the run state to the shell. A route cannot render into
 * the header directly — the header is above `main` in the tree — so it declares
 * what it wants and the shell renders it.
 */

/**
 * An action the route wants in the header, as DATA rather than as an element.
 *
 * THE ROUTE NEVER BUILDS A NODE, and that is the whole reason this type exists.
 * A route writing the obvious thing —
 *
 *     usePageHeader({ title: "Northwind", actions: <Button>New request</Button> })
 *
 * builds a fresh element object on every render. React compares deps with
 * Object.is, so the dep changes, the effect runs, state is set, the component
 * re-renders, a new element is built, and the effect runs again. Unbounded, and
 * it fails on the first route that uses the slot as designed. Found by avel-bb
 * adopting the hook, not by me writing it.
 *
 * A descriptor cannot loop by construction: the shell builds the Button, so
 * there is no element identity to change. Asking routes to remember a useMemo
 * would be an attestation rather than a mechanism, and this project's own note
 * is that attestations are its recurring failure mode.
 *
 * It also fits section 2 better than a node did. The header wants exactly one
 * primary action plus an overflow, which a descriptor list can enforce and a
 * ReactNode cannot.
 */
export type PageAction = {
	label: string;
	/** A link, or a handler. Not both. */
	to?: string;
	onClick?: () => void;
	variant?: "primary" | "secondary";
	testId?: string;
	/**
	 * DISABLED NEEDS A REASON, and the reason is not optional decoration.
	 * Section 12 rule 6 means a large share of the controls in this product are
	 * honestly disabled — "a request belongs to an engagement", "sharing is not
	 * built, AVEL is single-operator" — and a control that is dead with no
	 * stated cause is the product refusing without saying why. Requested by
	 * avel-c2, who had two such actions and correctly would not move them into
	 * the header while the type could not represent them: promoting them as
	 * plain descriptors would have silently made them live.
	 */
	disabled?: boolean;
	disabledReason?: string;
};

export type PageHeaderState = {
	title?: string;
	/**
	 * STRINGS, NOT NODES, and this is the second half of the same lesson the
	 * actions descriptor taught.
	 *
	 * They were ReactNode, kept out of the dependency array and read from a ref
	 * so an inline fragment could not loop. The comment claimed the header would
	 * re-render and pick the fresh value up. THAT REASONING WAS CIRCULAR: the
	 * provider's state only changes when the effect calls `set`, the effect only
	 * runs when `title` or the action key changes, so a subtitle that arrived
	 * late while the title stayed put was written into the ref and never read by
	 * anything again. Found by avel-c2 on a two-query page where the counts
	 * resolve after the name — which is precisely the shape section 2 asks for,
	 * since "counts, status, last activity" are the things that arrive late.
	 *
	 * Putting them back in the deps as nodes would restore the infinite loop.
	 * So they stop being nodes. Section 2 describes both as one line of prose —
	 * "counts, status, last activity" and "the one plain sentence that names the
	 * jargon" — neither of which needs JSX. As strings they compare by value,
	 * they can sit in the dependency array honestly, and both the staleness and
	 * the loop are gone by construction rather than by a comment asking someone
	 * to be careful.
	 */
	subtitle?: string;
	definition?: string;
	actions?: PageAction[];
};

const StateContext = createContext<PageHeaderState>({});
const SetContext = createContext<Dispatch<SetStateAction<PageHeaderState>>>(
	() => {},
);

export function PageHeaderProvider({ children }: { children: ReactNode }) {
	const [state, setState] = useState<PageHeaderState>({});
	return (
		<SetContext.Provider value={setState}>
			<StateContext.Provider value={state}>{children}</StateContext.Provider>
		</SetContext.Provider>
	);
}

/** What the shell renders. Empty until a route claims it. */
export function usePageHeaderState(): PageHeaderState {
	return useContext(StateContext);
}

/**
 * A stable key for a descriptor list, so an array literal rebuilt every render
 * does not restart the effect. Labels and destinations are the identity of an
 * action; a fresh array of the same actions is the same header.
 */
function actionsKey(actions: PageAction[] | undefined): string {
	if (!actions) return "";
	return actions
		.map(
			(a) =>
				`${a.label}|${a.to ?? ""}|${a.variant ?? ""}|${a.disabled ? "d" : ""}|${a.disabledReason ?? ""}`,
		)
		.join("~");
}

/**
 * Called by a route to claim the header.
 *
 * Clears on unmount, so navigating away from a route that set a title cannot
 * leave that title above the next page. A stale header is worse than a generic
 * one, because it is confidently wrong.
 */
export function usePageHeader({
	title,
	subtitle,
	definition,
	actions,
}: PageHeaderState): void {
	const set = useContext(SetContext);
	const key = actionsKey(actions);

	/**
	 * `key` stands in for `actions`, whose array identity is fresh every render.
	 * Depending on `actions` itself is the infinite loop avel-bb found; the
	 * derived key compares the same information by VALUE.
	 *
	 * THE SUPPRESSION HAS TO SIT HERE, ON THE LINE BEFORE `useEffect`. It was
	 * at the bottom of the effect body, above the dependency array — which
	 * reads as though it annotates the deps and does nothing at all: biome
	 * binds a suppression to the NEXT line, and the rule reports on the
	 * `useEffect` call. So the warning was live, the comment explaining it away
	 * was not, and the file looked handled. `biome check` names both, the
	 * unsuppressed rule and the suppression that suppresses nothing.
	 */
	// biome-ignore lint/correctness/useExhaustiveDependencies: actions is keyed
	useEffect(() => {
		// Every input is compared by VALUE — two strings and a derived key — so
		// this runs exactly when the header's content actually changed, and never
		// because a render produced a new object saying the same thing.
		set({ title, subtitle, definition, actions });
		return () => set({});
	}, [set, title, subtitle, definition, key]);
}
