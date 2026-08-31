import {
	ChevronDown,
	LogOut,
	Moon,
	PanelLeftClose,
	PanelLeftOpen,
	Sun,
} from "lucide-react";
import type { NavGroup } from "#/contract/ui/nav";
import type { Session } from "#/modules/auth/session";
import { NAV, NavTree } from "#/modules/nav";
import { LabelWhenCollapsed } from "#/modules/shell/collapsed-label";
import { SidebarSearch } from "#/modules/shell/sidebar-search";
import { BrandMark, Wordmark } from "#/modules/shell/wordmark";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "#/ui/dropdown-menu";
import { cn } from "#/utils/cn";

/**
 * Sidebar chrome: brand, workspace switcher, search, nav slot, footer.
 *
 * The footer holds the two PER-OPERATOR controls — theme and account — plus
 * the collapse toggle. The top bar holds per-view controls. A preference and a
 * data filter are different kinds of thing and do not belong in one strip.
 *
 * COLLAPSED, this becomes an icon rail. Every control that loses its visible
 * label gains a tooltip, because an icon alone is not a label. Nav items are
 * session 3's: `collapsed` is passed through the seam and NavTree decides what
 * to do with it.
 *
 * It does NOT build the nav. Session 3 owns NavTree behind the seam in
 * src/contract/ui/nav.ts.
 */

export function Sidebar({
	session,
	onSignOut,
	navGroups,
	collapsed,
	onToggleCollapsed,
	theme,
	onToggleTheme,
}: {
	session: Session;
	onSignOut: () => void;
	navGroups?: NavGroup[];
	collapsed: boolean;
	onToggleCollapsed: () => void;
	theme: "dark" | "light";
	onToggleTheme: () => void;
}) {
	const nextTheme = theme === "dark" ? "light" : "dark";

	return (
		<aside
			className={cn(
				// ONE SOLID SURFACE WITH THE CONTENT, on the operator's instruction.
				// This was bg-app-bg — the desktop tone — which made the sidebar the
				// darkest plane in the window and read as a separate, heavier slab.
				// It now sits on app-panel, the same surface the content column uses,
				// so the window is ONE ground and the accent seam is what divides it.
				//
				// NO RULE between the two, and sharing a tone is not the reason —
				// they share one, which is normally exactly when you reach for a
				// hairline. The seam does that job, and a divider plus a tone step
				// were doing it twice.
				//
				// WHAT THIS COSTS, stated because it is load-bearing above: app-panel
				// and app-raised are BOTH #ffffff in light, so no control on this
				// surface can separate itself by fill. That is why the switcher is
				// transparent at rest and recesses on contact rather than lifting.
				// Two earlier paragraphs here still described the sidebar as a
				// different, darker plane; they were removed rather than left to be
				// read as current, and shell.e2e.spec.ts asserts the surviving rule.
				"flex flex-col bg-app-panel py-3.5 transition-[width] duration-[var(--duration-micro)]",
				collapsed ? "w-16 items-center px-2" : "w-(--frame-sidebar) px-3",
			)}
			data-collapsed={collapsed}
			data-testid="sidebar"
		>
			{/* Brand. A block rather than a lockup: mark, name, and one true
			    second line. The reference puts a version string here; ours says
			    what the product IS, which is the only thing available that is not
			    already on screen four lines down in the workspace switcher. A
			    subtitle that is decoration is the same failure as a dropdown that
			    does nothing. */}
			<div
				className={cn(
					// shrink-0: see the note on the nav slot below. This is the block the
					// operator watched get clipped — the mark cut in half at the top.
					"flex shrink-0 items-center gap-2.5 pt-1 pb-3.5",
					collapsed ? "justify-center" : "px-1.5",
				)}
			>
				<BrandMark />
				{collapsed ? null : (
					<span className="flex min-w-0 flex-col leading-none">
						<Wordmark />
						<span
							className="pt-1 text-micro text-text-subtle"
							data-testid="brand-subtitle"
						>
							Command Center
						</span>
					</span>
				)}
			</div>

			{/* Workspace switcher */}
			<DropdownMenu>
				<LabelWhenCollapsed
					collapsed={collapsed}
					label={session.workspace}
					testId="workspace-switcher-tip"
				>
					<DropdownMenuTrigger
						className={cn(
							// RECESSED, NOT RAISED, AND THE SIDEBAR MOVING IS WHY. app-raised is
							// #ffffff in light; with the sidebar now on app-panel — also
							// #ffffff — this control would be white on white with a 1px
							// hairline doing all the work. That is correction 5 verbatim,
							// which this codebase already reverted once. Recessing it
							// separates DOWNWARD, which is the one direction light still
							// has, and it matches the search input directly below it.
							"interactive group mb-2 flex shrink-0 items-center gap-2 rounded-sm border border-[var(--elevation-border-rest)] py-2 text-left",
							// TRANSPARENT AT REST, RECESSING ON CONTACT.
							//
							// It was on app-recessed, which is the WELL tone — the same
							// surface the search input below it uses. Sitting in a well
							// made it read as a text field rather than a control, and it
							// was the darkest object in the sidebar, so the eye went to it
							// before the nav.
							//
							// Transparent at rest means it inherits whichever surface the
							// sidebar is on and cannot collide with it — which is the whole
							// of correction 5, solved by not having a fill rather than by
							// picking a better one. Hover and open RECESS it: downward is
							// the only direction light mode has, and it is the same move
							// the stop button makes for the same reason.
							// HOVER IS A BRAND TINT, OPEN IS A PRESS. Two states that mean
							// different things should not paint the same.
							//
							// accent-soft is 12% accent, so it is TRANSLUCENT and composites
							// against whatever is under it. That is why it is the right hover
							// for this control specifically: every opaque fill available is
							// wrong in one theme or the other — app-raised is #ffffff in light
							// and vanishes on the white sidebar, app-recessed is heavy enough
							// in dark to read as a press. A tint has no such problem in either.
							//
							// The token was declared and unused: --color-accent-soft in
							// tokens.css, mirrored as --color-state-selected in patch.css, and
							// no component had reached for either.
							"hover:border-[var(--elevation-border-raised)] hover:bg-[var(--color-accent-soft)]",
							"data-[state=open]:border-[var(--elevation-border-raised)] data-[state=open]:bg-app-recessed",
							collapsed ? "justify-center px-2" : "px-2.5",
						)}
						data-testid="workspace-switcher"
					>
						<span
							aria-hidden="true"
							className="size-[15px] shrink-0 rounded-xs bg-accent"
						/>
						{collapsed ? null : (
							<>
								<span className="flex-1 truncate text-sm text-text">
									{session.workspace}
								</span>
								<ChevronDown
									aria-hidden="true"
									className="shrink-0 text-text-subtle transition-transform duration-[var(--duration-micro)] group-data-[state=open]:rotate-180"
									size={12}
									strokeWidth={2}
								/>
							</>
						)}
					</DropdownMenuTrigger>
				</LabelWhenCollapsed>
				{/*
				  MATCHES THE TRIGGER'S WIDTH. It was 177px under a 214px trigger —
				  a menu narrower than the control it belongs to reads as a
				  mispositioned popover rather than an extension of the button. The
				  global `min-w-[7rem]` is a floor for small menus and was never
				  meant to size this one. Radix publishes the trigger width as a
				  custom property; using it means the two cannot drift when the
				  sidebar width or the workspace name changes.
				*/}
				<DropdownMenuContent
					align="start"
					className="min-w-(--radix-dropdown-menu-trigger-width)"
					data-testid="workspace-menu"
					sideOffset={6}
				>
					<DropdownMenuLabel>Workspace</DropdownMenuLabel>
					{/* One real workspace. CLIENTS is unbuilt, so there is no second
					    one to offer and inventing it would be fabricated product data. */}
					<DropdownMenuItem data-testid="workspace-option-current">
						<span className="size-[15px] shrink-0 rounded-xs bg-accent" />
						{session.workspace}
						<span className="ml-auto text-micro text-text-subtle">current</span>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<SidebarSearch collapsed={collapsed} />

			{/* Nav slot.
			    THE RULE IS GONE AND A FADE DOES ITS JOB. A `border-t` appeared here
			    once the list was scrolled, which is an internal divider and falls
			    under the operator's no-rules ruling. The signal it carried is real
			    and worth keeping: a cut-off list should look cut off rather than
			    complete. So the content now fades into the background at the bottom
			    edge instead, which says the same thing without drawing a line.

			    The mask is unconditional. With a short list the fade lands on empty
			    space and shows nothing, so there is no state to track. */}
			<div
				className={cn(
					// THE ONLY CHILD OF THE ASIDE THAT MAY SHRINK, and every sibling now
					// carries shrink-0 to keep it that way. They did not, and a flex child
					// defaults to `flex-shrink: 1`, so once brand + switcher + search + 12
					// nav items + 3 footer controls exceeded the pane every block
					// compressed together instead of the nav scrolling.
					//
					// IT CLIPPED THE TOP, not the bottom, which is why it did not read as
					// ordinary overflow. The footer carries `mt-auto`; when a flex column
					// overflows, an auto margin resolves against NEGATIVE free space and
					// pushes the content up past the container edge, where app-window's
					// `overflow-hidden` cuts it off. The operator saw the brand mark cut
					// in half. Same class as the topbar crop, one column over.
					//
					// SCROLLS, BUT SHOWS NO SCROLLBAR. `app-scroll` paints a 10px track
					// on the right edge of the nav, which reads as a second border inside
					// a panel that already has one, and it appears and disappears as the
					// list grows. The fade below already says "there is more" — that is
					// the signal; the bar was the decoration. Overflow is untouched, so
					// wheel, trackpad, keyboard and touch all still scroll.
					"w-full min-h-0 flex-1 overflow-y-auto",
					"[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
					"[mask-image:linear-gradient(to_bottom,black_calc(100%-2rem),transparent)]",
				)}
				data-nav-groups={(navGroups ?? NAV).length}
				data-testid="nav-slot"
			>
				<NavTree collapsed={collapsed} groups={navGroups ?? NAV} />
			</div>

			{/* Footer: the operator's own controls. */}
			<div
				className={cn(
					// No rule. The gap above and the muted control tone separate the
					// footer from the nav, per the operator's ruling.
					"mt-auto flex w-full shrink-0 flex-col gap-1 pt-4",
					collapsed && "items-center",
				)}
				data-testid="sidebar-footer"
			>
				<LabelWhenCollapsed
					collapsed={collapsed}
					label={`Switch to the ${nextTheme} theme`}
					testId="control-theme-tip"
				>
					<button
						className={cn(
							"interactive flex items-center gap-2 rounded-sm py-2 text-left text-xs text-text-muted",
							collapsed ? "justify-center px-2" : "w-full px-2",
						)}
						data-testid="control-theme"
						onClick={onToggleTheme}
						type="button"
					>
						{theme === "dark" ? (
							<Sun aria-hidden="true" size={15} strokeWidth={1.8} />
						) : (
							<Moon aria-hidden="true" size={15} strokeWidth={1.8} />
						)}
						{collapsed ? null : <span>Switch to {nextTheme}</span>}
					</button>
				</LabelWhenCollapsed>

				<LabelWhenCollapsed
					collapsed={collapsed}
					label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
					testId="sidebar-collapse-tip"
				>
					<button
						aria-expanded={!collapsed}
						aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
						className={cn(
							"interactive flex items-center gap-2 rounded-sm py-2 text-left text-xs text-text-muted",
							collapsed ? "justify-center px-2" : "w-full px-2",
						)}
						data-testid="sidebar-collapse"
						onClick={onToggleCollapsed}
						type="button"
					>
						{collapsed ? (
							<PanelLeftOpen aria-hidden="true" size={15} strokeWidth={1.8} />
						) : (
							<PanelLeftClose aria-hidden="true" size={15} strokeWidth={1.8} />
						)}
						{collapsed ? null : <span>Collapse</span>}
					</button>
				</LabelWhenCollapsed>

				{/* Signing out is the one irreversible control in the shell, so it is
				    a menu with a named action rather than a bare click. */}
				<DropdownMenu>
					<LabelWhenCollapsed
						collapsed={collapsed}
						label={session.operator}
						testId="account-tip"
					>
						<DropdownMenuTrigger
							className={cn(
								"interactive flex items-center gap-2 rounded-sm py-2 text-left",
								collapsed ? "justify-center px-2" : "w-full px-2",
							)}
							data-testid="account"
						>
							<span
								aria-hidden="true"
								className="size-[22px] shrink-0 rounded-full border border-[var(--elevation-border-rest)] bg-app-float"
							/>
							{collapsed ? null : (
								<span className="truncate text-xs text-text-muted">
									{session.operator}
								</span>
							)}
						</DropdownMenuTrigger>
					</LabelWhenCollapsed>
					<DropdownMenuContent align="start" data-testid="account-menu">
						<DropdownMenuLabel>{session.operator}</DropdownMenuLabel>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							data-testid="account-sign-out"
							onSelect={onSignOut}
							variant="destructive"
						>
							<LogOut aria-hidden="true" size={14} strokeWidth={1.8} />
							Sign out
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</aside>
	);
}
