import {
	createContext,
	type Dispatch,
	type ReactNode,
	type SetStateAction,
	useContext,
	useEffect,
	useRef,
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
};

export type PageHeaderState = {
	title?: string;
	/**
	 * FREE-FORM AND STILL SAFE. These stay ReactNode because they are genuinely
	 * prose and a descriptor would be a straitjacket — but they are kept OUT of
	 * the effect's dependency array and read from a ref instead, so a route
	 * passing an inline fragment cannot loop either. The header re-renders when
	 * the provider's state changes, so the nodes stay fresh without the effect
	 * depending on their identity.
	 */
	subtitle?: ReactNode;
	definition?: ReactNode;
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
		.map((a) => `${a.label}|${a.to ?? ""}|${a.variant ?? ""}`)
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

	// Read at effect time rather than depended upon. See PageHeaderState.
	const nodes = useRef({ subtitle, definition, actions });
	nodes.current = { subtitle, definition, actions };

	const key = actionsKey(actions);

	useEffect(() => {
		const { subtitle: s, definition: d, actions: a } = nodes.current;
		set({ title, subtitle: s, definition: d, actions: a });
		return () => set({});
		// `title` and `key` are the value-identity of this header. The nodes come
		// from the ref precisely so their object identity cannot drive this.
	}, [set, title, key]);
}
