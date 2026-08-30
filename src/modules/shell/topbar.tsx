import { PanelLeft } from "lucide-react";
import type { RefObject } from "react";
import type { NavGroup } from "#/contract/ui/nav";
import { identifyPage } from "#/modules/shell/page-title";
import { usePageHeaderState } from "#/modules/shell/use-page-header";
import { PageHeader } from "#/ui/page-header";
import { cn } from "#/utils/cn";

/**
 * Top bar: run state, and nothing that belongs to a page.
 *
 * THE SHELL HEADER CARRIES NO PAGE-SPECIFIC DATA CONTROLS. Two dropdowns lived
 * here — "All gates" and a delivery target — and both were global chrome
 * holding page-specific data. A "Filter by gate" control sat above the Clients
 * page, the Skills catalog and Account settings, where the concept does not
 * exist.
 *
 * Worse, neither did anything. Both selections lived in `useState` in this
 * file: the gate filter filtered nothing and the target targeted nothing. This
 * file's own comment said "every control opens something — a chevron that opens
 * nothing is the product telling the operator a menu exists when it does not",
 * and then stopped one level short. A menu that opens and changes nothing is
 * the same lie one level deeper, and a non-technical operator has no way to
 * discover it was never wired.
 *
 * Gate filtering belongs on mission detail. Delivery target belongs on the
 * export screen. They are deleted rather than moved, because the pages that own
 * that data do not exist yet and a control parked in the wrong place is how
 * this started.
 *
 * Per-operator preferences — theme, sidebar collapse, search, account — stay
 * in the sidebar footer and header block where they already are. UI-PLAN
 * section 2 rules that explicitly: "per-operator preferences live with the
 * operator, per-view controls live with the view", and names the theme toggle
 * as staying put. The later two-tier ruling asks for a fixed CORE group in this
 * header; those two readings conflict, and duplicating a theme toggle into the
 * header would give the operator two of them. Flagged rather than guessed, so
 * `core` is a slot this renders and nothing fills yet.
 *
 * WHAT DOES SIT ON THE RIGHT IS THE RUN STATE, and separating it from the
 * breadcrumb is the other half of section 2's ruling: "where am I" and "is
 * something running" are different questions, and one pill cannot answer both.
 * The pill used to contain the page name.
 */

export function TopBar({
	breadcrumb,
	pathname,
	navGroups,
	activity = "idle",
	onOpenNav,
	navTriggerRef,
}: {
	/** The shell's own words for what is happening. Not the page's name. */
	breadcrumb: string;
	/** Current path, for deriving the title until routes claim their own. */
	pathname: string;
	navGroups: NavGroup[];
	/**
	 * Supplied only below the compact breakpoint, where the sidebar is a
	 * drawer. Distinct from sidebar-collapse, which is a desktop control for
	 * the rail and means a different thing.
	 */
	onOpenNav?: () => void;
	/** Held by the shell so the drawer can hand focus back on close. */
	navTriggerRef?: RefObject<HTMLButtonElement | null>;
	/**
	 * Whether a run is actually in progress. Defaults to idle, because zero
	 * missions have run. The dot only pulses when something is happening — an
	 * animation next to "No run in progress" reads as activity where there is
	 * none.
	 */
	activity?: "idle" | "running";
}) {
	const running = activity === "running";
	const claimed = usePageHeaderState();
	const derived = identifyPage(navGroups, pathname);

	/**
	 * The route's title wins; the nav-derived one is the fallback. No route
	 * claims one yet, so today this is always the nav label — which is the
	 * page's name in plain words rather than a placeholder.
	 */
	const title = claimed.title ?? derived.title;

	const runState = (
		<span
			className="inline-flex shrink-0 items-center gap-2 rounded-full bg-app-panel px-3 py-1 text-xs text-text-muted"
			data-activity={activity}
			data-testid="live-pill"
		>
			<span
				aria-hidden="true"
				className={cn(
					"size-1.5 rounded-full",
					running
						? "animate-pulse bg-gate-pass motion-reduce:animate-none"
						: "bg-text-subtle",
				)}
				data-testid="live-dot"
			/>
			{breadcrumb}
		</span>
	);

	return (
		<div className="flex items-start gap-2 px-6 pt-3.5" data-testid="topbar">
			{onOpenNav ? (
				<button
					aria-label="Open navigation"
					className="interactive -ml-2 mt-1 flex size-11 shrink-0 items-center justify-center rounded-sm text-text-muted md:hidden"
					data-testid="nav-drawer-trigger"
					onClick={onOpenNav}
					ref={navTriggerRef}
					type="button"
				>
					<PanelLeft aria-hidden="true" size={18} strokeWidth={1.8} />
				</button>
			) : null}

			<PageHeader
				actions={claimed.actions}
				breadcrumb={
					derived.parent ? (
						<span data-testid="breadcrumb-parent">{derived.parent}</span>
					) : undefined
				}
				className="min-w-0 flex-1 px-0 py-0"
				core={runState}
				definition={claimed.definition}
				subtitle={claimed.subtitle}
				title={title}
			/>
		</div>
	);
}
