import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "#/components/cn";

/**
 * The centred empty state every unbuilt screen renders.
 *
 * ROUTES.md on the mission list: "Design it as onboarding, not as a blank
 * table." That applies to every screen before it has data, not just the first
 * one. An empty page that says nothing teaches nothing, and a spinner that
 * never resolves is worse.
 *
 * `blocked` is the honest part. Most of these screens are not empty because
 * nothing has happened yet — they are empty because the contract does not
 * define their procedures. Saying which one is missing turns a dead end into
 * a status, and it is a fact ROUTES.md already tracks.
 */
export function PageEmpty({
	icon: Icon,
	title,
	body,
	blocked,
	action,
	className,
}: {
	icon: LucideIcon;
	title: string;
	body: string;
	/** The contract gap or dependency that keeps this screen empty. */
	blocked?: string;
	action?: ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center",
				className,
			)}
			data-testid="page-empty"
		>
			<span
				aria-hidden="true"
				className="flex size-11 items-center justify-center rounded-md border border-[var(--elevation-border-rest)] bg-app-panel text-text-subtle"
			>
				<Icon size={20} strokeWidth={1.8} />
			</span>

			<div className="flex max-w-[46ch] flex-col gap-2">
				<h2
					className="font-display text-lg font-semibold text-text"
					data-testid="page-empty-title"
				>
					{title}
				</h2>
				<p className="text-sm leading-relaxed text-text-muted">{body}</p>
			</div>

			{blocked ? (
				<p
					className="max-w-[46ch] rounded-sm border border-[var(--elevation-border-rest)] bg-app-recessed px-3 py-2 font-mono text-micro leading-relaxed text-text-subtle"
					data-testid="page-empty-blocked"
				>
					{blocked}
				</p>
			) : null}

			{action ? <div className="pt-1">{action}</div> : null}
		</div>
	);
}
