import { Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { LabelWhenCollapsed } from "#/modules/shell/collapsed-label";
import { cn } from "#/utils/cn";

/**
 * The sidebar's find control: a trigger that becomes an input.
 *
 * EXTRACTED BECAUSE IT IS THREE CONCERNS, none of which is "render a sidebar".
 * It owns open/close state, a focus-return dance across a conditional remount,
 * and a GLOBAL keydown listener on `document`. A component that installs a
 * window-level listener is a component in its own right; inside a 419-line
 * sidebar it read as five more lines of markup.
 *
 * `collapsed` is the only thing it needs from the sidebar. Everything else is
 * its own.
 */

/** True when focus is somewhere that should receive the keystroke itself. */
function isTypingTarget(el: EventTarget | null): boolean {
	if (!(el instanceof HTMLElement)) return false;
	if (el.isContentEditable) return true;
	return ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

export function SidebarSearch({ collapsed }: { collapsed: boolean }) {
	const [searchOpen, setSearchOpen] = useState(false);
	const [query, setQuery] = useState("");

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

	if (searchOpen && !collapsed) {
		return (
			<div className="mb-5 shrink-0" data-testid="search-panel">
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
		);
	}

	return (
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
	);
}
