import { useCallback, useEffect, useState } from "react";

/**
 * Whether the sidebar is collapsed to an icon rail.
 *
 * Same shape as useTheme, deliberately: a per-operator preference that
 * survives reloads. It lives in ONE place and is passed down rather than read
 * twice — two instances desync the moment either is toggled.
 *
 * Starts expanded and corrects after mount. Reading localStorage during render
 * is a server/client mismatch on any SSR'd route, and every access is wrapped
 * because private mode throws rather than returning null.
 */

const KEY = "avel.sidebar.collapsed";

function read(): boolean {
	try {
		return localStorage.getItem(KEY) === "true";
	} catch {
		// Site data blocked. Expanded is the correct default.
		return false;
	}
}

export function useCollapsed(): { collapsed: boolean; toggle: () => void } {
	const [collapsed, setCollapsed] = useState(false);

	useEffect(() => {
		setCollapsed(read());
	}, []);

	const toggle = useCallback(() => {
		setCollapsed((prev) => {
			const next = !prev;
			try {
				localStorage.setItem(KEY, String(next));
			} catch {
				// Non-fatal: the toggle still works for this session.
			}
			return next;
		});
	}, []);

	return { collapsed, toggle };
}
