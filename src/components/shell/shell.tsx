import { type ReactNode, useCallback, useEffect, useState } from "react";

import { cn } from "#/components/cn";
import { Sidebar } from "#/components/shell/sidebar";
import { TopBar } from "#/components/shell/topbar";
import type { Session } from "#/routes/-lib/session";

const THEME_KEY = "avel.theme";

/**
 * The app shell.
 *
 * `.app` supplies tabular-nums and the text-subtle contrast fix. `.light` sits
 * HERE, on the shell wrapper, never on <html> — both are requirements the
 * patch and DAY-ONE-FRONTEND state explicitly, because the landing shares the
 * same stylesheet and must not follow the app's theme.
 */
export function Shell({
	session,
	onSignOut,
	breadcrumb,
	children,
}: {
	session: Session;
	onSignOut: () => void;
	breadcrumb: string;
	children: ReactNode;
}) {
	const [theme, setTheme] = useState<"dark" | "light">("dark");

	useEffect(() => {
		try {
			const stored = localStorage.getItem(THEME_KEY);
			if (stored === "light" || stored === "dark") setTheme(stored);
		} catch {
			// Private mode, blocked site data. The dark default is correct anyway.
		}
	}, []);

	const onToggleTheme = useCallback(() => {
		setTheme((prev) => {
			const next = prev === "dark" ? "light" : "dark";
			try {
				localStorage.setItem(THEME_KEY, next);
			} catch {
				// Non-fatal: the toggle still works for this session.
			}
			return next;
		});
	}, []);

	return (
		<div
			className={cn(
				"app flex h-screen bg-app-bg text-text",
				theme === "light" && "light",
			)}
			data-testid="app-shell"
			data-theme={theme}
		>
			<Sidebar onSignOut={onSignOut} session={session} />
			<div className="flex min-w-0 flex-1 flex-col">
				<TopBar
					breadcrumb={breadcrumb}
					onToggleTheme={onToggleTheme}
					theme={theme}
				/>
				<main
					className="app-scroll min-h-0 flex-1 overflow-y-auto"
					data-testid="main"
				>
					{children}
				</main>
			</div>
		</div>
	);
}
