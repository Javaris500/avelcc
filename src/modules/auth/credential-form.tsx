import { useId, useState } from "react";
import { Button } from "#/ui/button";
import { cn } from "#/utils/cn";

/**
 * Sign-in form.
 *
 * The attributes here are not stylistic. Per the sign-in guidance:
 *  - autocomplete="username" on the email, because password managers key on
 *    `username` even when the field is type="email"
 *  - id="current-password" AND autocomplete="current-password", which is what
 *    tells a browser to offer the stored password rather than generate a new one
 *  - required on both, so the browser prompts and focuses the empty field
 *  - a real <form> with a submit button, so autofill offers to save at all
 *  - stable id and name values, since a browser will not store credentials for
 *    fields whose identifiers change between deployments
 *
 * Get these wrong and the page still looks perfect while silently breaking
 * every password manager. They are checked in the browser test for that reason.
 */
export function CredentialForm({
	onSubmit,
	pending,
}: {
	onSubmit: (email: string, password: string) => void;
	pending?: boolean;
}) {
	const emailId = useId();
	const [reveal, setReveal] = useState(false);

	return (
		<form
			className="flex flex-col gap-3"
			data-testid="login-form"
			noValidate={false}
			onSubmit={(e) => {
				e.preventDefault();
				const data = new FormData(e.currentTarget);
				onSubmit(
					String(data.get("email") ?? ""),
					String(data.get("password") ?? ""),
				);
			}}
		>
			<div className="flex flex-col gap-1.5">
				<label className="text-sm text-text-muted" htmlFor={emailId}>
					Email
				</label>
				<input
					autoComplete="username"
					className={fieldClass}
					data-testid="login-email"
					id={emailId}
					name="email"
					required
					type="email"
				/>
			</div>

			<div className="flex flex-col gap-1.5">
				<div className="flex items-baseline justify-between gap-2">
					{/* The id is fixed at "current-password" deliberately; browsers key
              password-manager heuristics on it. useId would randomise it. */}
					<label className="text-sm text-text-muted" htmlFor="current-password">
						Password
					</label>
					<button
						className="interactive rounded-xs px-1 text-xs text-text-subtle hover:text-text-muted"
						data-testid="login-reveal"
						onClick={() => setReveal((v) => !v)}
						type="button"
					>
						{reveal ? "Hide" : "Show"}
					</button>
				</div>
				<input
					autoComplete="current-password"
					className={fieldClass}
					data-testid="login-password"
					enterKeyHint="done"
					id="current-password"
					name="password"
					required
					type={reveal ? "text" : "password"}
				/>
			</div>

			<Button
				className="mt-1 w-full"
				data-testid="login-submit"
				disabled={pending}
				type="submit"
				variant="primary"
			>
				{pending ? "Signing in…" : "Sign in"}
			</Button>
		</form>
	);
}

const fieldClass = cn(
	"h-10 w-full rounded-xs bg-app-recessed px-2.5",
	"border border-[var(--elevation-border-rest)]",
	"text-sm text-text placeholder:text-text-subtle",
	// :user-invalid, not :invalid — a required empty field is invalid from the
	// moment it renders, and colouring it red before the user has typed is
	// punishing them for not having started yet.
	"user-invalid:border-gate-block",
	"disabled:opacity-[var(--opacity-disabled)]",
);
