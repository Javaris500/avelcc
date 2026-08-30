import { type ReactNode, useEffect, useRef, useState } from "react";
import type { NavGroup } from "#/contract/ui/nav";
import type { Session } from "#/modules/auth/session";
import { NavDrawer } from "#/modules/shell/nav-drawer";
import { Sidebar } from "#/modules/shell/sidebar";
import { useCollapsed } from "#/modules/shell/use-collapsed";
import { COMPACT_QUERY, useMediaQuery } from "#/modules/shell/use-media-query";
import { PageHeaderProvider } from "#/modules/shell/use-page-header";
import { useTheme } from "#/modules/theme/use-theme";
import { TooltipProvider } from "#/ui/tooltip";
import { cn } from "#/utils/cn";

/**
 * The app shell.
 *
 * Frame per the reference: `.page > .app > aside.side + .main`. The page is a
 * 26px mat; the app is a bordered, rounded window inside it, capped at 1440px
 * and `100vh - 52px` tall so the mat shows on all four sides. Overflow is
 * hidden on the window so the rounded corners actually clip.
 *
 * Theme comes from the shared `useTheme` hook rather than local state, because
 * login renders outside this component with its own `.app` wrapper and the two
 * must read one stored preference.
 *
 * The 14px base comes from `body`, which takes `--text-base`. This wrapper
 * deliberately does NOT restate it: a `text-base` here would win over `body`,
 * so a future change to the global base would silently not reach the shell.
 * One fact, one owner. The type-scale test is what guards it — if the base
 * ever goes missing again, that test fails rather than this class hiding it.
 *
 * `.app` supplies tabular-nums and the text-subtle contrast fix. `.light` sits
 * HERE, on the shell wrapper, never on <html> — the patch and
 * DAY-ONE-FRONTEND both require it, because the landing shares this stylesheet
 * and must not follow the app's theme. The reference's own script sets `.light`
 * on documentElement; that is the one place its behaviour is not to be copied.
 */
export function Shell({
	session,
	onSignOut,
	navGroups,
	children,
}: {
	session: Session;
	onSignOut: () => void;
	/**
	 * ACCEPTED AND NOT RENDERED. The shell header that displayed it was
	 * removed on the operator's instruction, and every caller still passes
	 * this. Kept in the type so none of them break, and kept rather than
	 * deleted so restoring the header does not mean editing every route.
	 */
	breadcrumb?: string;
	/** Forwarded to the nav slot. Owned by session 3, not by the frame. */
	navGroups?: NavGroup[];
	children: ReactNode;
}) {
	const { theme, toggle: toggleTheme } = useTheme();
	const { collapsed, toggle: toggleCollapsed } = useCollapsed();
	const compact = useMediaQuery(COMPACT_QUERY);
	const [drawerOpen, setDrawerOpen] = useState(false);
	const navTriggerRef = useRef<HTMLButtonElement>(null);

	// Leaving compact must not strand an open drawer over a desktop layout.
	useEffect(() => {
		if (!compact) setDrawerOpen(false);
	}, [compact]);

	// Rendered in exactly ONE place: the grid column, or the drawer. Two copies
	// would duplicate every data-testid in the shell.
	const sidebar = (
		<Sidebar
			collapsed={compact ? false : collapsed}
			navGroups={navGroups}
			onSignOut={onSignOut}
			onToggleCollapsed={toggleCollapsed}
			onToggleTheme={toggleTheme}
			session={session}
			theme={theme}
		/>
	);

	return (
		<TooltipProvider delayDuration={300}>
			<PageHeaderProvider>
				<div
					className={cn(
						"app min-h-screen bg-app-bg p-(--frame-mat) text-text max-md:p-3",
						theme === "light" && "light",
					)}
					data-testid="app-shell"
					data-theme={theme}
				>
					{/* TWELVE nav items sit before the content in tab order. Visually
			    hidden until focused, then a real, visible target.
			    The comment said twelve while the tree held thirteen, so it
			    carries the derivation now rather than the number alone: nav.ts
			    holds 15 `label:` fields, three of which are GROUP labels,
			    leaving 12 destinations. Recount that way rather than by eye. */}
					<a
						className="sr-only rounded-sm bg-app-float px-3 py-2 text-sm text-text focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
						data-testid="skip-to-content"
						href="#main-content"
					>
						Skip to content
					</a>
					{/* One column below the breakpoint comes for free: the sidebar is not
				    rendered there, so the grid has a single child. An explicit
				    max-md:grid-cols-1 was here and a mutation proved it changed
				    nothing, so it is gone rather than reading as though it works. */}
					<div
						// The border here STAYS. "No rules throughout the shell" means
						// internal dividers; this is the window's edge against the mat,
						// and without it the rounded corners have nothing to describe
						// them against. Every rule BETWEEN panes is gone.
						className="mx-auto grid h-[calc(100vh-(var(--frame-mat)*2))] max-w-(--frame-max) grid-cols-[auto_1fr] overflow-hidden rounded-lg border border-[var(--elevation-border-rest)] bg-app-bg shadow-e2 max-md:h-[calc(100vh-calc(var(--spacing)*6))]"
						data-testid="app-window"
					>
						{compact ? null : sidebar}

						<div
							className="flex min-w-0 flex-col overflow-hidden"
							data-testid="main-pane"
						>
							{/*
							  THE SHELL HEADER IS REMOVED, on the operator's instruction, after
							  three attempts to stop it clipping.
							
							  Two real defects were found and fixed on the way here: this header
							  had no `shrink-0`, so it was the only thing in its column that
							  could give; and the sidebar had FOUR children with the same
							  problem, which is what cut the brand mark in half. Both fixes are
							  in and both are correct. The crop outlived them, so the control
							  comes out rather than taking a fourth attempt at it.
							
							  WHAT LEAVES WITH IT: the page title, the breadcrumb and the run
							  pill. `usePageHeader` and `PageHeader` are untouched and still
							  exported, so routes that claim a title still claim one — nothing
							  renders it. Restoring the header is restoring these seven lines.
							*/}
							<main
								className="app-scroll min-h-0 flex-1 overflow-y-auto p-6"
								data-testid="main"
								id="main-content"
								tabIndex={-1}
							>
								{children}
							</main>
						</div>
					</div>

					{compact ? (
						<NavDrawer
							onOpenChange={setDrawerOpen}
							open={drawerOpen}
							returnFocusTo={navTriggerRef}
						>
							{sidebar}
						</NavDrawer>
					) : null}
				</div>
			</PageHeaderProvider>
		</TooltipProvider>
	);
}
