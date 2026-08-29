import type { ReactNode } from "react";

import { cn } from "#/components/cn";
import { Sidebar } from "#/components/shell/sidebar";
import { TopBar } from "#/components/shell/topbar";
import { useCollapsed } from "#/components/shell/use-collapsed";
import { useTheme } from "#/components/theme/use-theme";
import { TooltipProvider } from "#/components/ui/tooltip";
import type { NavGroup } from "#/contract/ui/nav";
import type { Session } from "#/routes/-lib/session";

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

	return (
		<TooltipProvider delayDuration={300}>
			<div
				className={cn(
					"app min-h-screen bg-app-bg p-(--frame-mat) text-text",
					theme === "light" && "light",
				)}
				data-testid="app-shell"
				data-theme={theme}
			>
				{/* Twelve nav items sit before the content in tab order. Visually
			    hidden until focused, then a real, visible target. */}
				<a
					className="sr-only rounded-sm bg-app-float px-3 py-2 text-sm text-text focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
					data-testid="skip-to-content"
					href="#main-content"
				>
					Skip to content
				</a>
				<div
					className="mx-auto grid h-[calc(100vh-(var(--frame-mat)*2))] max-w-(--frame-max) grid-cols-[auto_1fr] overflow-hidden rounded-lg border border-[var(--elevation-border-rest)] bg-app-bg shadow-e2 max-[1000px]:h-auto max-[1000px]:grid-cols-1"
					data-testid="app-window"
				>
					<Sidebar
						collapsed={collapsed}
						navGroups={navGroups}
						onSignOut={onSignOut}
						onToggleCollapsed={toggleCollapsed}
						onToggleTheme={toggleTheme}
						session={session}
						theme={theme}
					/>

					<div
						className="flex min-w-0 flex-col overflow-hidden"
						data-testid="main-pane"
					>
						<TopBar breadcrumb={breadcrumb} />
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
			</div>
		</TooltipProvider>
	);
}
