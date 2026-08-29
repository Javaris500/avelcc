import { ChevronDown, PanelLeft, Search } from "lucide-react";
import { NAV, NavTree } from "#/components/nav";
import { BrandMark, Wordmark } from "#/components/shell/wordmark";
import type { NavGroup } from "#/contract/ui/nav";
import type { Session } from "#/routes/-lib/session";

/**
 * Sidebar chrome: brand, workspace switcher, search trigger, nav slot, account.
 *
 * It does NOT build the nav. Session 3 owns `NavTree` behind the seam declared
 * in `src/contract/ui/nav.ts`; this file renders the slot and knows nothing
 * else about it: it supplies the scroll container and passes groups through.
 *
 * Reference `.side`: 238px column, panel background, right border, 14px/12px
 * padding, account pinned to the bottom by `margin-top:auto` on the footer.
 */

/** Icon sizing taken from the reference's inline SVGs: 15px at stroke 1.8. */
const ICON = { size: 15, strokeWidth: 1.8 } as const;

export function Sidebar({
	session,
	onSignOut,
	navGroups,
}: {
	session: Session;
	onSignOut: () => void;
	/**
	 * Passed straight to NavTree. Optional because the nav is a separate
	 * session's deliverable and the frame must render without it.
	 */
	navGroups?: NavGroup[];
}) {
	return (
		<aside
			className="flex flex-col border-r border-[var(--elevation-border-rest)] bg-app-panel px-3 py-3.5"
			data-testid="sidebar"
		>
			{/* Brand */}
			<div className="flex items-center gap-2 px-1.5 pt-1 pb-3.5">
				<BrandMark />
				<Wordmark />
				<button
					aria-label="Collapse sidebar"
					className="interactive ml-auto rounded-xs p-0.5 text-text-subtle"
					data-testid="sidebar-collapse"
					type="button"
				>
					<PanelLeft {...ICON} />
				</button>
			</div>

			{/* Workspace switcher */}
			<button
				className="interactive mb-2 flex items-center gap-2 rounded-sm border border-[var(--elevation-border-rest)] bg-app-raised px-2.5 py-2 text-left hover:border-[var(--elevation-border-raised)]"
				data-testid="workspace-switcher"
				type="button"
			>
				<span
					aria-hidden="true"
					className="size-[15px] shrink-0 rounded-xs bg-accent"
				/>
				<span className="flex-1 truncate text-sm text-text">
					{session.workspace}
				</span>
				<ChevronDown
					className="shrink-0 text-text-subtle"
					size={11}
					strokeWidth={2}
				/>
			</button>

			{/* Search. The F hint is the shortcut, shown rather than discovered. */}
			<button
				className="interactive mb-5 flex cursor-text items-center gap-2 rounded-sm border border-[var(--elevation-border-rest)] px-2.5 py-2 text-left hover:border-[var(--elevation-border-raised)]"
				data-testid="search-trigger"
				type="button"
			>
				<Search
					className="shrink-0 text-text-subtle"
					size={13}
					strokeWidth={2.2}
				/>
				<span className="flex-1 text-sm text-text-subtle">Find…</span>
				<kbd
					className="rounded-xs border border-[var(--elevation-border-rest)] px-1 py-px font-mono text-micro text-text-subtle"
					data-testid="search-hint"
				>
					F
				</kbd>
			</button>

			{/* ── NAV SLOT ──────────────────────────────────────────────────────
			    Session 3's territory, behind the barrel at #/components/nav. The
			    frame supplies the scroll container and nothing else; it does not
			    know what a nav item is. NAV is the default set, overridable by
			    the caller for tests and for the collapsed rail later. */}
			<div
				className="app-scroll min-h-0 flex-1 overflow-y-auto"
				data-nav-groups={(navGroups ?? NAV).length}
				data-testid="nav-slot"
			>
				<NavTree groups={navGroups ?? NAV} />
			</div>

			{/* Account, pinned bottom */}
			<div className="mt-auto border-t border-[var(--elevation-border-rest)] pt-3">
				<button
					className="interactive flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left"
					data-testid="account"
					onClick={onSignOut}
					type="button"
				>
					<span
						aria-hidden="true"
						className="size-[22px] shrink-0 rounded-full border border-[var(--elevation-border-rest)] bg-app-float"
					/>
					<span className="truncate text-xs text-text-muted">
						{session.operator}
					</span>
				</button>
			</div>
		</aside>
	);
}
