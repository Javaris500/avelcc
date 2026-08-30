import {
	ChevronDown,
	LogOut,
	Moon,
	PanelLeftClose,
	PanelLeftOpen,
	Search,
	Sun,
} from "lucide-react";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import type { NavGroup } from "#/contract/ui/nav";
import type { Session } from "#/modules/auth/session";
import { NAV, NavTree } from "#/modules/nav";
import { BrandMark, Wordmark } from "#/modules/shell/wordmark";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "#/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "#/ui/tooltip";
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

/** True when focus is somewhere that should receive the keystroke itself. */
function isTypingTarget(el: EventTarget | null): boolean {
	if (!(el instanceof HTMLElement)) return false;
	if (el.isContentEditable) return true;
	return ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

/** Wraps a trigger in a tooltip only when its visible label is gone. */
function LabelWhenCollapsed({
	collapsed,
	label,
	testId,
	children,
}: {
	collapsed: boolean;
	label: string;
	testId: string;
	children: ReactNode;
}) {
	if (!collapsed) return children;
	return (
		<Tooltip>
			<TooltipTrigger asChild>{children}</TooltipTrigger>
			<TooltipContent data-testid={testId} side="right">
				{label}
			</TooltipContent>
		</Tooltip>
	);
}

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
	const [searchOpen, setSearchOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [navScrolled, setNavScrolled] = useState(false);

	const inputRef = useRef<HTMLInputElement>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const returnFocus = useRef(false);

	const openSearch = useCallback(() => setSearchOpen(true), []);

	const closeSearch = useCallback(() => {
		// Focus goes back where it came from, not to the top of the document.
		// It cannot be moved here: the trigger is conditionally rendered and does
		// not exist yet at this point, so triggerRef is still null. The effect
		// below runs after it remounts.
		returnFocus.current = true;
		setSearchOpen(false);
		setQuery("");
	}, []);

	// The `F` hint is displayed, so it has to work. A shortcut the product
	// advertises and does not honour is worse than no shortcut.
	useEffect(() => {
		function onKeyDown(event: KeyboardEvent) {
			if (event.key !== "f" && event.key !== "F") return;
			if (event.metaKey || event.ctrlKey || event.altKey) return;
			// Never steal a keystroke from someone typing.
			if (isTypingTarget(event.target)) return;
			event.preventDefault();
			openSearch();
		}
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [openSearch]);

	useEffect(() => {
		if (searchOpen) {
			inputRef.current?.focus();
		} else if (returnFocus.current) {
			returnFocus.current = false;
			triggerRef.current?.focus();
		}
	}, [searchOpen]);

	// A rail cannot hold an open text field. Collapsing closes it.
	useEffect(() => {
		if (collapsed) setSearchOpen(false);
	}, [collapsed]);

	const nextTheme = theme === "dark" ? "light" : "dark";

	return (
		<aside
			className={cn(
				// THE SIDEBAR IS A DIFFERENT PLANE, NOT A RAISED ONE. This painted
				// bg-app-panel, a surface meant for cards, which is most of "the
				// sidebar is too light". It sits at app-bg in both themes now.
				// This ships WITH the token change rather than after it: in light,
				// app-raised reverts to #ffffff, and a white control on a white
				// sidebar is the exact bug correction 5 was written to fix.
				// NO RULE. The sidebar separates from the content by TONE and GAP:
				// it sits at app-bg while content sits in app-panel cards. A
				// hairline is what you reach for when two surfaces share a colour,
				// and after the ramp they do not.
				"flex flex-col bg-app-bg py-3.5 transition-[width] duration-[var(--duration-micro)]",
				collapsed ? "w-16 items-center px-2" : "w-(--frame-sidebar) px-3",
			)}
			data-collapsed={collapsed}
			data-testid="sidebar"
		>
			{/* Brand */}
			<div
				className={cn(
					"flex items-center gap-2 pt-1 pb-3.5",
					collapsed ? "justify-center" : "px-1.5",
				)}
			>
				<BrandMark />
				{collapsed ? null : <Wordmark />}
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
							"interactive group mb-2 flex items-center gap-2 rounded-sm border border-[var(--elevation-border-rest)] bg-app-raised py-2 text-left hover:border-[var(--elevation-border-raised)]",
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
				<DropdownMenuContent align="start" data-testid="workspace-menu">
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

			{/* Search */}
			{searchOpen && !collapsed ? (
				<div className="mb-5" data-testid="search-panel">
					<input
						className="w-full rounded-sm border border-[var(--elevation-border-raised)] bg-app-recessed px-2.5 py-2 text-sm text-text placeholder:text-text-subtle"
						data-testid="search-input"
						onChange={(e) => setQuery(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Escape") closeSearch();
						}}
						placeholder="Find…"
						ref={inputRef}
						value={query}
					/>
					{query.length > 0 ? (
						// Honest: there is nothing to search yet.
						<p
							className="px-1 pt-2 text-micro text-text-subtle"
							data-testid="search-empty"
						>
							Nothing to search yet. No missions, clients or exports exist.
						</p>
					) : null}
				</div>
			) : (
				<LabelWhenCollapsed
					collapsed={collapsed}
					label="Find… (F)"
					testId="search-trigger-tip"
				>
					<button
						className={cn(
							"interactive mb-5 flex items-center gap-2 rounded-sm border border-[var(--elevation-border-rest)] py-2 text-left hover:border-[var(--elevation-border-raised)]",
							collapsed ? "justify-center px-2" : "px-2.5",
						)}
						data-testid="search-trigger"
						onClick={openSearch}
						ref={triggerRef}
						type="button"
					>
						<Search
							aria-hidden="true"
							className="shrink-0 text-text-subtle"
							size={13}
							strokeWidth={2.2}
						/>
						{collapsed ? null : (
							<>
								<span className="flex-1 text-sm text-text-subtle">Find…</span>
								<kbd
									className="rounded-xs border border-[var(--elevation-border-rest)] px-1 py-px font-mono text-micro text-text-subtle"
									data-testid="search-hint"
								>
									F
								</kbd>
							</>
						)}
					</button>
				</LabelWhenCollapsed>
			)}

			{/* Nav slot. The hairline appears once the list is scrolled, so a
			    cut-off list looks cut off rather than complete. */}
			<div
				className={cn(
					"app-scroll w-full min-h-0 flex-1 overflow-y-auto border-t border-transparent transition-colors duration-[var(--duration-micro)]",
					navScrolled && "border-[var(--elevation-border-rest)]",
				)}
				data-nav-groups={(navGroups ?? NAV).length}
				data-scrolled={navScrolled}
				data-testid="nav-slot"
				onScroll={(e) => setNavScrolled(e.currentTarget.scrollTop > 0)}
			>
				<NavTree collapsed={collapsed} groups={navGroups ?? NAV} />
			</div>

			{/* Footer: the operator's own controls. */}
			<div
				className={cn(
					"mt-auto flex w-full flex-col gap-1 border-t border-[var(--elevation-border-rest)] pt-3",
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
