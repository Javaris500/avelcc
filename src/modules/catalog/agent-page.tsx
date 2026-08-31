import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { AgentTemplateRow } from "#/contract/catalog";
import { AgentDetail } from "#/modules/catalog/agent-detail";
import { RevocationChip, RuntimeChip } from "#/modules/catalog/chips";
import { isRevoked } from "#/modules/catalog/derive";
import { plural } from "#/modules/catalog/format";
import { TERM } from "#/modules/catalog/jargon";
import { useAgentTemplates } from "#/modules/catalog/queries";
import { CatalogSurface } from "#/modules/catalog/screen";
import { EmptyState, PathBudget } from "#/modules/catalog/ui";
import { usePageHeader } from "#/modules/shell/use-page-header";
import { Tag } from "#/ui/badge";
import { cn } from "#/utils/cn";

/**
 * ONE AGENT TEMPLATE, ON ITS OWN PAGE.
 *
 * WHY THIS IS A ROUTE AND NOT THE PANEL IT REPLACES. The roster opened a
 * template into a panel BELOW the grid, so choosing a card scrolled you away
 * from the thing you had just chosen, and the identity document — the longest
 * single field in this product — arrived at the bottom of a page that was
 * already three screens tall.
 *
 * A worker you choose between deserves the same treatment as a mission: an
 * address. This one is linkable, survives a reload, and can be sent to someone.
 *
 * IT READS THE LIST, because there is no `get`. `contract/catalog.ts` declares
 * `list` for all three catalog entities and nothing else, deliberately — a
 * procedure nothing called would have been section 12 rule 6 applied to the
 * contract. The catalog is tens of rows written by one operator, so finding one
 * in a list already in the query cache costs nothing and needs no second
 * endpoint. If the catalog ever grows past that, `agentTemplate.get` is the
 * change, and it is a contract request rather than something to work around
 * here.
 */
export function AgentTemplatePage({ agentId }: { agentId: string }) {
	const query = useAgentTemplates();
	const template = query.data?.data.find((t) => t.id === agentId);

	usePageHeader({
		title: template?.name ?? "Agent template",
		definition: TERM.agentTemplate,
		subtitle: template === undefined ? undefined : template.slug,
	});

	return (
		<div className="flex flex-col gap-4">
			<BackLink />
			<CatalogSurface
				data-testid="agent-page"
				empty={
					<EmptyState
						body="No agent templates exist yet, so this address points at nothing. Templates are written in the catalog and copied into a mission when its team is assembled."
						title="No agent templates"
					/>
				}
				noun="agent template"
				query={query}
			>
				{() =>
					template === undefined ? (
						/*
						 * NOT the same as an empty catalog, and not an error either. The
						 * read succeeded and the catalog has rows; this particular id is
						 * not among them. A stale link is the ordinary way to arrive
						 * here, so it says that rather than reporting a fault.
						 */
						<EmptyState
							action={
								<Link
									className="text-sm text-accent-text hover:text-accent-hover"
									data-testid="agent-page-missing-back"
									to="/catalog/agents"
								>
									Back to all agent templates
								</Link>
							}
							body="The catalog loaded, and no template has this address. It was probably revoked and removed, or the link is from an older version of the catalog. Nothing is wrong with your data."
							title="No template at this address"
						/>
					) : (
						<>
							<Masthead template={template} />
							<AgentDetail template={template} />
						</>
					)
				}
			</CatalogSurface>
		</div>
	);
}

function BackLink() {
	return (
		<Link
			className="interactive -mx-2 flex w-fit items-center gap-1.5 rounded-sm px-2 py-1 text-micro text-text-muted"
			data-testid="agent-page-back"
			to="/catalog/agents"
		>
			<ArrowLeft aria-hidden="true" className="size-3.5" strokeWidth={1.8} />
			All agent templates
		</Link>
	);
}

/**
 * The facts you need before reading anything: who this is, what runs it, what
 * it may change. The boundary summary is up here rather than buried with the
 * globs, because "what can this thing write" is the question a reviewer asks
 * first and the path lists themselves are a detail of the answer.
 */
function Masthead({ template }: { template: AgentTemplateRow }) {
	const revoked = isRevoked(template);
	return (
		<header
			className="elev-1 flex flex-col gap-3 rounded-md px-4 py-4"
			data-testid="agent-page-masthead"
		>
			<div className="flex flex-wrap items-center gap-2">
				<h2
					className={cn(
						"font-display text-base",
						revoked
							? "text-text-subtle line-through"
							: "font-semibold text-text",
					)}
					data-testid="agent-page-name"
				>
					{template.name}
				</h2>
				<Tag data-testid="agent-page-slug">{template.slug}</Tag>
				<RuntimeChip runtime={template.runtime} testId="agent-page-runtime" />
				{revoked ? (
					<RevocationChip
						revokedAt={template.revokedAt}
						testId="agent-page-revoked"
					/>
				) : null}
			</div>

			<div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
				<p className="text-micro text-text-muted">
					{template.kind === "horizontal"
						? `Horizontal · ${template.team ?? "no band recorded"}`
						: `Feature · ${template.engagementName ?? "no engagement recorded"}`}
				</p>
				{/* Non-zero only, the same rule the card follows. */}
				{template.rosterUseCount === 0 ? null : (
					<p className="text-micro text-text-muted">
						On{" "}
						{plural(template.rosterUseCount, "mission team", "mission teams")}
					</p>
				)}
			</div>

			<div>
				<p className="pb-1 text-micro text-text-subtle">May change</p>
				<PathBudget
					appendOnly={template.appendOnlyPaths.length}
					data-testid="agent-page-paths"
					readonly={template.readonlyPaths.length}
					writable={template.writablePaths.length}
				/>
			</div>
		</header>
	);
}
