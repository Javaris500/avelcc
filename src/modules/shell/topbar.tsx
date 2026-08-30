import { PanelLeft } from "lucide-react";
import type { RefObject } from "react";
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
 * Per-operator preferences — theme, sidebar collapse — stay in the sidebar
 * footer beside the account: they belong to the operator rather than to what is
 * on screen.
 */

export function TopBar({
	breadcrumb,
	activity = "idle",
	onOpenNav,
	navTriggerRef,
}: {
	breadcrumb: string;
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

	return (
		<header
			className="flex flex-wrap items-center gap-3 border-b border-[var(--elevation-border-rest)] px-6 py-3.5"
			data-testid="topbar"
		>
			{onOpenNav ? (
				<button
					aria-label="Open navigation"
					className="interactive -ml-2 flex size-11 shrink-0 items-center justify-center rounded-sm text-text-muted md:hidden"
					data-testid="nav-drawer-trigger"
					onClick={onOpenNav}
					ref={navTriggerRef}
					type="button"
				>
					<PanelLeft aria-hidden="true" size={18} strokeWidth={1.8} />
				</button>
			) : null}

			{/* Reports state, does not act on it. A span, not a button. */}
			<span
				className="inline-flex items-center gap-2 rounded-full border border-[var(--elevation-border-rest)] bg-app-panel px-3 py-1 text-xs text-text-muted"
				data-activity={activity}
				data-testid="live-pill"
			>
				<span
					aria-hidden="true"
					className={cn(
						"size-1.5 rounded-full",
						running ? "animate-pulse bg-gate-pass" : "bg-text-subtle",
					)}
					data-testid="live-dot"
				/>
				{breadcrumb}
			</span>

			{/* The spacer stays: it is what keeps the pill left-aligned now that
			    nothing sits on the right. The header's real content — title,
			    subtitle and one route-owned action — is section 2 and lands next. */}
			<span aria-hidden="true" className="flex-1" data-testid="topbar-spacer" />
		</header>
	);
}
