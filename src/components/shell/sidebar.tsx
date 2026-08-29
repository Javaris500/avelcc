import { Link } from "@tanstack/react-router";

import { cn } from "#/components/cn";
import { Wordmark } from "#/components/shell/wordmark";
import { DEVICE_GLYPH, DEVICE_LABEL, NAV } from "#/routes/-lib/nav";
import type { Session } from "#/routes/-lib/session";

function NavRow({
	label,
	to,
	device,
	built,
}: (typeof NAV)[number]["items"][number]) {
	const glyph = (
		<span
			aria-hidden="true"
			className="w-3 shrink-0 text-center font-mono text-[11px] text-text-subtle"
			title={DEVICE_LABEL[device]}
		>
			{DEVICE_GLYPH[device]}
		</span>
	);

	// Unbuilt: rendered, honest, and not navigable. No href, not focusable.
	if (!built || !to) {
		return (
			<span
				aria-disabled="true"
				className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-[13px] text-text-subtle opacity-[var(--opacity-disabled)]"
				data-built="false"
				data-testid={`nav-${label.toLowerCase().replace(/\s+/g, "-")}`}
				title="Not built yet"
			>
				{glyph}
				{label}
			</span>
		);
	}

	return (
		<Link
			activeProps={{ "data-active": "true" }}
			className={cn(
				"interactive flex items-center gap-2 rounded-sm px-2 py-1.5 text-[13px] text-text-muted",
				"data-[active=true]:bg-[var(--color-state-selected)] data-[active=true]:text-text",
			)}
			data-built="true"
			data-testid={`nav-${label.toLowerCase().replace(/\s+/g, "-")}`}
			to={to}
		>
			{glyph}
			{label}
		</Link>
	);
}

export function Sidebar({
	session,
	onSignOut,
}: {
	session: Session;
	onSignOut: () => void;
}) {
	return (
		<nav
			className="flex w-[232px] shrink-0 flex-col border-r border-[var(--elevation-border-rest)] bg-app-panel"
			data-testid="sidebar"
		>
			<div className="flex h-12 items-center px-3">
				<Wordmark />
			</div>

			{/* Workspace switcher */}
			<button
				className="interactive mx-2 flex items-center gap-2 rounded-sm px-2 py-1.5 text-left"
				data-testid="workspace-switcher"
				type="button"
			>
				<span className="size-4 shrink-0 rounded-xs bg-accent" />
				<span className="truncate text-[13px] text-text">
					{session.workspace}
				</span>
				<span
					aria-hidden="true"
					className="ml-auto font-mono text-[10px] text-text-subtle"
				>
					▾
				</span>
			</button>

			{/* Search. The F hint is the shortcut, shown rather than discovered. */}
			<button
				className="interactive mx-2 mt-2 flex items-center gap-2 rounded-sm border border-[var(--elevation-border-rest)] bg-app-recessed px-2 py-1.5 text-left"
				data-testid="search-trigger"
				type="button"
			>
				<span className="text-[13px] text-text-subtle">Search</span>
				<kbd
					className="ml-auto rounded-xs bg-app-raised px-1.5 py-0.5 font-mono text-[10px] text-text-muted"
					data-testid="search-hint"
				>
					F
				</kbd>
			</button>

			<div className="app-scroll mt-4 flex-1 overflow-y-auto px-2">
				{NAV.map((group) => (
					<div className="mb-4" key={group.label}>
						<p className="px-2 pb-1 font-mono text-[10px] tracking-wider text-text-subtle uppercase">
							{group.label}
						</p>
						{group.items.map((item) => (
							<NavRow key={item.label} {...item} />
						))}
					</div>
				))}
			</div>

			{/* Account, pinned bottom */}
			<div className="border-t border-[var(--elevation-border-rest)] p-2">
				<button
					className="interactive flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left"
					data-testid="account"
					onClick={onSignOut}
					type="button"
				>
					<span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-app-raised font-mono text-[10px] text-text-muted">
						{session.operator.slice(0, 2).toUpperCase()}
					</span>
					<span className="truncate text-[13px] text-text-muted">
						{session.operator}
					</span>
					<span className="ml-auto font-mono text-[10px] text-text-subtle">
						out
					</span>
				</button>
			</div>
		</nav>
	);
}
