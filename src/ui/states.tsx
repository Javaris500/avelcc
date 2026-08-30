import type { ReactNode } from "react";
import { Button } from "#/ui/button";
import { cn } from "#/utils/cn";

/**
 * Empty is a designed screen, not a blank. ROUTES.md on the mission list:
 * "this is the screen a new operator sees before anything exists. Design it as
 * onboarding, not as a blank table."
 */
export function EmptyState({
	title,
	body,
	action,
	className,
}: {
	title: string;
	body: string;
	action?: ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn("flex flex-col items-start gap-2 px-6 py-14", className)}
			data-testid="empty-state"
		>
			<p className="font-display text-lg font-semibold text-text">{title}</p>
			<p className="max-w-[52ch] text-sm leading-relaxed text-text-muted">
				{body}
			</p>
			{action ? <div className="pt-2">{action}</div> : null}
		</div>
	);
}

/**
 * Deliberately prop-driven and contract-free. The error map lands in step 6 and
 * supplies `code`, `title` and `body`; this component never parses a message
 * and never imports a domain type.
 */
export function ErrorState({
	code,
	title,
	body,
	retry,
	action,
	className,
}: {
	code: string;
	title: string;
	body: string;
	retry?: () => void;
	/**
	 * The recovery that is NOT a retry. ERROR_MAP gives several codes a `link`
	 * or a `switch-target` — REPO_NO_ACCESS points at connections,
	 * POLICY_FORBIDS_TARGET offers a pull request instead — and until this slot
	 * existed every one of them rendered as no action at all, which quietly
	 * made the map's recovery column decorative for two thirds of its kinds.
	 *
	 * A ReactNode rather than a typed recovery, so this component stays
	 * prop-driven and contract-free: it must not learn what a target or a
	 * connection is. The caller knows what it can actually DO and passes the
	 * control; this only decides where it sits.
	 */
	action?: ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn("flex flex-col items-start gap-2 px-6 py-14", className)}
			data-testid="error-state"
		>
			<span
				className="font-mono text-xs text-gate-block"
				data-testid="error-code"
			>
				{code}
			</span>
			<p className="font-display text-lg font-semibold text-text">{title}</p>
			<p className="max-w-[52ch] text-sm leading-relaxed text-text-muted">
				{body}
			</p>
			{retry || action ? (
				<div className="flex flex-wrap items-center gap-3 pt-2">
					{retry ? (
						<Button
							data-testid="error-retry"
							onClick={retry}
							variant="secondary"
						>
							Try again
						</Button>
					) : null}
					{action}
				</div>
			) : null}
		</div>
	);
}
