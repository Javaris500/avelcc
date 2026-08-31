import { Link } from "@tanstack/react-router";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import { useMemo } from "react";
import type { AgentRuntime, AgentTemplateRow } from "#/contract/catalog";
import {
	RevocationChip,
	RuntimeChip,
	runtimeLabel,
	SkillTypeGlyph,
} from "#/modules/catalog/chips";
import { isRevoked, strandedModelContext } from "#/modules/catalog/derive";
import { plural, subtitleFor } from "#/modules/catalog/format";
import { TERM } from "#/modules/catalog/jargon";
import { useAgentTemplates } from "#/modules/catalog/queries";
import { CatalogSurface } from "#/modules/catalog/screen";
import {
	ChecksPassed,
	DataNotice,
	EmptyState,
	FilterBar,
	FilterChips,
	FilterSummary,
	PathBudget,
	SectionCard,
} from "#/modules/catalog/ui";
import { usePageHeader } from "#/modules/shell/use-page-header";
import { Pill } from "#/ui/badge";
import { cn } from "#/utils/cn";

/**
 * THE AGENT ROSTER.
 *
 * WHY CARDS AND NOT A TABLE. An agent template is a WORKER: there are seven, the
 * number grows slowly, and the verb is choosing one. A table of seven people is
 * a spreadsheet of humans, sorting and filtering facts nobody sorts by. Cards
 * suit few-things-you-choose-between; the skills page is a library for the
 * opposite reason, many documents you read. Differentiating the two pages by
 * colour or chrome instead would make them look different and still be the same
 * page.
 *
 * THE ADDITION THAT MATTERS MOST IS THE BOUNDARY SUMMARY. `writablePaths`,
 * `appendOnlyPaths` and `readonlyPaths` were on the wire from the first commit
 * and rendered nowhere. They are what makes an agent safe or dangerous and the
 * first thing a reviewer looks for, so every card carries the three counts and
 * the opened template carries the globs themselves.
 *
 * RUNTIME REMAINS THE ORGANISING FACT. `render.ts` emits identity.md and
 * depth.md only for `runtime === 'model'`, and `identity_md` is NOT NULL on
 * every row regardless, so a human agent can hold a page of context the renderer
 * silently drops. The badge is on every card, and the opened template refuses to
 * show model context for a non-model agent.
 */

type RuntimeFilter = "all" | AgentRuntime;
type KindFilter = "all" | "horizontal" | "feature";
type StateFilter = "all" | "live" | "revoked";

export type AgentsSearch = {
	runtime?: RuntimeFilter;
	kind?: KindFilter;
	state?: StateFilter;
	order?: OrderKey;
};

/**
 * CREATION ORDER IS NOT AN ORDER when the verb is "choose one". These three are
 * the questions a roster is actually scanned for; `added` stays as the default
 * because it is what the list already was and changing the default silently
 * would reorder a page someone had learned.
 */
export type OrderKey = "added" | "name" | "scope" | "skills";

const ORDER: Record<
	OrderKey,
	(a: AgentTemplateRow, b: AgentTemplateRow) => number
> = {
	added: () => 0,
	name: (a, b) => a.name.localeCompare(b.name),
	// Band or engagement, so horizontal agents group with their team and
	// feature agents group with the engagement they belong to.
	scope: (a, b) =>
		`${a.team ?? a.engagementName ?? ""}`.localeCompare(
			`${b.team ?? b.engagementName ?? ""}`,
		),
	// Most-carried first: the question is "which of these does the most".
	skills: (a, b) => b.skills.length - a.skills.length,
};

/** Totals only, and the runtime split rather than two counts to subtract. */
const summarise = (templates: AgentTemplateRow[] | undefined) =>
	subtitleFor(templates, (rows) => {
		const nonModel = rows.filter((t) => t.runtime !== "model").length;
		return [
			plural(rows.length, "template", "templates"),
			`${rows.length - nonModel} run by a model, ${nonModel} by a person or script`,
		];
	});

export function AgentTemplateCatalog({
	search,
	onSearch,
}: {
	search: AgentsSearch;
	onSearch: (next: AgentsSearch) => void;
}) {
	const query = useAgentTemplates();

	usePageHeader({
		title: "Agent templates",
		definition: TERM.agentTemplate,
		subtitle: summarise(query.data?.data),
	});

	return (
		<div className="flex flex-col gap-4">
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
					<AgentRoster
						onSearch={onSearch}
						search={search}
						templates={page.data}
						total={page.meta.total}
					/>
				)}
			</CatalogSurface>
		</div>
	);
}

function AgentRoster({
	templates,
	total,
	search,
	onSearch,
}: {
	templates: AgentTemplateRow[];
	total: number;
	search: AgentsSearch;
	onSearch: (next: AgentsSearch) => void;
}) {
	const runtimeFilter = search.runtime ?? "all";
	const kindFilter = search.kind ?? "all";
	const stateFilter = search.state ?? "all";

	const live = templates.filter((t) => !isRevoked(t));
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

	const order = search.order ?? "added";
	// A copy. Sorting `shown` in place mutates a react-query cache entry.
	const ordered = [...shown].sort(ORDER[order]);

	/*
	 * A CHECK IS A BANNER OR A CLAUSE, NEVER BOTH. Each of the two either fired
	 * and gets a banner with room for the consequence, or passed and gets one
	 * clause on the checked line. This pair used to be four metric cards, two of
	 * which restated the header subtitle and two of which restated the banners
	 * directly beneath them.
	 */
	const passed = [
		stranded.length === 0
			? {
					key: "stranded",
					label: "no template stores context its runtime cannot receive",
				}
			: null,
		carryingRevoked.length === 0
			? { key: "revoked-skill", label: "no template carries a revoked skill" }
			: null,
	].filter((item) => item !== null);

	return (
		<div className="flex flex-col gap-4">
			{passed.length === 0 ? null : (
				<ChecksPassed data-testid="agents-checks" items={passed} />
			)}
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
					body={`${plural(carryingRevoked.length, "template", "templates")} still ${carryingRevoked.length === 1 ? "carries" : "carry"} a skill that has been withdrawn from the catalog. Nothing re-checks the catalog when a package is built, so the withdrawn skill ships with every mission ${carryingRevoked.length === 1 ? "that template joins" : "those templates join"}.`}
					data-testid="agents-revoked-skill-notice"
					icon={ShieldAlert}
					title="A revoked skill is still attached to a template"
					tone="block"
				/>
			)}
			{templates.length === total ? null : (
				<p className="text-micro text-text-subtle" data-testid="agents-partial">
					{templates.length} of {total} loaded. Every count is of what is
					loaded.
				</p>
			)}
			<FilterBar
				data-testid="agents-filterbar"
				order={
					/*
					 * NO COUNTS. Ordering is not filtering, and every option carried
					 * `templates.length` purely to satisfy the old required prop —
					 * "Added 7 · Name 7 · Scope 7 · Skills 7", four identical numbers
					 * that meant nothing and made a sort look like a filter that had
					 * stopped working.
					 */
					<FilterChips
						data-testid="agents-order"
						label="Order by"
						onChange={(next) => onSearch({ ...search, order: next })}
						options={[
							{ key: "added", label: "Added" },
							{ key: "name", label: "Name" },
							{ key: "scope", label: "Scope" },
							{ key: "skills", label: "Skills" },
						]}
						value={order}
					/>
				}
				summary={
					<FilterSummary
						data-testid="agents-filter-summary"
						noun="templates"
						onClear={() => onSearch({})}
						shown={ordered.length}
						total={templates.length}
					/>
				}
			>
				<FilterChips
					data-testid="agents-filter-runtime"
					label="Runtime"
					onChange={(runtime) => onSearch({ ...search, runtime })}
					options={[
						{ key: "all", label: "All", count: templates.length },
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
					label="Kind"
					onChange={(kind) => onSearch({ ...search, kind })}
					options={[
						{ key: "all", label: "All", count: templates.length },
						{
							key: "horizontal",
							label: "Horizontal",
							count: templates.filter((t) => t.kind === "horizontal").length,
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
					label="State"
					onChange={(state) => onSearch({ ...search, state })}
					options={[
						{ key: "all", label: "All", count: templates.length },
						{ key: "live", label: "Live", count: live.length },
						{
							key: "revoked",
							label: "Revoked",
							count: templates.length - live.length,
						},
					]}
					value={stateFilter}
				/>
			</FilterBar>
			{ordered.length === 0 ? (
				<SectionCard data-testid="agents-grid-empty" title="No match">
					<EmptyState
						body="No template matches these filters. Every template is still in the catalog; the filters above are hiding them."
						title="Nothing matches"
					/>
				</SectionCard>
			) : (
				/*
				 * Three columns at xl, two at md, around 330px each in the 1440
				 * frame. `auto-rows-fr` because a grid reads as a grid when its rows
				 * align, and these measured 307/307/307/280/280/280/249: skill chips
				 * wrap to two lines on some cards and one on others.
				 */
				<ul
					className="grid auto-rows-fr grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3"
					data-testid="agents-grid"
				>
					{ordered.map((template) => (
						<AgentCard key={template.id} template={template} />
					))}
				</ul>
			)}
		</div>
	);
}

/**
 * One worker, as a card.
 *
 * THE WHOLE CARD IS NOT A BUTTON. The card carries a skills list whose entries
 * are their own links, and nesting an anchor inside a button is invalid markup
 * and unreachable by keyboard. The name is the control, which is also what an
 * operator aims at.
 */
function AgentCard({ template }: { template: AgentTemplateRow }) {
	const revoked = isRevoked(template);

	return (
		<li
			className="elev-1 flex flex-col gap-3 rounded-md p-4"
			data-testid="agent-card"
		>
			{/*
			 * THE WHOLE HEADER IS THE CONTROL, name and slug together. It used to
			 * be the name alone, which is a click target the width of a word on a
			 * 337px card, and nothing else signalled what was clickable.
			 *
			 * Still not the whole card: the skill chips below are their own links,
			 * and an anchor inside a button is invalid markup and unreachable by
			 * keyboard.
			 */}
			<Link
				className="interactive -mx-2 flex flex-col gap-1 rounded-sm px-2 py-1 text-left"
				data-testid="agent-card-open"
				params={{ agentId: template.id }}
				to="/catalog/agent/$agentId"
			>
				<span
					className={cn(
						"font-display text-sm",
						revoked
							? "text-text-subtle line-through"
							: "font-semibold text-text",
					)}
				>
					{template.name}
				</span>
				<span className="font-mono text-micro text-text-subtle">
					{template.slug}
				</span>
			</Link>

			<div className="flex flex-wrap items-center gap-2">
				<RuntimeChip
					runtime={template.runtime}
					testId={`agent-runtime-${template.slug}`}
				/>
				{revoked ? (
					<RevocationChip
						revokedAt={template.revokedAt}
						testId={`agent-revoked-${template.slug}`}
					/>
				) : null}
			</div>

			<p className="text-micro text-text-muted" data-testid="agent-card-scope">
				{template.kind === "horizontal"
					? `Horizontal · ${template.team ?? "no band recorded"}`
					: `Feature · ${template.engagementName ?? "no engagement recorded"}`}
			</p>

			{/*
			 * THE FACT A REVIEWER LOOKS FOR FIRST, and it appeared nowhere in this
			 * product before. Never summed: writable, append-only and read-only are
			 * three different grants, not three shades of one.
			 */}
			<div>
				<p className="pb-1 text-micro text-text-subtle">May change</p>
				<PathBudget
					appendOnly={template.appendOnlyPaths.length}
					data-testid={`agent-paths-${template.slug}`}
					readonly={template.readonlyPaths.length}
					writable={template.writablePaths.length}
				/>
			</div>

			<div>
				<p className="pb-1 text-micro text-text-subtle">
					{template.skills.length === 0
						? "No skills attached"
						: plural(template.skills.length, "skill", "skills")}
				</p>
				{template.skills.length === 0 ? null : (
					<div className="flex flex-wrap gap-1.5">
						{template.skills.map((skill) => (
							<Link
								data-testid="agent-card-skill"
								key={skill.id}
								search={{ skill: skill.id }}
								to="/catalog/skills"
							>
								<Pill
									className={cn(
										"gap-1",
										skill.revoked ? "text-gate-block line-through" : "",
									)}
									data-testid={`agent-card-skill-${skill.slug}`}
								>
									<SkillTypeGlyph
										testId={`agent-card-skill-type-${skill.slug}`}
										type={skill.type}
									/>
									{skill.name}
								</Pill>
							</Link>
						))}
					</div>
				)}
				{/* No sentence here. The struck-through chip marks WHICH skill, and
				    the page banner already carries the consequence once. */}
			</div>

			{/* Non-zero only. "0 teams" on a template nobody has used yet is the
			    normal state, and the opened template says so in words. */}
			{template.rosterUseCount === 0 ? null : (
				<p className="text-micro text-text-subtle" data-testid="agent-card-use">
					On {plural(template.rosterUseCount, "mission team", "mission teams")}
				</p>
			)}
		</li>
	);
}
