import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { CredentialForm } from "#/components/auth/credential-form";
import { OrDivider } from "#/components/auth/divider";
import { GitHubButton } from "#/components/auth/github-button";
import { Wordmark } from "#/components/shell/wordmark";
import { useTheme } from "#/components/theme/use-theme";
import { presentAuthError } from "#/contract/errors/auth-map";
import { AUTH_CODES, type AuthCode } from "#/contract/shared/errors";
import { signIn } from "#/routes/-lib/session";

/** Only a code the contract declares may reach the error map. */
function toAuthCode(raw: unknown): AuthCode | null {
	return AUTH_CODES.includes(raw as AuthCode) ? (raw as AuthCode) : null;
}

export const Route = createFileRoute("/login")({
	ssr: false,
	staticData: { device: "capture" as const },
	// Returns {} rather than { error: undefined } so `error` stays OPTIONAL.
	// Otherwise every navigate({ to: '/login' }) in the app is a type error,
	// and ?error=null ends up in the URL.
	validateSearch: (search: Record<string, unknown>): { error?: AuthCode } => {
		const code = toAuthCode(search.error);
		return code ? { error: code } : {};
	},
	component: Login,
});

function Login() {
	const navigate = useNavigate();
	const { error: searchError } = Route.useSearch();
	const [error, setError] = useState<AuthCode | null>(searchError ?? null);
	const [pending, setPending] = useState(false);
	const liveRef = useRef<HTMLDivElement>(null);
	const { theme } = useTheme();

	// The OAuth routes redirect back with ?error=CODE. Surface it on arrival.
	useEffect(() => {
		setError(searchError ?? null);
	}, [searchError]);

	const presented = error ? presentAuthError(error) : null;

	return (
		<div
			className={`app flex min-h-screen justify-center bg-app-bg px-5 text-text${theme === "light" ? " light" : ""}`}
			data-testid="login-page"
			data-theme={theme}
		>
			{/* Inputs and the submit button sit high on the page so a mobile
			    keyboard cannot cover them. Everything else goes underneath. */}
			<main className="flex w-full max-w-[352px] flex-col gap-5 pt-[12vh] pb-16">
				<div className="flex flex-col gap-2">
					<Wordmark />
					<h1 className="font-display text-title font-semibold tracking-[-0.01em]">
						Sign in to the Command Center
					</h1>
				</div>

				{/* Announced when it changes, so a failure is not silent to a
				    screen reader. Present in the DOM at all times: a region that
				    appears only on error is often not announced at all. */}
				<div
					aria-live="polite"
					className={presented ? "flex flex-col gap-1" : "sr-only"}
					data-testid="login-error"
					ref={liveRef}
					role="status"
				>
					{presented ? (
						<>
							<span
								className="font-mono text-micro text-gate-block"
								data-testid="login-error-code"
							>
								{error}
							</span>
							<p className="text-sm font-medium text-text">{presented.title}</p>
							<p className="text-sm leading-relaxed text-text-muted">
								{presented.body}
							</p>
						</>
					) : null}
				</div>

				<GitHubButton />
				<OrDivider />

				<CredentialForm
					onSubmit={(email, password) => {
						setPending(true);
						// No backend today. The gate mechanism is real; the identity
						// source is a stub. Replacing this call is the whole migration.
						if (!email || password.length < 8) {
							setError("INVALID_CREDENTIALS");
							setPending(false);
							return;
						}
						setError(null);
						signIn(email);
						void navigate({ to: "/missions" });
					}}
					pending={pending}
				/>

				<div className="flex items-center justify-between text-xs">
					<a
						className="text-accent-text hover:text-accent-hover"
						data-testid="login-forgot"
						href="/login"
					>
						Forgot your password?
					</a>
					<span className="font-mono text-text-subtle">avelco.dev</span>
				</div>

				<p className="border-t border-[var(--elevation-border-rest)] pt-4 text-xs leading-relaxed text-text-subtle">
					No auth provider is wired yet. The session gate is real and rejects
					hard; the identity source behind it is a stub. GitHub sign-in needs
					GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in{" "}
					<code className="font-mono">.env</code>.
				</p>
			</main>
		</div>
	);
}
