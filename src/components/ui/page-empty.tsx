import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "#/components/cn";

/**
 * The centred empty state every screen renders before it has data.
 *
 * ROUTES.md on the mission list: "Design it as onboarding, not as a blank
 * table." One idea, said once. An earlier version carried a second monospaced
 * block naming the contract gap that kept each screen empty — accurate, and
 * wrong here: it turned a calm empty state into two competing messages and put
 * implementation detail in front of an operator who cannot act on it. That
 * belongs in ROUTES.md, which already tracks it.
 */
export function PageEmpty({
	icon: Icon,
	title,
	body,
	action,
	className,
}: {
	icon: LucideIcon;
	title: string;
	body: string;
	action?: ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"flex min-h-[70vh] flex-col items-center justify-center px-6 text-center",
				className,
			)}
			data-testid="page-empty"
		>
			{/* Quiet, and sized off the icon scale rather than a literal. The mark
			    orients; it should not be the loudest thing on an empty screen. */}
			<span
				aria-hidden="true"
				className="mb-5 flex size-12 items-center justify-center rounded-full border border-[var(--elevation-border-rest)] bg-app-panel text-text-subtle"
			>
				<Icon size={20} strokeWidth={1.6} />
			</span>

			<h2
				className="font-display text-lg font-semibold text-text"
				data-testid="page-empty-title"
			>
				{title}
			</h2>

			<p className="mt-2 max-w-[44ch] text-sm leading-relaxed text-balance text-text-muted">
				{body}
			</p>

			{action ? <div className="mt-5">{action}</div> : null}
		</div>
	);
}
