import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRight, Building2, PackageCheck, Rocket } from "lucide-react";
import type { ReactNode } from "react";
import {
	type EntityKind,
	type EntityRef,
	hrefFor,
} from "#/modules/chat/entity";
import { StatusBadge } from "#/ui/badge";
import { cn } from "#/utils/cn";

/**
 * A mission, client or delivery rendered INSIDE a message.
 *
 * UI-PLAN section 7: "It is the seam between the chat and the product. When the
 * agent mentions a mission it must render as the mission." It is also the whole
 * argument for the tool-parts approach. If a tool result renders as a paragraph
 * of prose about a mission, the dependency bought a chat window. If it renders
 * as the mission, with the same status treatment as every list in the app and a
 * link that lands on the real screen, it bought a new way into the product.
 *
 * IT USES `StatusBadge`, NOT A NEW `StatusChip`. UI-PLAN section 2 lists
 * `StatusChip` as a component to build, on the grounds that `badge` is
 * presentational. Reading `src/ui/badge.tsx` first, that is not what is there:
 * `StatusBadge` already takes the closed tone set, already carries the gate
 * colour triples, and already pairs every tone with a distinct glyph so the
 * state survives without colour. Building a second component beside it would be
 * a second colour vocabulary for one job. Reported rather than acted on.
 *
 * ONE OF THE THREE KINDS DOES NOT LINK. Client detail and delivery detail are
 * UI-PLAN section 5 and are not built, so `hrefFor` returns null and the card
 * renders static. A card that looks clickable and lands on a 404 is worse than
 * a card that does not look clickable.
 */

const ICON: Record<EntityKind, LucideIcon> = {
	mission: Rocket,
	client: Building2,
	export: PackageCheck,
};

/** Named once, where it is first met. Section 12 rule 5. */
const KIND_LABEL: Record<EntityKind, string> = {
	mission: "Mission",
	client: "Client",
	export: "Delivery",
};

export function InlineEntityCard({ entity }: { entity: EntityRef }) {
	const href = hrefFor(entity);
	const Icon = ICON[entity.kind];

	const body = (
		<>
			<div className="flex items-center gap-2">
				<Icon
					aria-hidden="true"
					className="shrink-0 text-text-subtle"
					size={14}
					strokeWidth={1.8}
				/>
				<span className="font-mono text-micro tracking-wider text-text-subtle uppercase">
					{KIND_LABEL[entity.kind]}
				</span>
				{entity.status ? (
					<StatusBadge
						data-testid={`entity-${entity.id}-status`}
						tone={entity.tone}
					>
						{entity.status}
					</StatusBadge>
				) : null}
				{href ? (
					<ArrowUpRight
						aria-hidden="true"
						className="ml-auto shrink-0 text-text-subtle opacity-0 transition-opacity duration-[var(--duration-micro)] ease-[var(--ease-avel)] group-hover:opacity-100 motion-reduce:transition-none"
						size={14}
						strokeWidth={1.8}
					/>
				) : null}
			</div>

			<p className="font-display text-sm font-semibold text-text">
				{entity.title}
			</p>

			{entity.facts.length ? (
				<dl className="flex flex-wrap gap-x-4 gap-y-1">
					{entity.facts.map((fact) => (
						<div className="flex items-baseline gap-1.5" key={fact.label}>
							<dt className="text-xs text-text-subtle">{fact.label}</dt>
							<dd className="font-mono text-xs tabular-nums text-text-muted">
								{fact.value}
							</dd>
						</div>
					))}
				</dl>
			) : null}
		</>
	);

	const shell =
		"group flex w-full max-w-[46ch] flex-col gap-2 rounded-md border border-[var(--elevation-border-rest)] bg-app-panel p-3 text-left";

	if (!href) {
		return (
			<div
				className={shell}
				data-entity-kind={entity.kind}
				data-testid={`entity-${entity.id}`}
			>
				{body}
				{/*
				  Says why it does not go anywhere, rather than looking inert.
				  An operator who clicks and gets nothing learns the product is
				  broken; one who reads this learns the screen is not built.
				*/}
				<p className="text-xs text-text-subtle">
					{KIND_LABEL[entity.kind]} detail is not built yet.
				</p>
			</div>
		);
	}

	return (
		<Link
			className={cn(shell, "interactive")}
			data-entity-kind={entity.kind}
			data-testid={`entity-${entity.id}`}
			to={href as never}
		>
			{body}
		</Link>
	);
}

/** Several cards in one tool result stack, and stay off the message's measure. */
export function EntityList({ children }: { children: ReactNode }) {
	return <div className="flex flex-col gap-2">{children}</div>;
}
