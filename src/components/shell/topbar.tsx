import { Pill } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";

/**
 * Top bar: live pill on the left, right-aligned pill controls.
 *
 * The theme toggle writes to the shell wrapper, never to <html> — the patch is
 * explicit that .light belongs on the app wrapper so the landing is untouched.
 */
export function TopBar({
	theme,
	onToggleTheme,
	breadcrumb,
}: {
	theme: "dark" | "light";
	onToggleTheme: () => void;
	breadcrumb: string;
}) {
	return (
		<header
			className="flex h-12 shrink-0 items-center gap-3 border-b border-[var(--elevation-border-rest)] px-4"
			data-testid="topbar"
		>
			<Pill data-testid="live-pill">
				<span
					aria-hidden="true"
					className="size-1.5 rounded-full bg-gate-pass"
					data-testid="live-dot"
				/>
				Live
			</Pill>

			<span
				className="font-mono text-[12px] text-text-muted"
				data-testid="breadcrumb"
			>
				{breadcrumb}
			</span>

			<div className="ml-auto flex items-center gap-2">
				<Button
					data-testid="theme-toggle"
					onClick={onToggleTheme}
					size="sm"
					variant="ghost"
				>
					{theme === "dark" ? "Light" : "Dark"}
				</Button>
			</div>
		</header>
	);
}
