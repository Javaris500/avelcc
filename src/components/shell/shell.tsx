import type { ReactNode } from "react";

import { cn } from "#/components/cn";
import { Sidebar } from "#/components/shell/sidebar";
import { TopBar } from "#/components/shell/topbar";
import { useTheme } from "#/components/theme/use-theme";
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
	const { theme, toggle } = useTheme();

	return (
		<div
			className={cn(
				"app min-h-screen bg-app-bg p-[26px] text-text",
				theme === "light" && "light",
			)}
			data-testid="app-shell"
			data-theme={theme}
		>
			<div
				className="mx-auto grid h-[calc(100vh-52px)] max-w-[1440px] grid-cols-[238px_1fr] overflow-hidden rounded-lg border border-[var(--elevation-border-rest)] bg-app-bg shadow-e2 max-[1000px]:h-auto max-[1000px]:grid-cols-1"
				data-testid="app-window"
			>
				<Sidebar
					navGroups={navGroups}
					onSignOut={onSignOut}
					session={session}
				/>

				<div
					className="flex min-w-0 flex-col overflow-hidden"
					data-testid="main-pane"
				>
					<TopBar
						breadcrumb={breadcrumb}
						onToggleTheme={toggle}
						theme={theme}
					/>
					<main
						className="app-scroll min-h-0 flex-1 overflow-y-auto p-[22px]"
						data-testid="main"
					>
						{children}
					</main>
				</div>
			</div>
		</div>
	);
}
