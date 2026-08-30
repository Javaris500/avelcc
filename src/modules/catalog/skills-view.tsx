import { Link } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";

import { RevocationChip, SkillTypeChip } from "#/modules/catalog/chips";
import {
	danglingAttachments,
	isRevoked,
	type SkillRow,
} from "#/modules/catalog/contract";
import { isoDate, plural } from "#/modules/catalog/format";
import { TERM } from "#/modules/catalog/jargon";
import { useSkills } from "#/modules/catalog/queries";
import { CatalogSurface } from "#/modules/catalog/screen";
import {
	type Column,
	DataNotice,
	DataTable,
	DefinitionList,
	EmptyState,
	FilterChips,
	MetricStat,
	type RowTone,
	SectionCard,
} from "#/modules/catalog/ui";
import { usePageHeader } from "#/modules/shell/use-page-header";
import { Tag } from "#/ui/badge";

/**
 * THE SKILLS CATALOG.
 *
 * Two decisions shape this screen and neither is cosmetic.
 *
 * 1. A REVOKED SKILL IS VISIBLY REVOKED, EVERYWHERE. It was possible for a
 *    revoked skill to render into a client package on this project, and the
 *    catalog is where that becomes noticeable or does not. So revocation gets a
 *    column of its own rather than a shade of grey, a metric of its own on the
 *    masthead, and a banner when a withdrawn skill is still attached to
 *    something that will carry it into a package.
 *
 * 2. A SKILL IS SHOWN WITH WHAT HOLDS IT. A list of skill names answers no
 *    question an operator has. "Which agents carry this" and "is anything still
 *    carrying this after I withdrew it" are the two that matter, and both need
 *    the attachment relations, so both sides of the join are on the row.
 *
 * REVOKED ROWS ARE NOT HIDDEN BY DEFAULT. The filter defaults to every row,
 * marked. Hiding them would make the live list look clean while leaving the
 * exposure invisible, which is exactly how the original bug survived.
 */

type StateFilter = "all" | "live" | "revoked";
type TypeFilter = "all" | "knowledge" | "capability";

/**
 * The header's one orienting line. Totals only.
 *
 * It does NOT repeat the risk numbers below it. The MetricStat row carries
 * "revoked but still attached" with the sentence explaining why zero is the
 * healthy value, and a bare count of it up here would be the same number
 * twice with the meaning stripped off one of them.
 */
function summarise(skills: SkillRow[]): string {
	const revoked = skills.filter(isRevoked).length;
	const sources = new Set(skills.map((s) => s.sourceId)).size;
	return `${plural(skills.length, "skill", "skills")} · ${revoked} revoked · from ${plural(sources, "source", "sources")}`;
}

export function SkillsCatalog() {
	/*
	 * THE SHELL RENDERS THE TITLE, not this screen.
	 *
	 * It printed its own <h1> until avel-71 moved the title into the shell
	 * header, and then every catalog page had TWO h1s reading the same word.
	 * Measured on the running app, not inferred: /catalog/sources was worse
	 * than a duplicate, carrying "Sources" from the nav-derived fallback and
	 * "Skill sources" from here, which is two names for one page.
	 *
	 * Claimed unconditionally, outside the four-state boundary, for the reason
	 * the in-content header was moved out in the first place: a screen with no
	 * endpoint behind it must still say what it is. `definition` is a separate
	 * slot from `subtitle` so the plain sentence naming the jargon is not
	 * competing with counts. The counts stay on the MetricStat row, which is
	 * inside the boundary because a count is not knowable until the read
	 * resolves.
	 */
	const query = useSkills();

	/*
	 * ONE CLAIM, ONE LATE FIELD. `subtitle` is a string and sits in the hook's
	 * dependency array, so it updates on its own when the read resolves. The
	 * earlier version of the hook read it from a ref and kept it out of the
	 * deps, which meant a subtitle arriving after its title was written and
	 * never read again; that is why this screen carried no counts at all for a
	 * while. avel-71 fixed the hook, so the workaround is gone rather than
	 * papered over.
	 *
	 * `undefined` until the read resolves, deliberately. A header printing a
	 * count above a screen that says "not built" would be asserting a number
	 * nothing measured.
	 */
	const skills = query.data?.data;
	usePageHeader({
		title: "Skills",
		definition: TERM.skill,
		subtitle: skills === undefined ? undefined : summarise(skills),
	});
	const [stateFilter, setStateFilter] = useState<StateFilter>("all");
	const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
	const [selectedId, setSelectedId] = useState<string | null>(null);

	return (
		<div className="flex flex-col gap-5 px-6 py-5">
			<CatalogSurface
				data-testid="skills"
				empty={
					<EmptyState
						body="A skill is know-how you attach to an agent. Nothing has been imported yet, so every agent template is carrying only what is written on it directly. Skills arrive from a source, and the catalog starts empty on purpose: what belongs in it depends on the work you take on."
						title="No skills in the catalog"
					/>
				}
				noun="skills catalog"
				query={query}
			>
				{(page) => {
					const skills = page.data;
					return (
						<SkillsCatalogBody
							onSelect={(id) =>
								setSelectedId((current) => (current === id ? null : id))
							}
							onStateFilter={setStateFilter}
							onTypeFilter={setTypeFilter}
							selectedId={selectedId}
							skills={skills}
							stateFilter={stateFilter}
							total={page.meta.total}
							typeFilter={typeFilter}
						/>
					);
				}}
			</CatalogSurface>
		</div>
	);
}

function SkillsCatalogBody({
	skills,
	total,
	stateFilter,
	typeFilter,
	onStateFilter,
	onTypeFilter,
	selectedId,
	onSelect,
}: {
	skills: SkillRow[];
	total: number;
	stateFilter: StateFilter;
	typeFilter: TypeFilter;
	onStateFilter: (value: StateFilter) => void;
	onTypeFilter: (value: TypeFilter) => void;
	selectedId: string | null;
	onSelect: (id: string) => void;
}) {
	const live = skills.filter((s) => !isRevoked(s));
	const revoked = skills.filter(isRevoked);
	const dangling = revoked.filter((s) => danglingAttachments(s) > 0);
	const danglingHolders = dangling.reduce(
		(sum, s) => sum + danglingAttachments(s),
		0,
	);

	const shown = useMemo(() => {
		return skills.filter((skill) => {
			const stateOk =
				stateFilter === "all" ||
				(stateFilter === "live" ? !isRevoked(skill) : isRevoked(skill));
			const typeOk = typeFilter === "all" || skill.type === typeFilter;
			return stateOk && typeOk;
		});
	}, [skills, stateFilter, typeFilter]);

	const selected = shown.find((s) => s.id === selectedId) ?? null;

	return (
		<>
			{skills.length === total ? null : (
				// The only count that has nowhere else to live. A partial page is a
				// fact about the READ, not about the catalog, so no MetricStat can
				// carry it and its absence would leave the totals below quietly wrong.
				<p className="text-micro text-text-subtle" data-testid="skills-partial">
					{skills.length} of {total} loaded. The rest are on a page this screen
					does not fetch yet, so every count below is of what is loaded.
				</p>
			)}

			<div className="flex flex-wrap gap-3">
				<MetricStat
					data-testid="skills-metric-live"
					hint="Available to attach to an agent."
					label="Live skills"
					value={live.length}
				/>
				<MetricStat
					data-testid="skills-metric-revoked"
					hint="Withdrawn, and kept because delivered work refers to them."
					label="Revoked"
					value={revoked.length}
				/>
				{/*
				 * THE NUMBER THIS SCREEN EXISTS FOR. Zero is the normal state and
				 * renders in the resting tone; anything above zero is a live
				 * exposure and renders as a warning, because every one of those
				 * holders will render the skill into a package without re-checking
				 * the catalog.
				 */}
				<MetricStat
					data-testid="skills-metric-dangling"
					hint={
						dangling.length === 0
							? "Nothing is carrying a withdrawn skill."
							: `Held by ${plural(danglingHolders, "agent or mission", "agents and missions")}.`
					}
					label="Revoked but still attached"
					tone={dangling.length === 0 ? "rest" : "warn"}
					value={dangling.length}
				/>
			</div>

			{dangling.length === 0 ? null : (
				<DataNotice
					body={`${plural(dangling.length, "skill has", "skills have")} been withdrawn from the catalog while something still holds ${dangling.length === 1 ? "it" : "them"}. Nothing re-checks the catalog when a package is built, so each holder will still ship the skill. Detaching it from the agent template is what stops that; revoking it here does not.`}
					data-testid="skills-dangling-notice"
					icon={ShieldAlert}
					title="A revoked skill is still attached to work"
					tone="block"
				/>
			)}

			<SectionCard
				action={
					<div className="flex flex-wrap items-center gap-4">
						<FilterChips
							data-testid="skills-filter-state"
							label="Filter by state"
							onChange={onStateFilter}
							options={[
								{ key: "all", label: "All", count: skills.length },
								{ key: "live", label: "Live", count: live.length },
								{ key: "revoked", label: "Revoked", count: revoked.length },
							]}
							value={stateFilter}
						/>
						<FilterChips
							data-testid="skills-filter-type"
							label="Filter by type"
							onChange={onTypeFilter}
							options={[
								{ key: "all", label: "Any type", count: skills.length },
								{
									key: "knowledge",
									label: "Knowledge",
									count: skills.filter((s) => s.type === "knowledge").length,
								},
								{
									key: "capability",
									label: "Capability",
									count: skills.filter((s) => s.type === "capability").length,
								},
							]}
							value={typeFilter}
						/>
					</div>
				}
				count={shown.length}
				data-testid="skills-table-card"
				title="Catalog"
			>
				<DataTable
					caption="Skills in the catalog, with what each one is attached to."
					columns={SKILL_COLUMNS}
					data-testid="skills-table"
					empty={
						<EmptyState
							body="No skill matches this filter. Every skill is still in the catalog; the filter above is hiding them."
							title="Nothing matches"
						/>
					}
					onSelect={onSelect}
					rowId={(row) => row.id}
					rowTone={skillRowTone}
					rows={shown}
					selectColumn="name"
					selectedId={selectedId}
				/>
			</SectionCard>

			{selected === null ? null : <SkillDetail skill={selected} />}
		</>
	);
}

function skillRowTone(skill: SkillRow): RowTone {
	if (isRevoked(skill)) return "revoked";
	// A live skill whose SOURCE was withdrawn is not itself withdrawn, and must
	// not be painted as though it were. It is flagged in the source column.
	return "rest";
}

const SKILL_COLUMNS: Column<SkillRow>[] = [
	{
		key: "name",
		header: "Skill",
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
		key: "state",
		header: "State",
		sortValue: (row) => (isRevoked(row) ? 0 : 1),
		render: (row) =>
			isRevoked(row) ? (
				<RevocationChip
					revokedAt={row.revokedAt}
					testId={`skill-revoked-${row.slug}`}
				/>
			) : (
				<span className="text-micro text-text-subtle">Live</span>
			),
	},
	{
		key: "type",
		header: "Type",
		sortValue: (row) => row.type,
		render: (row) => (
			<SkillTypeChip testId={`skill-type-${row.slug}`} type={row.type} />
		),
	},
	{
		key: "source",
		header: "Source",
		sortValue: (row) => row.sourceName,
		render: (row) => (
			<div className="flex flex-col gap-1">
				<span className="text-sm text-text-muted">{row.sourceName}</span>
				{row.sourceRevoked ? (
					<span className="text-micro text-gate-warn">source revoked</span>
				) : null}
			</div>
		),
	},
	{
		key: "attached",
		header: "Attached to",
		align: "end",
		sortValue: (row) =>
			row.attachedTo.templates.length + row.attachedTo.rosterEntries.length,
		render: (row) => {
			const templates = row.attachedTo.templates.length;
			const entries = row.attachedTo.rosterEntries.length;
			if (templates === 0 && entries === 0) {
				return (
					// Not "0". Nothing carrying a skill is a real and useful state, and
					// a bare zero in a column of counts reads as a missing value.
					<span className="text-micro text-text-subtle">nothing</span>
				);
			}
			return (
				<div className="flex flex-col items-end gap-0.5">
					<span className="text-sm text-text">
						{plural(templates, "template", "templates")}
					</span>
					<span className="text-micro text-text-subtle">
						{plural(entries, "roster entry", "roster entries")}
					</span>
				</div>
			);
		},
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

/**
 * IN-PAGE, NOT A ROUTE.
 *
 * A `/catalog/skills/$skillId` route would be the obvious shape and it is not
 * worth its cost right now: five sessions share one working tree,
 * `routeTree.gen.ts` is generated, and it has blocked merges twice. A detail
 * panel under the table costs no generated file and answers the same question.
 *
 * It becomes a route the moment the detail needs its own URL, which is the same
 * rule UI-PLAN section 5 applies to engagement detail.
 */
function SkillDetail({ skill }: { skill: SkillRow }) {
	const revoked = isRevoked(skill);
	const holders =
		skill.attachedTo.templates.length + skill.attachedTo.rosterEntries.length;

	return (
		<div className="flex flex-col gap-4" data-testid="skill-detail">
			{revoked ? (
				<DataNotice
					body={
						holders === 0
							? `Withdrawn on ${isoDate(skill.revokedAt ?? "")}. Nothing is attached to it, so nothing will ship it. It stays listed because work already delivered refers to it.`
							: `Withdrawn on ${isoDate(skill.revokedAt ?? "")}, and still attached to ${plural(holders, "place", "places")}. Each one will render this skill into its package. Revoking here did not detach it.`
					}
					data-testid="skill-detail-revoked"
					icon={ShieldAlert}
					title={
						holders === 0
							? "This skill is revoked"
							: "This skill is revoked and still in use"
					}
					tone={holders === 0 ? "warn" : "block"}
				/>
			) : null}

			<SectionCard data-testid="skill-detail-facts" title={skill.name}>
				<div className="px-4 py-4">
					<DefinitionList
						data-testid="skill-detail-list"
						items={[
							{
								label: "Slug",
								value: <Tag data-testid="skill-detail-slug">{skill.slug}</Tag>,
							},
							{
								label: "Type",
								value: (
									<SkillTypeChip testId="skill-detail-type" type={skill.type} />
								),
								hint:
									skill.type === "capability"
										? TERM.capabilitySkill
										: TERM.knowledgeSkill,
							},
							{
								label: "Source",
								value: skill.sourceName,
								hint: skill.sourceRevoked
									? "This source has been revoked. The skill was not, so it is still live and still attachable."
									: undefined,
							},
							{
								label: "Recommended for",
								value:
									skill.recommendedFor.length === 0 ? (
										<span className="text-text-subtle">
											Nothing recorded. Nothing is filtered by this.
										</span>
									) : (
										<div className="flex flex-wrap gap-1.5">
											{skill.recommendedFor.map((entry) => (
												<Tag data-testid="skill-detail-recommended" key={entry}>
													{entry}
												</Tag>
											))}
										</div>
									),
							},
							{
								label: "State",
								value: revoked ? (
									<RevocationChip
										revokedAt={skill.revokedAt}
										testId="skill-detail-state"
									/>
								) : (
									"Live"
								),
								hint: revoked ? TERM.revoked : undefined,
							},
							{
								label: "Added",
								value: (
									<span className="font-mono text-micro">
										{isoDate(skill.createdAt)}
									</span>
								),
							},
							{
								label: "Updated",
								value: (
									<span className="font-mono text-micro">
										{isoDate(skill.updatedAt)}
									</span>
								),
							},
						]}
					/>
				</div>
			</SectionCard>

			<SectionCard
				count={skill.attachedTo.templates.length}
				data-testid="skill-detail-templates"
				definition={TERM.agentTemplate}
				title="On agent templates"
			>
				{skill.attachedTo.templates.length === 0 ? (
					<EmptyState
						body="No agent template carries this skill, so no future mission will pick it up. A skill in the catalog does nothing until it is attached to a template."
						title="Not attached to any template"
					/>
				) : (
					<ul className="flex flex-col">
						{skill.attachedTo.templates.map((template) => (
							<li
								className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5"
								key={template.id}
							>
								<span className="font-display text-sm text-text">
									{template.name}
								</span>
								<Tag data-testid="skill-template-slug">{template.slug}</Tag>
								{template.revoked ? (
									<span className="text-micro text-text-subtle">
										template revoked
									</span>
								) : null}
								<Link
									className="ml-auto text-micro text-accent-text hover:text-accent-hover"
									data-testid="skill-template-link"
									to="/catalog/agents"
								>
									Open agent templates
								</Link>
							</li>
						))}
					</ul>
				)}
			</SectionCard>

			<SectionCard
				count={skill.attachedTo.rosterEntries.length}
				data-testid="skill-detail-roster"
				definition={TERM.rosterEntry}
				title="On mission teams"
			>
				{skill.attachedTo.rosterEntries.length === 0 ? (
					<EmptyState
						body="No mission team carries this skill today. That is not the same as no template carrying it: a template hands its skills over when a mission copies it in, so a newly attached skill shows up here only on the next mission."
						title="Not on any mission team"
					/>
				) : (
					<ul className="flex flex-col">
						{skill.attachedTo.rosterEntries.map((entry) => (
							<li
								className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5"
								key={entry.id}
							>
								<Link
									className="font-display text-sm text-accent-text hover:text-accent-hover"
									data-testid="skill-roster-link"
									params={{ missionId: entry.missionId }}
									to="/missions/$missionId"
								>
									{entry.missionTitle ?? "Unnamed mission"}
								</Link>
								<Tag data-testid="skill-roster-agent">{entry.agentSlug}</Tag>
								{entry.inactive ? (
									// Inactive is NOT safe here. `active` gates dispatch, not the
									// render, so an inactive entry still carries the skill into
									// the package.
									<span className="text-micro text-text-subtle">
										inactive · still carries this skill
									</span>
								) : null}
							</li>
						))}
					</ul>
				)}
			</SectionCard>

			<SectionCard data-testid="skill-detail-content" title="Skill content">
				<div className="px-4 py-4">
					<p className="pb-2 text-micro text-text-subtle">
						The source text, as stored. It is rendered as written rather than
						formatted, because nothing in this app turns markdown into markup
						and showing it half-formatted would misrepresent what an agent
						receives.
					</p>
					<pre className="app-scroll max-h-[28rem] overflow-auto rounded-sm bg-muted px-3 py-3 font-mono text-micro whitespace-pre-wrap text-text-muted">
						{skill.contentMd}
					</pre>
					{skill.avelEnhancementMd === null ? null : (
						<>
							<p className="pt-4 pb-2 text-micro text-text-subtle">
								AVEL's own addition to the imported text. It travels with the
								skill.
							</p>
							<pre className="app-scroll max-h-[28rem] overflow-auto rounded-sm bg-muted px-3 py-3 font-mono text-micro whitespace-pre-wrap text-text-muted">
								{skill.avelEnhancementMd}
							</pre>
						</>
					)}
				</div>
			</SectionCard>
		</div>
	);
}
