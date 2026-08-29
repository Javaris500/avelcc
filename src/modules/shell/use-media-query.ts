import { useEffect, useState } from "react";

/**
 * Subscribe to a media query.
 *
 * Starts false and corrects after mount, the same shape as useTheme and
 * useCollapsed: matchMedia does not exist during a server render, and reading
 * it during the client's first render is a hydration mismatch.
 *
 * `change` is subscribed rather than polled, so a rotation or a resized window
 * updates without a re-render loop.
 */
export function useMediaQuery(query: string): boolean {
	const [matches, setMatches] = useState(false);

	useEffect(() => {
		if (typeof window === "undefined" || !window.matchMedia) return;
		const list = window.matchMedia(query);
		setMatches(list.matches);

		const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
		list.addEventListener("change", onChange);
		return () => list.removeEventListener("change", onChange);
	}, [query]);

	return matches;
}

/**
 * Below this the 238px sidebar column cannot be afforded: it would leave under
 * 530px for the main pane inside the mat, which is narrower than the content
 * it holds. Chosen from the frame, not from a device, and expressed as
 * Tailwind's `md` so the value lives in one place rather than being inlined
 * here and again in every `max-md:` utility.
 */
export const COMPACT_QUERY = "(max-width: 767px)";
