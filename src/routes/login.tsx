import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { presentAuthError } from "#/contract/errors/auth-map";
import { AUTH_CODES, type AuthCode } from "#/contract/shared/errors";
import { CredentialForm } from "#/modules/auth/credential-form";
import { OrDivider } from "#/modules/auth/divider";
import { GitHubButton } from "#/modules/auth/github-button";
import { signIn } from "#/modules/auth/session";
import { Wordmark } from "#/modules/shell/wordmark";
import { useTheme } from "#/modules/theme/use-theme";

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
				{/*
				 * CENTRED, WORDMARK ONLY — no monogram. Operator ruling.
				 *
				 * The heading centres with it rather than staying left. A centred mark
				 * above a left-aligned heading reads as a misalignment, which is the
				 * defect this block had a moment ago in the other direction. Brand and
				 * heading share one axis.
				 *
				 * The FORM below stays left-aligned deliberately: inputs and their
				 * labels are read down a common left edge, and centring them would cost
				 * more than the symmetry is worth.
				 */}
				<div className="flex flex-col items-center gap-2.5 pt-2 pb-1 text-center">
					<Wordmark className="text-2xl" />
					<h1 className="font-display text-title font-semibold tracking-[-0.01em]">
						Sign in to the Command Center
					</h1>
				</div>

				{/* Announced when it changes, so a failure is not silent to a
				    screen reader. Present in the DOM at all times: a region that
				    appears only on error is often not announced at all. */}
				{/* biome-ignore lint/a11y/useSemanticElements: <output> is for form
				    results. This is a live region announcing a sign-in failure, and
				    role=status on a div is the correct ARIA pattern for that. */}
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
			</main>
		</div>
	);
}
