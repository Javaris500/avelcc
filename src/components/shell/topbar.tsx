import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Top bar: live pill on the left, right-aligned pill controls.
 *
 * Reference `.topbar`: 14px/22px padding, 12px gap, bottom border, and a
 * flex spacer that pushes the controls right. It wraps rather than overflows.
 */

/**
 * A right-aligned pill control. Reference `.ctl`: panel background, resting
 * border that strengthens on hover, full radius.
 */
function Control({
	children,
	onClick,
	testId,
}: {
	children: ReactNode;
	onClick?: () => void;
	testId: string;
}) {
	return (
		<button
			className="inline-flex items-center gap-2 rounded-full border border-[var(--elevation-border-rest)] bg-app-panel px-[13px] py-1.5 text-xs text-text-muted transition-[color,border-color] duration-[var(--duration-micro)] hover:border-[var(--elevation-border-raised)] hover:text-text"
			data-testid={testId}
			onClick={onClick}
			type="button"
		>
			{children}
		</button>
	);
}

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
			className="flex flex-wrap items-center gap-3 border-b border-[var(--elevation-border-rest)] px-[22px] py-3.5"
			data-testid="topbar"
		>
			{/* Live pill. Not a control — it reports, it does not act. */}
			<span
				className="inline-flex items-center gap-[7px] rounded-full border border-[var(--elevation-border-rest)] bg-app-panel px-[11px] py-1 text-xs text-text-muted"
				data-testid="live-pill"
			>
				<span
					aria-hidden="true"
					className="size-1.5 animate-pulse rounded-full bg-gate-pass"
					data-testid="live-dot"
				/>
				{breadcrumb}
			</span>

			<span aria-hidden="true" className="flex-1" data-testid="topbar-spacer" />

			<Control testId="control-theme" onClick={onToggleTheme}>
				{theme === "dark" ? "Light" : "Dark"}
			</Control>
			<Control testId="control-gates">
				All gates
				<ChevronDown
					aria-hidden="true"
					className="opacity-70"
					size={9}
					strokeWidth={2.4}
				/>
			</Control>
			<Control testId="control-target">
				github_pr
				<ChevronDown
					aria-hidden="true"
					className="opacity-70"
					size={9}
					strokeWidth={2.4}
				/>
			</Control>
		</header>
	);
}
