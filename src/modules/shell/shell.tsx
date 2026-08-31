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
 * Frame: `.page > .app > aside.side + .main`, full bleed. The app fills the
 * viewport — no mat, no rounded corners, no window border.
 *
 * It was a 26px mat around a bordered, rounded window, per the reference. The
 * operator's call reversed it: the inset read as a black margin rather than as
 * a frame. `overflow-hidden` stays on the window, now to contain the two
 * scrolling panes rather than to clip corners that no longer exist.
 *
 * `--frame-mat` and the elevation border are both still defined and still used
 * elsewhere; nothing was removed from the token layer for this.
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
						"app min-h-screen bg-app-bg text-text",
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
						// THE MAT, THE CORNERS AND THE WINDOW BORDER ARE GONE, on the
						// operator's call: the 26px inset read as a black margin around
						// the app rather than as a frame around a window. In dark it was
						// app-bg #1a1d23 against a panel at #1c1f25, so it was a near
						// black edge on all four sides.
						//
						// The border's justification retired with them. It stayed because
						// it was "the window's edge against the mat, and without it the
						// rounded corners have nothing to describe them against" — both
						// halves of that reason are false now, so dropping it follows the
						// no-rules rule rather than breaking it. Every rule BETWEEN panes
						// was already gone.
						//
						// `h-screen` replaces `100vh - mat*2`, and the `max-md` height
						// override goes with it: there is no inset to subtract at any
						// width any more. The grid row stays `minmax(0,1fr)` — that fix
						// was about giving children a bounded row to shrink within and
						// has nothing to do with the mat.
						className="mx-auto grid h-screen max-w-(--frame-max) grid-cols-[auto_1fr] grid-rows-[minmax(0,1fr)] overflow-hidden bg-app-panel"
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
						
						  NEUTRAL RATHER THAN ACCENT, and now actually so. This comment
						  claimed neutral while the gradient below read
						  `var(--color-accent)` — a load-bearing comment asserting the
						  opposite of its own code, which is the third instance of that
						  shape found today. The reasoning it states was right and was
						  never applied: UI-PLAN section 9 allows one accent focal point
						  per screen, the active nav item holds it, and a permanent
						  accent seam beside it is a second.

						  `--color-border-strong` rather than `--color-border`, because
						  the operator asked for the divider to be IMPROVED and the
						  weaker token is nearly invisible against a panel that just got
						  deeper: measured 1.91:1 dark and 1.24:1 light, against 2.67:1
						  and 1.47:1 for strong. Opacity goes to full for the same
						  reason — a neutral seam has none of accent's help.
						*/}
						<div
							className={cn(
								"relative flex min-w-0 flex-col overflow-hidden",
								"before:pointer-events-none before:absolute before:inset-y-0 before:left-0 before:z-10 before:w-px",
								"before:bg-[linear-gradient(to_bottom,transparent,var(--color-border-strong)_18%,var(--color-border-strong)_82%,transparent)]",
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
