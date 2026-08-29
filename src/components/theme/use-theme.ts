import { useCallback, useEffect, useState } from "react";

/**
 * The app theme, shared by the shell and the login page.
 *
 * This exists because login is OUTSIDE the shell: it renders its own .app
 * wrapper, so without a shared source an operator who chose light mode gets a
 * dark login page and a light app. Two surfaces, one stored preference.
 *
 * `.light` goes on whichever wrapper the caller renders — never on <html>.
 * The landing page shares this stylesheet and must not follow the app.
 */

export type Theme = "dark" | "light";

const KEY = "avel.theme";

function read(): Theme {
	try {
		const stored = localStorage.getItem(KEY);
		return stored === "light" ? "light" : "dark";
	} catch {
		// Private mode, or site data blocked. Dark is the correct default.
		return "dark";
	}
}

export function useTheme(): { theme: Theme; toggle: () => void } {
	// Always start dark, then correct after mount. Reading localStorage during
	// render would produce a server/client mismatch on any SSR'd route.
	const [theme, setTheme] = useState<Theme>("dark");

	useEffect(() => {
		setTheme(read());
	}, []);

	const toggle = useCallback(() => {
		setTheme((prev) => {
			const next: Theme = prev === "dark" ? "light" : "dark";
			try {
				localStorage.setItem(KEY, next);
			} catch {
				// Non-fatal: the toggle still works for this session.
			}
			return next;
		});
	}, []);

	return { theme, toggle };
}
