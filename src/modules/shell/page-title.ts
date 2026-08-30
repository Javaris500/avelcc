import type { NavGroup } from "#/contract/ui/nav";

/**
 * What the header calls the page, derived from the nav rather than invented.
 *
 * The route is the right owner of its own title — UI-PLAN section 2 says so and
 * the context in `use-page-header` is how a route claims it. This is the
 * fallback for every route that has not claimed one yet, which today is all of
 * them, and it is a fallback rather than a placeholder: `nav.ts` already holds
 * the operator-facing name of every destination in the product, so the nav
 * label IS the page's name in plain words. Inventing a second list of titles
 * would be two sources for one fact.
 *
 * Pure, so it is testable without a router.
 */

export type PageIdentity = {
	title: string;
	/** The nav label, present only when the path is DEEPER than the nav item. */
	parent?: string;
};

/**
 * Longest-prefix match, not first-match. `/missions/x/exports/new` has to
 * resolve to Missions rather than to whichever item happens to be scanned
 * first, and a shorter route can be a prefix of a longer one.
 */
export function identifyPage(
	groups: NavGroup[],
	pathname: string,
): PageIdentity {
	let best: { label: string; to: string } | null = null;

	for (const group of groups) {
		for (const item of group.items) {
			if (!item.to) continue;
			const hit = pathname === item.to || pathname.startsWith(`${item.to}/`);
			if (!hit) continue;
			if (!best || item.to.length > best.to.length) {
				best = { label: item.label, to: item.to };
			}
		}
	}

	if (!best) {
		/**
		 * A route with no nav entry. Not an error — the pre-flight screen is
		 * reachable and has none — so it gets the honest generic rather than a
		 * guess assembled from the URL. A title derived from a path segment
		 * would read as a name while being a slug.
		 */
		return { title: "AVEL" };
	}

	/**
	 * DEEPER THAN THE NAV ITEM means the route owns a title this cannot know:
	 * a mission's name, a client's name. The nav label becomes the breadcrumb
	 * parent and the title falls back to it until the route claims one, which
	 * is honest — "Missions" above a mission is true, if less useful than the
	 * mission's own name.
	 *
	 * A bare "Missions >" with nothing after it is the noise UI-PLAN warns
	 * about, so `parent` is only set where there is genuinely something below.
	 */
	if (pathname !== best.to) {
		return { title: best.label, parent: best.label };
	}
	return { title: best.label };
}
