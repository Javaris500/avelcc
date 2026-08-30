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
 *
 * NOTHING USES THIS YET, and that is deliberate rather than unfinished. Routes
 * live under `src/routes/_app/`, which this session does not own; the shell
 * falls back to the nav-derived title until each route's owner adopts the hook.
 * The mechanism ships first so adoption is one hook call per route rather than
 * a shell change per route.
 */

export type PageHeaderState = {
	title?: string;
	subtitle?: ReactNode;
	definition?: ReactNode;
	actions?: ReactNode;
};

/**
 * TWO CONTEXTS, NOT ONE, and the split is load-bearing rather than tidy.
 *
 * A single context carrying `{ state, set }` gets a new identity every time the
 * state changes, so a route effect depending on it re-runs on its own update
 * and sets again — a loop. The first version of this file suppressed the lint
 * that said so, which is the wrong half of the problem to silence: the warning
 * was correct and the dependency really was missing.
 *
 * `setState` from useState is referentially stable for the life of the
 * provider, so a route can depend on it honestly and the effect runs only when
 * the route's own values change.
 */
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

	useEffect(() => {
		set({ title, subtitle, definition, actions });
		return () => set({});
	}, [set, title, subtitle, definition, actions]);
}
