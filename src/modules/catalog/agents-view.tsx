import { Link } from "@tanstack/react-router";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";

import {
	RevocationChip,
	RevokedAttachmentChip,
	RuntimeChip,
	runtimeLabel,
	SkillTypeChip,
} from "#/modules/catalog/chips";
import {
	type AgentRuntime,
	type AgentTemplateRow,
	isRevoked,
	strandedModelContext,
} from "#/modules/catalog/contract";
import { isoDate, plural } from "#/modules/catalog/format";
import { TERM } from "#/modules/catalog/jargon";
import { useAgentTemplates } from "#/modules/catalog/queries";
import { CatalogSurface } from "#/modules/catalog/screen";
import {
	type Column,
	DataNotice,
	DataTable,
	DefinitionList,
	EmptyState,
	FilterChips,
	MetricStat,
	PageHeader,
	PathList,
	type RowTone,
	SectionCard,
} from "#/modules/catalog/ui";
import { Tag } from "#/ui/badge";

/**
 * THE AGENT TEMPLATE CATALOG.
 *
 * RUNTIME IS THE ORGANISING FACT OF THIS SCREEN, not one field among many.
 *
 * `agent_runtime` is `'model' | 'human' | 'code'`, and schema.ts records where
 * that vocabulary came from: `render/types.ts` declares it and `render.ts`
 * branches on it, because "a non-model agent loads no model context, so it
 * renders neither identity.md nor depth.md".
 *
 * That branch is invisible from the data. `identity_md` is NOT NULL on every
 * row regardless of runtime, so a human agent can hold a full page of written
 * context that the renderer will silently drop. Shipping model context to a
 * non-model agent was a real bug on this project, and the reason it was
 * possible is that nothing ever showed the two facts side by side.
 *
 * So runtime sits in the second column, next to the name, with an icon and a
 * word; and the detail panel does not show model context for a non-model agent.
 * It shows the absence, and it flags the case where the columns are populated
 * anyway.
 */

type RuntimeFilter = "all" | AgentRuntime;
type KindFilter = "all" | "horizontal" | "feature";
type StateFilter = "all" | "live" | "revoked";

export function AgentTemplateCatalog() {
	const query = useAgentTemplates();
	const [runtimeFilter, setRuntimeFilter] = useState<RuntimeFilter>("all");
	const [kindFilter, setKindFilter] = useState<KindFilter>("all");
	const [stateFilter, setStateFilter] = useState<StateFilter>("all");
	const [selectedId, setSelectedId] = useState<string | null>(null);

	return (
		<div className="flex flex-col gap-5 px-6 py-5">
			<CatalogSurface
				data-testid="agents"
				empty={
					<EmptyState
						body="An agent template is a reusable description of one worker: what it knows, what it may change, and what runs it. None exist yet, so a mission has nothing to build a team from. Templates are written here and copied into a mission when its team is assembled."
						title="No agent templates"
					/>
				}
				noun="agent template catalog"
				query={query}
			>
				{(page) => (
					<AgentCatalogBody
						kindFilter={kindFilter}
						onKindFilter={setKindFilter}
						onSelect={(id) =>
							setSelectedId((current) => (current === id ? null : id))
						}
						onStateFilter={setStateFilter}
						onRuntimeFilter={setRuntimeFilter}
						runtimeFilter={runtimeFilter}
						selectedId={selectedId}
						stateFilter={stateFilter}
						templates={page.data}
						total={page.meta.total}
					/>
				)}
			</CatalogSurface>
		</div>
	);
}

function AgentCatalogBody({
	templates,
	total,
	runtimeFilter,
	kindFilter,
	stateFilter,
	onRuntimeFilter,
	onKindFilter,
	onStateFilter,
	selectedId,
	onSelect,
}: {
	templates: AgentTemplateRow[];
	total: number;
	runtimeFilter: RuntimeFilter;
	kindFilter: KindFilter;
	stateFilter: StateFilter;
	onRuntimeFilter: (value: RuntimeFilter) => void;
	onKindFilter: (value: KindFilter) => void;
	onStateFilter: (value: StateFilter) => void;
	selectedId: string | null;
	onSelect: (id: string) => void;
}) {
	const live = templates.filter((t) => !isRevoked(t));
	const revoked = templates.filter(isRevoked);
	const nonModel = templates.filter((t) => t.runtime !== "model");
	const stranded = templates.filter(strandedModelContext);
	const carryingRevoked = templates.filter((t) =>
		t.skills.some((s) => s.revoked),
	);

	const shown = useMemo(
		() =>
			templates.filter((template) => {
				const runtimeOk =
					runtimeFilter === "all" || template.runtime === runtimeFilter;
				const kindOk = kindFilter === "all" || template.kind === kindFilter;
				const stateOk =
					stateFilter === "all" ||
					(stateFilter === "live" ? !isRevoked(template) : isRevoked(template));
				return runtimeOk && kindOk && stateOk;
			}),
		[templates, runtimeFilter, kindFilter, stateFilter],
	);

	const selected = shown.find((t) => t.id === selectedId) ?? null;

	return (
		<>
			<PageHeader
				data-testid="agents-header"
				definition={TERM.agentTemplate}
				subtitle={
					<>
						<span>
							{plural(live.length, "live template", "live templates")}
						</span>
						{/* The split, not two separate counts. "9 templates · 2 not run by
						    a model" leaves the operator doing the subtraction. */}
						<span>
							{templates.length - nonModel.length} run by a model,{" "}
							{nonModel.length} by a person or script
						</span>
						{templates.length === total ? null : (
							<span>
								{templates.length} of {total} loaded
							</span>
						)}
					</>
				}
				title="Agent templates"
			/>

			<div className="flex flex-wrap gap-3">
				<MetricStat
					data-testid="agents-metric-live"
					hint="Available for a mission to copy into its team."
					label="Live templates"
					value={live.length}
				/>
				<MetricStat
					data-testid="agents-metric-nonmodel"
					hint="A person or a script does the work. Neither receives written context."
					label="Not run by a model"
					value={nonModel.length}
				/>
				{/*
				 * BOTH OF THESE ARE SHIPPED BUGS, COUNTED. Zero is the normal state
				 * and reads as a fact; anything above zero reads as a warning,
				 * because both conditions put something into a package that should
				 * not be there.
				 */}
				<MetricStat
					data-testid="agents-metric-stranded"
					hint={
						stranded.length === 0
							? "No template stores context its runtime cannot receive."
							: "Written context stored on an agent that is not a model. It will never be sent."
					}
					label="Context that will not be sent"
					tone={stranded.length === 0 ? "rest" : "warn"}
					value={stranded.length}
				/>
				<MetricStat
					data-testid="agents-metric-revoked-skill"
					hint={
						carryingRevoked.length === 0
							? "No template carries a skill that was withdrawn."
							: "These templates still hand a withdrawn skill to every new mission."
					}
					label="Carrying a revoked skill"
					tone={carryingRevoked.length === 0 ? "rest" : "warn"}
					value={carryingRevoked.length}
				/>
			</div>

			{stranded.length === 0 ? null : (
				<DataNotice
					body={`${plural(stranded.length, "template stores", "templates store")} identity or depth text and ${stranded.length === 1 ? "is" : "are"} not run by a model. The renderer emits that text only for a model agent, so what is written on ${stranded.length === 1 ? "it" : "them"} never reaches anyone. Either the runtime is wrong or the text belongs somewhere a person or a script will actually read.`}
					data-testid="agents-stranded-notice"
					icon={AlertTriangle}
					title="Written context stored on an agent that cannot receive it"
					tone="warn"
				/>
			)}

			{carryingRevoked.length === 0 ? null : (
				<DataNotice
					body={`${plural(carryingRevoked.length, "template", "templates")} still ${carryingRevoked.length === 1 ? "carries" : "carry"} a skill that has been withdrawn from the catalog. Nothing re-checks the catalog when a package is built, so the withdrawn skill ships with every mission these templates join.`}
					data-testid="agents-revoked-skill-notice"
					icon={ShieldAlert}
					title="A revoked skill is still attached to a template"
					tone="block"
				/>
			)}

			<SectionCard
				action={
					<div className="flex flex-wrap items-center gap-4">
						<FilterChips
							data-testid="agents-filter-runtime"
							label="Filter by runtime"
							onChange={onRuntimeFilter}
							options={[
								{ key: "all", label: "Any runtime", count: templates.length },
								{
									key: "model",
									label: runtimeLabel("model"),
									count: templates.filter((t) => t.runtime === "model").length,
								},
								{
									key: "human",
									label: runtimeLabel("human"),
									count: templates.filter((t) => t.runtime === "human").length,
								},
								{
									key: "code",
									label: runtimeLabel("code"),
									count: templates.filter((t) => t.runtime === "code").length,
								},
							]}
							value={runtimeFilter}
						/>
						<FilterChips
							data-testid="agents-filter-kind"
							label="Filter by kind"
							onChange={onKindFilter}
							options={[
								{ key: "all", label: "Any kind", count: templates.length },
								{
									key: "horizontal",
									label: "Horizontal",
									count: templates.filter((t) => t.kind === "horizontal")
										.length,
								},
								{
									key: "feature",
									label: "Feature",
									count: templates.filter((t) => t.kind === "feature").length,
								},
							]}
							value={kindFilter}
						/>
						<FilterChips
							data-testid="agents-filter-state"
							label="Filter by state"
							onChange={onStateFilter}
							options={[
								{ key: "all", label: "All", count: templates.length },
								{ key: "live", label: "Live", count: live.length },
								{ key: "revoked", label: "Revoked", count: revoked.length },
							]}
							value={stateFilter}
						/>
					</div>
				}
				count={shown.length}
				data-testid="agents-table-card"
				definition={TERM.runtime}
				title="Templates"
			>
				<DataTable
					caption="Agent templates, with what runs each one and what it carries."
					columns={AGENT_COLUMNS}
					data-testid="agents-table"
					empty={
						<EmptyState
							body="No template matches this filter. Every template is still in the catalog; the filters above are hiding them."
							title="Nothing matches"
						/>
					}
					onSelect={onSelect}
					rowId={(row) => row.id}
					rowTone={(row): RowTone => (isRevoked(row) ? "revoked" : "rest")}
					rows={shown}
					selectColumn="name"
					selectedId={selectedId}
				/>
			</SectionCard>

			{selected === null ? null : <AgentDetail template={selected} />}
		</>
	);
}

const AGENT_COLUMNS: Column<AgentTemplateRow>[] = [
	{
		key: "name",
		header: "Agent",
		sortValue: (row) => row.name,
		render: (row) => (
			<div className="flex flex-col gap-1">
				<span
					className={
						isRevoked(row)
							? "font-display text-sm text-text-subtle line-through"
							: "font-display text-sm font-medium text-text"
					}
				>
					{row.name}
				</span>
				<span className="font-mono text-micro text-text-subtle">
					{row.slug}
				</span>
			</div>
		),
	},
	{
		/*
		 * SECOND COLUMN, and that placement is the point. It is the field that
		 * decides whether half a template's content is real, and it sat nowhere
		 * on any screen until now.
		 */
		key: "runtime",
		header: "Run by",
		sortValue: (row) => row.runtime,
		render: (row) => (
			<div className="flex flex-col items-start gap-1">
				<RuntimeChip
					runtime={row.runtime}
					testId={`agent-runtime-${row.slug}`}
				/>
				{strandedModelContext(row) ? (
					<span className="text-micro text-gate-warn">
						stores context it cannot receive
					</span>
				) : null}
			</div>
		),
	},
	{
		key: "state",
		header: "State",
		sortValue: (row) => (isRevoked(row) ? 0 : 1),
		render: (row) =>
			isRevoked(row) ? (
				<RevocationChip
					revokedAt={row.revokedAt}
					testId={`agent-revoked-${row.slug}`}
				/>
			) : (
				<span className="text-micro text-text-subtle">Live</span>
			),
	},
	{
		key: "kind",
		header: "Scope",
		sortValue: (row) => `${row.kind}:${row.team ?? row.clientName ?? ""}`,
		render: (row) => (
			<div className="flex flex-col gap-1">
				<span className="text-sm text-text-muted">
					{row.kind === "horizontal" ? "Horizontal" : "Feature"}
				</span>
				<span className="text-micro text-text-subtle">
					{/*
					 * The database guarantees exactly one of these is set: two CHECK
					 * constraints make team and engagement mutually exclusive by kind.
					 * The fallback exists for a row that arrived from somewhere that
					 * does not enforce them, and says so rather than showing a blank.
					 */}
					{row.team ?? row.engagementName ?? "no band or engagement recorded"}
				</span>
			</div>
		),
	},
	{
		key: "skills",
		header: "Skills",
		align: "end",
		sortValue: (row) => row.skills.length,
		render: (row) => {
			const revokedCount = row.skills.filter((s) => s.revoked).length;
			if (row.skills.length === 0) {
				return <span className="text-micro text-text-subtle">none</span>;
			}
			return (
				<div className="flex flex-col items-end gap-0.5">
					<span className="text-sm text-text">{row.skills.length}</span>
					{revokedCount > 0 ? (
						<span className="text-micro text-gate-block">
							{revokedCount} revoked
						</span>
					) : null}
				</div>
			);
		},
	},
	{
		key: "missions",
		header: "On teams",
		align: "end",
		secondary: true,
		sortValue: (row) => row.rosterUseCount,
		render: (row) =>
			row.rosterUseCount === 0 ? (
				<span className="text-micro text-text-subtle">never used</span>
			) : (
				<span className="text-sm text-text">{row.rosterUseCount}</span>
			),
	},
	{
		key: "updated",
		header: "Updated",
		align: "end",
		secondary: true,
		sortValue: (row) => row.updatedAt,
		render: (row) => (
			<span className="font-mono text-micro text-text-subtle">
				{isoDate(row.updatedAt)}
			</span>
		),
	},
];

/* ── detail ──────────────────────────────────────────────────────────────── */

function AgentDetail({ template }: { template: AgentTemplateRow }) {
	const revoked = isRevoked(template);
	const stranded = strandedModelContext(template);
	const revokedSkills = template.skills.filter((s) => s.revoked);

	return (
		<div className="flex flex-col gap-4" data-testid="agent-detail">
			{revoked ? (
				<DataNotice
					body={`Withdrawn on ${isoDate(template.revokedAt ?? "")}. No new mission can copy it in. Missions that already did keep their own copy of it, because a roster entry is a copy rather than a reference.`}
					data-testid="agent-detail-revoked"
					icon={ShieldAlert}
					title="This template is revoked"
					tone="warn"
				/>
			) : null}

			{stranded ? (
				<DataNotice
					body={`This template is run by ${runtimeLabel(template.runtime).toLowerCase()} and stores written context anyway. The renderer sends identity and depth text only to a model, so what is stored here reaches nobody. Either the runtime is wrong, or this text belongs in a brief a person can read.`}
					data-testid="agent-detail-stranded"
					icon={AlertTriangle}
					title="Stored context that will never be sent"
					tone="warn"
				/>
			) : null}

			{revokedSkills.length === 0 ? null : (
				<DataNotice
					body={`${plural(revokedSkills.length, "skill on this template has", "skills on this template have")} been withdrawn from the catalog: ${revokedSkills.map((s) => s.name).join(", ")}. Nothing re-checks the catalog when a package is built, so ${revokedSkills.length === 1 ? "it ships" : "they ship"} with every mission this template joins.`}
					data-testid="agent-detail-revoked-skills"
					icon={ShieldAlert}
					title="This template carries a revoked skill"
					tone="block"
				/>
			)}

			<SectionCard data-testid="agent-detail-facts" title={template.name}>
				<div className="px-4 py-4">
					<DefinitionList
						data-testid="agent-detail-list"
						items={[
							{
								label: "Slug",
								value: (
									<Tag data-testid="agent-detail-slug">{template.slug}</Tag>
								),
								hint: "The folder name in the delivered package and the key its file permissions are looked up by.",
							},
							{
								label: "Run by",
								value: (
									<RuntimeChip
										runtime={template.runtime}
										testId="agent-detail-runtime"
									/>
								),
								hint: TERM.runtime,
							},
							{
								label: "Scope",
								value:
									template.kind === "horizontal"
										? `Horizontal · ${template.team ?? "no band recorded"}`
										: `Feature · ${template.engagementName ?? "no engagement recorded"}`,
								hint:
									template.kind === "horizontal"
										? TERM.horizontalAgent
										: TERM.feature,
							},
							...(template.kind === "feature"
								? [
										{
											label: "Client",
											value:
												template.clientName ?? "No client name on the record.",
										},
									]
								: []),
							{
								label: "Waves",
								value:
									template.waveDefaults.length === 0 ? (
										<span className="text-text-subtle">
											None set. The mission decides when this agent runs.
										</span>
									) : (
										<div className="flex flex-wrap gap-1.5">
											{template.waveDefaults.map((wave) => (
												<Tag data-testid="agent-detail-wave" key={wave}>
													{wave}
												</Tag>
											))}
										</div>
									),
								hint: TERM.wave,
							},
							{
								label: "On mission teams",
								value:
									template.rosterUseCount === 0
										? "Never used. No mission has copied this template in."
										: plural(template.rosterUseCount, "team", "teams"),
								hint: TERM.rosterEntry,
							},
							{
								label: "Added",
								value: (
									<span className="font-mono text-micro">
										{isoDate(template.createdAt)}
									</span>
								),
							},
							{
								label: "Updated",
								value: (
									<span className="font-mono text-micro">
										{isoDate(template.updatedAt)}
									</span>
								),
							},
						]}
					/>
				</div>
			</SectionCard>

			<ModelContext template={template} />

			<SectionCard
				count={template.skills.length}
				data-testid="agent-detail-skills"
				definition={TERM.skill}
				title="Skills it carries"
			>
				{template.skills.length === 0 ? (
					<EmptyState
						body="No skill is attached, so this agent works from what is written on it alone. Skills are attached from the skills catalog and travel with the agent into every mission."
						title="No skills attached"
					/>
				) : (
					<ul className="flex flex-col">
						{template.skills.map((skill) => (
							<li
								className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--elevation-border-rest)] px-4 py-3 last:border-b-0"
								key={skill.id}
							>
								<span
									className={
										skill.revoked
											? "font-display text-sm text-text-subtle line-through"
											: "font-display text-sm text-text"
									}
								>
									{skill.name}
								</span>
								<SkillTypeChip
									testId={`agent-skill-type-${skill.slug}`}
									type={skill.type}
								/>
								{skill.revoked ? (
									<RevokedAttachmentChip
										testId={`agent-skill-revoked-${skill.slug}`}
									/>
								) : null}
								<Link
									className="ml-auto text-micro text-accent-text hover:text-accent-hover"
									data-testid="agent-skill-link"
									to="/catalog/skills"
								>
									Open skills
								</Link>
							</li>
						))}
					</ul>
				)}
			</SectionCard>

			<SectionCard data-testid="agent-detail-paths" title="What it may change">
				<div className="flex flex-col gap-5 px-4 py-4">
					<div>
						<p className="pb-1 text-sm font-medium text-text">Writable</p>
						<p className="max-w-[68ch] pb-2 text-micro leading-relaxed text-text-subtle">
							{TERM.writablePaths}
						</p>
						<PathList
							data-testid="agent-detail-writable"
							emptyLabel="No writable paths. This agent cannot change any file, which is a real configuration and not a missing one."
							paths={template.writablePaths}
						/>
					</div>
					<div>
						<p className="pb-1 text-sm font-medium text-text">Append-only</p>
						<p className="max-w-[68ch] pb-2 text-micro leading-relaxed text-text-subtle">
							{TERM.appendOnlyPaths}
						</p>
						<PathList
							data-testid="agent-detail-append"
							emptyLabel="No append-only paths. This agent cannot add itself to a shared file such as a composition root or a decision log."
							paths={template.appendOnlyPaths}
						/>
					</div>
					<div>
						<p className="pb-1 text-sm font-medium text-text">Read-only</p>
						<p className="max-w-[68ch] pb-2 text-micro leading-relaxed text-text-subtle">
							{TERM.readonlyPaths}
						</p>
						<PathList
							data-testid="agent-detail-readonly"
							emptyLabel="No read-only paths recorded."
							paths={template.readonlyPaths}
						/>
					</div>
				</div>
			</SectionCard>
		</div>
	);
}

/**
 * THE SECTION THAT REFUSES TO RENDER.
 *
 * For a model agent this shows identity.md and depth.md. For a person or a
 * script it shows neither, and says why, because that is what the renderer
 * actually does. Showing the text with a caveat beside it would put the operator
 * one glance away from believing a person receives it, which is the belief that
 * produced the bug.
 *
 * The stored text is not hidden entirely when it exists: the notice above says
 * it is there and will not be sent. Concealing it would trade one wrong belief
 * for another.
 */
function ModelContext({ template }: { template: AgentTemplateRow }) {
	if (template.runtime !== "model") {
		return (
			<SectionCard
				data-testid="agent-detail-context"
				definition={TERM.runtime}
				title="Written context"
			>
				<div className="px-4 py-4" data-context-sent="false">
					<p className="max-w-[68ch] text-sm leading-relaxed text-text-muted">
						This agent is {runtimeLabel(template.runtime).toLowerCase()}, so no
						written context is sent to it. Identity and depth text are built for
						a model to read and the delivered package leaves them out entirely
						for this agent.
					</p>
					{strandedModelContext(template) ? (
						<p className="max-w-[68ch] pt-2 text-sm leading-relaxed text-gate-warn">
							Text is stored on this template anyway. It is not shown here
							because showing it would suggest it is used.
						</p>
					) : null}
				</div>
			</SectionCard>
		);
	}

	return (
		<SectionCard
			data-testid="agent-detail-context"
			definition="Identity is who the agent is. Depth is how far it goes before asking. Both are sent to the model and nowhere else."
			title="Written context"
		>
			<div className="px-4 py-4" data-context-sent="true">
				<p className="pb-2 text-micro text-text-subtle">identity.md</p>
				<pre className="app-scroll max-h-[24rem] overflow-auto rounded-sm bg-muted px-3 py-3 font-mono text-micro whitespace-pre-wrap text-text-muted">
					{template.identityMd.trim().length === 0
						? "Empty. This agent is sent no identity text."
						: template.identityMd}
				</pre>
				<p className="pt-4 pb-2 text-micro text-text-subtle">depth.md</p>
				<pre className="app-scroll max-h-[24rem] overflow-auto rounded-sm bg-muted px-3 py-3 font-mono text-micro whitespace-pre-wrap text-text-muted">
					{(template.depthMd ?? "").trim().length === 0
						? "Not set. This agent is sent no depth text."
						: template.depthMd}
				</pre>
			</div>
		</SectionCard>
	);
}
