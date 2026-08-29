/**
 * The session gate. Directories prefixed with "-" are ignored by the route
 * generator, so this sits inside src/routes/ without becoming a route.
 *
 * SCOPE: DAY-ONE-FRONTEND allows "no auth provider integration beyond the
 * session gate. Auth.js can wait a day." So the MECHANISM is real — the gate
 * rejects, and the rejection is a designed screen — while the identity source
 * is a cookie stub. Replacing readSession() is the whole migration.
 */

export type Session = {
	operator: string;
	workspace: string;
};

export class SessionRequiredError extends Error {
	constructor() {
		super("SESSION_REQUIRED");
		this.name = "SessionRequiredError";
	}
}

/**
 * The DISPLAY cookie, readable by script.
 *
 * The OAuth callback also sets an httpOnly `avel_session` that a server would
 * trust. This one exists only so the client can render a name and gate the UI.
 * It is never authority: the client renders the decision, the server makes it.
 * A client that lies about its session still cannot ship anything.
 *
 * These MUST differ. Reading the httpOnly cookie from script is impossible, so
 * pointing this at `avel_session` would leave the gate permanently locked out
 * after a successful OAuth sign-in.
 */
const COOKIE = "avel_operator";

function readCookie(name: string): string | null {
	if (typeof document === "undefined") return null;
	for (const part of document.cookie.split("; ")) {
		const [k, ...rest] = part.split("=");
		if (k === name) return decodeURIComponent(rest.join("="));
	}
	return null;
}

/**
 * DEV-ONLY AUTH BYPASS.
 *
 * `import.meta.env.DEV` is a compile-time constant. In a production build it is
 * literally `false`, so this branch is dead-code-eliminated and the bypass
 * cannot exist in shipped output — it is not a runtime flag someone can turn
 * on, and there is no env var that enables it in prod.
 *
 * Opt out with VITE_AUTH_BYPASS=0 when you need to exercise the gate itself.
 *
 * The operator name is deliberately "dev" rather than a plausible one. A
 * bypass that looks like a real session is a bypass someone forgets is on.
 */
function devSession(): Session | null {
	if (!import.meta.env.DEV) return null;
	if (import.meta.env.VITE_AUTH_BYPASS === "0") return null;
	return { operator: "dev", workspace: "Meridian Law" };
}

export function readSession(): Session | null {
	const raw = readCookie(COOKIE);
	if (raw) return { operator: raw, workspace: "Meridian Law" };
	return devSession();
}

export function signIn(operator: string): void {
	document.cookie = `${COOKIE}=${encodeURIComponent(operator)}; path=/; SameSite=Lax`;
}

export function signOut(): void {
	document.cookie = `${COOKIE}=; path=/; Max-Age=0; SameSite=Lax`;
}

/**
 * Rejected hard, not redirected softly. A soft redirect to /login loses the
 * fact that something was refused; the operator sees a login form and assumes
 * they were simply logged out.
 */
export function requireSession(): Session {
	const session = readSession();
	if (!session) throw new SessionRequiredError();
	return session;
}
