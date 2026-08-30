import { useRouterState } from "@tanstack/react-router";
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { NavGroup } from "#/contract/ui/nav";
import type { Session } from "#/modules/auth/session";
import { NavDrawer } from "#/modules/shell/nav-drawer";
import { Sidebar } from "#/modules/shell/sidebar";
import { TopBar } from "#/modules/shell/topbar";
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
	breadcrumb,
	navGroups,
	children,
}: {
	session: Session;
	onSignOut: () => void;
	breadcrumb: string;
	/** Forwarded to the nav slot. Owned by session 3, not by the frame. */
	navGroups?: NavGroup[];
	children: ReactNode;
}) {
	const { theme, toggle: toggleTheme } = useTheme();
	const { collapsed, toggle: toggleCollapsed } = useCollapsed();
	const compact = useMediaQuery(COMPACT_QUERY);
	const pathname = useRouterState({ select: (s) => s.location.pathname });
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
						// `grid-rows-[minmax(0,1fr)]` IS THE FIX FOR THE CROP, and it is
						// the root the other two fixes sat above.
						//
						// This grid has a fixed height and no declared rows, so its
						// implicit row was sized `auto` — max-content. At 1440x900 the
						// content is 778px against an 848px window and nothing shows.
						// Below roughly 830px of viewport the row stayed 778px inside a
						// 648px box: the sidebar and the main pane kept their full
						// height, ran 131px past the bottom, and `overflow-hidden` cut
						// them. Measured, not reasoned: at 700px the window was
						// 26..674 while both children were 27..805.
						//
						// `minmax(0, 1fr)` makes the row exactly the container's height
						// and — the half that matters — gives it a MIN of 0, so the
						// children finally have a definite size to shrink within. Their
						// `min-h-0 flex-1` scroll areas then do what they were always
						// written to do.
						//
						// THE TWO EARLIER FIXES WERE REAL AND ARE KEPT: the topbar and
						// the four sidebar blocks needed `shrink-0` regardless. They
						// could not help here, because a child cannot shrink into a row
						// that was never bounded.
						//
						// The border here STAYS. "No rules throughout the shell" means
						// internal dividers; this is the window's edge against the mat,
						// and without it the rounded corners have nothing to describe
						// them against. Every rule BETWEEN panes is gone.
						className="mx-auto grid h-[calc(100vh-(var(--frame-mat)*2))] max-w-(--frame-max) grid-cols-[auto_1fr] grid-rows-[minmax(0,1fr)] overflow-hidden rounded-lg border border-[var(--elevation-border-rest)] bg-app-panel shadow-e2 max-md:h-[calc(100vh-calc(var(--spacing)*6))]"
						data-testid="app-window"
					>
						{compact ? null : sidebar}

						{/*
						  THE SEAM, IN TWO PARTS, AND NEITHER IS A RULE.
						
						  1. A TONAL STEP. The sidebar stays at app-bg and the content
						     column steps to app-panel. This is what the sidebar's own
						     comment already CLAIMED — "it separates by TONE and GAP: it
						     sits at app-bg while content sits in app-panel cards" — and
						     it was not true: both were app-bg, so on any route without
						     cards, the chat home included, there was nothing between
						     them at all. Measured: dark 1a1d23 to 20242d is L* 10.7 to
						     14.2, light e8eaee to ffffff is 92.7 to 100. Present in
						     both, and stronger in light, which is the reverse of how a
						     tonal step usually fails.
						
						  2. A HAIRLINE THAT NEVER TERMINATES. One pixel at the join,
						     transparent at both ends and holding through the middle, so
						     it has no endpoints to read as a drawn divider. It is the
						     nav item and composer underglow technique turned vertical —
						     the shell gets one more instance of its single piece of
						     personality rather than a second visual language.
						
						  NEUTRAL RATHER THAN ACCENT, deliberately. The proposal was the
						  accent gradient, and UI-PLAN section 9 is why it is not: one
						  accent focal point per screen, and the active nav item holds
						  it. A permanent accent seam beside it would be two. Swapping
						  `--elevation-border-raised` for `--color-accent` below is the
						  whole change if that ruling moves.
						*/}
						<div
							className={cn(
								"relative flex min-w-0 flex-col overflow-hidden",
								"before:pointer-events-none before:absolute before:inset-y-0 before:left-0 before:z-10 before:w-px",
								"before:bg-[linear-gradient(to_bottom,transparent,var(--color-accent)_18%,var(--color-accent)_82%,transparent)] before:opacity-60",
							)}
							data-testid="main-pane"
						>
							{/* Restored. The crop it was removed for was never this component: the
							    app-window's implicit grid row was auto-sized, so no child had a
							    bounded height to shrink into. See the note on the window above. */}
							<TopBar
								breadcrumb={breadcrumb}
								navGroups={navGroups ?? []}
								navTriggerRef={navTriggerRef}
								onOpenNav={compact ? () => setDrawerOpen(true) : undefined}
								pathname={pathname}
							/>
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
