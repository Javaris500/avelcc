import { createFileRoute } from "@tanstack/react-router";

import {
	authorizeUrl,
	cookie,
	newState,
	readOAuthConfig,
	STATE_COOKIE,
} from "#/modules/auth/oauth";

/**
 * Start the GitHub OAuth flow.
 *
 * A real endpoint, not a stub: it builds the real authorize URL and redirects.
 * The only thing missing on an unconfigured deployment is the credentials, and
 * that case redirects back to /login with a code the error map already
 * presents. Nothing here pretends to work.
 */
export const Route = createFileRoute("/api/auth/github")({
	server: {
		handlers: {
			GET: ({ request }) => {
				const config = readOAuthConfig();
				if (!config) {
					return new Response(null, {
						status: 302,
						headers: { Location: "/login?error=OAUTH_NOT_CONFIGURED" },
					});
				}

				const state = newState();
				const redirectUri = new URL(
					"/api/auth/github/callback",
					request.url,
				).toString();

				return new Response(null, {
					status: 302,
					headers: {
						Location: authorizeUrl(config.clientId, state, redirectUri),
						// httpOnly so the client cannot forge the value it will be
						// compared against. This is the CSRF guard for the whole flow.
						"Set-Cookie": cookie(STATE_COOKIE, state, {
							httpOnly: true,
							maxAge: 600,
						}),
					},
				});
			},
		},
	},
});
