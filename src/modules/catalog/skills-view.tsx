import { Link } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";
import type { SkillRow } from "#/contract/catalog";
import {
	RevocationMark,
	SkillTypeChip,
	SkillTypeGlyph,
} from "#/modules/catalog/chips";
import { danglingAttachments, isRevoked } from "#/modules/catalog/derive";
import { isoDate, plural, subtitleFor } from "#/modules/catalog/format";
import { TERM } from "#/modules/catalog/jargon";
import { useSkills } from "#/modules/catalog/queries";
import { CatalogSurface } from "#/modules/catalog/screen";
import {
	ChecksPassed,
	DataNotice,
	EmptyState,
	FilterBar,
	FilterChips,
	FilterSummary,
	SearchField,
	SectionCard,
} from "#/modules/catalog/ui";
import { usePageHeader } from "#/modules/shell/use-page-header";
import { Pill, Tag } from "#/ui/badge";
import { cn } from "#/utils/cn";

/**
 * THE SKILLS LIBRARY.
 *
 * WHY THIS IS NOT A TABLE ANY MORE, and it is not for variety's sake.
 *
 * The previous version fetched `contentMd` and rendered it nowhere. Ten skills
 * cost 1100px of screen to say almost nothing, and clicking a row did nothing,
 * so the page was an index of documents you could not read. `avelEnhancementMd`
 * had the problem twice over: that column exists precisely so AVEL's addition is
 * separable from the imported source text, and nothing distinguished them
 * because neither was ever shown.
 *
 * A skill is a DOCUMENT. There are many, the number grows, and what you do with
 * one is read it or find out who carries it. That shape wants a dense list and a
 * reading pane, which is what a library has looked like for a very long time.
 * The agent-template page is a roster of cards for the opposite reason: seven
 * workers you choose between. Differentiating by colour or chrome instead would
 * have made the two pages look different and still be the same page.
 *
 * MARKDOWN IS NOT RENDERED, deliberately. No markdown library is installed, and
 * adding one to make a design look finished is the wrong order. Preformatted
 * mono is honest, readable, and reversible in one commit.
 */

type StateFilter = "all" | "live" | "revoked";
type TypeFilter = "all" | "knowledge" | "capability";

export type SkillsSearch = {
	skill?: string;
	state?: StateFilter;
	type?: TypeFilter;
};

/** Totals only. The risk number is a banner or a checked line, never here. */
const summarise = (skills: SkillRow[] | undefined) =>
	subtitleFor(skills, (rows) => [
		plural(rows.length, "skill", "skills"),
		`${rows.filter(isRevoked).length} revoked`,
		`from ${plural(new Set(rows.map((s) => s.sourceId)).size, "source", "sources")}`,
	]);

export function SkillsCatalog({
	search,
	onSearch,
}: {
	search: SkillsSearch;
	onSearch: (next: SkillsSearch) => void;
}) {
	const query = useSkills();

	usePageHeader({
		title: "Skills",
		definition: TERM.skill,
		subtitle: summarise(query.data?.data),
	});

	return (
		<div className="flex flex-col gap-4">
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
				{(page) => (
					<SkillsLibrary
						onSearch={onSearch}
						search={search}
						skills={page.data}
						total={page.meta.total}
					/>
				)}
			</CatalogSurface>
		</div>
	);
}

function SkillsLibrary({
	skills,
	total,
	search,
	onSearch,
}: {
	skills: SkillRow[];
	total: number;
	search: SkillsSearch;
	onSearch: (next: SkillsSearch) => void;
}) {
	const stateFilter = search.state ?? "all";
	const typeFilter = search.type ?? "all";

	const revoked = skills.filter(isRevoked);
	const dangling = revoked.filter((s) => danglingAttachments(s) > 0);
	const danglingHolders = dangling.reduce(
		(sum, s) => sum + danglingAttachments(s),
		0,
	);

	/*
	 * LOCAL STATE, not the URL. A filter you chose is worth linking; a substring
	 * you are part-way through typing is not, and putting it in the URL writes a
	 * history entry per keystroke.
	 *
	 * It matches the SOURCE as well as the name and the slug. That is what makes
	 * "which of these came from Anthropic engineering" answerable without adding
	 * a source column to a 360px row that already carries two lines.
	 */
	const [queryText, setQueryText] = useState("");
	const needle = queryText.trim().toLowerCase();

	/*
	 * A CHIP COUNTS WHAT SELECTING IT WOULD ACTUALLY SHOW.
	 *
	 * Counting each dimension over the whole set looks right and fails exactly
	 * where two filters meet: with `Revoked` selected the type chips still read
	 * "Knowledge 8 · Capability 2" over all ten skills, neither is disabled, and
	 * clicking Capability produces an empty list. The disabled-at-zero rule was
	 * only ever asking "are there any of these at all", which is a different
	 * question from "would this do anything from where I am standing".
	 *
	 * So each dimension counts against the OTHER dimension's current value. The
	 * disabling falls out of it unchanged, and now catches the combination too.
	 */
	const matchesText = (skill: SkillRow) =>
		needle === "" ||
		`${skill.name} ${skill.slug} ${skill.sourceName}`
			.toLowerCase()
			.includes(needle);
	const matchesState = (skill: SkillRow, value: StateFilter) =>
		value === "all" ||
		(value === "live" ? !isRevoked(skill) : isRevoked(skill));
	const matchesType = (skill: SkillRow, value: TypeFilter) =>
		value === "all" || skill.type === value;

	const countState = (value: StateFilter) =>
		skills.filter(
			(s) =>
				matchesText(s) && matchesState(s, value) && matchesType(s, typeFilter),
		).length;
	const countType = (value: TypeFilter) =>
		skills.filter(
			(s) =>
				matchesText(s) && matchesState(s, stateFilter) && matchesType(s, value),
		).length;

	const shown = useMemo(
		() =>
			skills.filter((skill) => {
				const textOk =
					needle === "" ||
					`${skill.name} ${skill.slug} ${skill.sourceName}`
						.toLowerCase()
						.includes(needle);
				const stateOk =
					stateFilter === "all" ||
					(stateFilter === "live" ? !isRevoked(skill) : isRevoked(skill));
				const typeOk = typeFilter === "all" || skill.type === typeFilter;
				return textOk && stateOk && typeOk;
			}),
		[skills, needle, stateFilter, typeFilter],
	);

	/*
	 * SELECTION FALLS BACK TO THE FIRST ROW rather than to nothing. A reading
	 * pane that opens empty spends its whole width telling you to click
	 * something. The URL still wins when it names a skill, so a link to one
	 * survives a reload.
	 *
	 * BY ID, NOT SLUG, and that is a schema fact rather than a preference:
	 * `skills_slug_live_unique` is PARTIAL, `where deleted_at is null`. A revoked
	 * skill and a live skill can therefore share a slug, so a slug in the URL is
	 * ambiguous exactly where this catalog is most careful.
	 */
	const selected = shown.find((s) => s.id === search.skill) ?? shown[0] ?? null;

	return (
		<div className="flex flex-col gap-4">
			{/*
			 * THE CHECK IS A BANNER OR A LINE, NEVER BOTH. A card reading "1 ·
			 * Revoked but still attached" used to sit directly above a banner
			 * stating the same fact with room for the consequence. The two states
			 * are mutually exclusive now, so the page keeps its answer to "did
			 * anything look at this?" without saying it twice.
			 */}
			{dangling.length === 0 ? (
				<ChecksPassed
					data-testid="skills-checks"
					items={[
						{
							key: "dangling",
							label: "no revoked skill is still attached to work",
						},
					]}
				/>
			) : (
				<DataNotice
					body={`${plural(dangling.length, "skill has", "skills have")} been withdrawn from the catalog while something still holds ${dangling.length === 1 ? "it" : "them"}, ${plural(danglingHolders, "place", "places")} in total. Nothing re-checks the catalog when a package is built, so each holder will still ship the skill. Detaching it from the agent template is what stops that; revoking it here does not.`}
					data-testid="skills-dangling-notice"
					icon={ShieldAlert}
					title="A revoked skill is still attached to work"
					tone="block"
				/>
			)}

			{skills.length === total ? null : (
				<p className="text-micro text-text-subtle" data-testid="skills-partial">
					{skills.length} of {total} loaded. Every count is of what is loaded.
				</p>
			)}

			<FilterBar
				data-testid="skills-filterbar"
				summary={
					<FilterSummary
						data-testid="skills-filter-summary"
						noun="skills"
						onClear={() => {
							setQueryText("");
							onSearch({ skill: search.skill });
						}}
						shown={shown.length}
						total={skills.length}
					/>
				}
			>
				{/*
				 * THE SEARCH SITS WITH THE CHIPS, not inside the list card.
				 *
				 * All three narrow the same set, and having two of them above the
				 * panes while the third lived in the list's header meant an operator
				 * had to find the filtering controls in two places. One bar owns the
				 * narrowing; the list card is just the list.
				 */}
				<div className="w-full max-w-[42ch]">
					<SearchField
						data-testid="skills-search"
						label="Filter skills by name, slug or source"
						onChange={setQueryText}
						placeholder="Name, slug or source"
						shown={shown.length}
						total={skills.length}
						value={queryText}
					/>
				</div>
				<FilterChips
					data-testid="skills-filter-state"
					label="State"
					onChange={(state) => onSearch({ ...search, skill: undefined, state })}
					options={[
						{ key: "all", label: "All", count: countState("all") },
						{ key: "live", label: "Live", count: countState("live") },
						{ key: "revoked", label: "Revoked", count: countState("revoked") },
					]}
					value={stateFilter}
				/>
				<FilterChips
					data-testid="skills-filter-type"
					label="Type"
					onChange={(type) => onSearch({ ...search, skill: undefined, type })}
					options={[
						{ key: "all", label: "All", count: countType("all") },
						{
							key: "knowledge",
							label: "Knowledge",
							count: countType("knowledge"),
						},
						{
							key: "capability",
							label: "Capability",
							count: countType("capability"),
						},
					]}
					value={typeFilter}
				/>
			</FilterBar>

			{/*
			 * TWO PANES, and the list is a fixed 360px rather than a fraction. The
			 * reader is the variable one: a row is a name and a slug and does not
			 * get better with more width, while a paragraph does. Stacks below `lg`,
			 * which is headroom rather than a phone layout — these routes are
			 * desktop-only.
			 */}
			<div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
				<SkillList
					onSelect={(id) => onSearch({ ...search, skill: id })}
					selectedId={selected?.id ?? null}
					skills={shown}
				/>
				{selected === null ? (
					<SectionCard data-testid="skills-reader" title="Nothing to read">
						<EmptyState
							body="No skill matches this filter, so there is nothing to open. Every skill is still in the catalog; the filters above are hiding them."
							title="Nothing matches"
						/>
					</SectionCard>
				) : (
					<SkillReader skill={selected} />
				)}
			</div>
		</div>
	);
}

/**
 * THE DENSE HALF. Rows are two short lines, around 44px.
 *
 * The previous table spent 110px per row because the attachment cell stacked
 * four lines of its own. That saving is what pays for the reading pane, so the
 * row carries ONE attachment number and the reader carries the breakdown.
 */
function SkillList({
	skills,
	selectedId,
	onSelect,
}: {
	skills: SkillRow[];
	selectedId: string | null;
	onSelect: (id: string) => void;
}) {
	return (
		<SectionCard
			count={skills.length}
			// No `definition` here: the page header already carries TERM.skill and
			// the two sat about 40px apart, verbatim. Section 12 rule 5 wants the
			// jargon named once at first encounter, and the header IS first.
			data-testid="skills-list"
			title="Catalog"
		>
			{skills.length === 0 ? (
				<p
					className="px-4 pb-3 text-micro text-text-subtle"
					data-testid="skills-list-empty"
				>
					Nothing matches. Every skill is still in the catalog; the filter and
					the chips above are hiding them.
				</p>
			) : null}
			{/*
			 * px-4, matching the card's title and its search field. It was px-2,
			 * which put three different left edges inside one 360px card — title
			 * at 279, search at 277, row background at 271 — and eight pixels of
			 * rag down the left of a dense list is exactly the kind of thing that
			 * reads as "off" without being nameable.
			 */}
			<ul className="flex flex-col px-4 pb-2">
				{skills.map((skill) => {
					const held =
						skill.attachedTo.templates.length +
						skill.attachedTo.rosterEntries.length;
					const selected = skill.id === selectedId;
					const revoked = isRevoked(skill);
					return (
						<li key={skill.id}>
							<button
								aria-current={selected ? "true" : undefined}
								className={cn(
									// py-1, not py-2. Measured at 61px and the target was ~44;
									// this brings a two-line row to ~46.
									// No left padding: the 2px accent border IS the left inset,
									// so the row's text sits on the card's content edge
									// instead of two pixels further in than everything else.
									"w-full rounded-sm py-1 pr-2 pl-0 text-left",
									"transition-colors duration-[var(--duration-state)] ease-[var(--ease-avel)] motion-reduce:transition-none",
									// A LEFT EDGE, not a background alone. The selected row was
									// measurably quieter than a revoked badge on a different
									// row, so the eye went to the wrong place; an accent edge
									// beats a badge without shouting.
									"border-l-2",
									selected
										? "border-accent bg-accent-surface"
										: "interactive border-transparent",
								)}
								data-revoked={revoked ? "true" : undefined}
								data-testid="skill-row"
								onClick={() => onSelect(skill.id)}
								type="button"
							>
								<span className="flex items-baseline gap-2">
									<SkillTypeGlyph
										testId={`skill-type-${skill.slug}`}
										type={skill.type}
									/>
									<span
										className={cn(
											"min-w-0 flex-1 truncate font-display text-sm",
											revoked
												? "text-text-subtle line-through"
												: "font-medium text-text",
										)}
									>
										{skill.name}
									</span>
									{revoked ? (
										<RevocationMark testId={`skill-revoked-${skill.slug}`} />
									) : null}
								</span>
								<span className="flex items-baseline gap-2 text-micro text-text-subtle">
									<span className="min-w-0 flex-1 truncate font-mono">
										{skill.slug}
									</span>
									{/* Non-zero only. "0 carried" on every newly imported skill
									    is noise, and the reader says it in words. */}
									{held === 0 ? null : (
										<span className="tabular" data-testid="skill-held">
											{held} carried
										</span>
									)}
								</span>
							</button>
						</li>
					);
				})}
			</ul>
		</SectionCard>
	);
}

/** The half that made the rewrite worth doing: the skill itself. */
function SkillReader({ skill }: { skill: SkillRow }) {
	const revoked = isRevoked(skill);
	const holders =
		skill.attachedTo.templates.length + skill.attachedTo.rosterEntries.length;

	return (
		<div className="flex flex-col gap-4" data-testid="skills-reader">
			<SectionCard data-testid="skill-detail" title={skill.name}>
				<div className="flex flex-col gap-4 px-4 pt-1 pb-4">
					<div className="flex flex-wrap items-center gap-2">
						<Tag data-testid="skill-detail-slug">{skill.slug}</Tag>
						<SkillTypeChip testId="skill-detail-type" type={skill.type} />
						<span className="text-micro text-text-subtle">
							from {skill.sourceName}
						</span>
						{/* No revoked chip here. The banner immediately beneath says it
						    with the date and the consequence, and the chip was the sixth
						    place one screen stated the same fact. */}
					</div>

					{/*
					 * ABOVE THE DOCUMENT, AND COMPACT.
					 *
					 * This was a full section at the bottom, 712px down and below the
					 * fold, and "where is this in use" is what a catalogue is opened to
					 * answer. Moving the whole section up instead pushed the document
					 * to 904px, trading one below-the-fold fact for a worse one. I made
					 * exactly that mistake and measured it.
					 *
					 * So it is a strip rather than a section: enough to answer the
					 * question at a glance, cheap enough that the skill body still
					 * starts above the fold.
					 */}
					<CarriedByStrip skill={skill} />

					{revoked ? (
						<DataNotice
							body={
								holders === 0
									? `Withdrawn on ${isoDate(skill.revokedAt ?? "")}. Nothing is attached to it, so nothing will ship it. It stays listed because work already delivered refers to it.`
									: `Withdrawn on ${isoDate(skill.revokedAt ?? "")}, and still attached in ${plural(holders, "place", "places")}. Each one will render this skill into its package. Revoking here did not detach it.`
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

					{skill.sourceRevoked ? (
						<p className="text-micro text-gate-warn">
							This skill's source has been revoked. The skill was not, so it is
							still live and still attachable.
						</p>
					) : null}

					{/*
					 * THE SUBSTANCE, on screen for the first time. Preformatted rather
					 * than rendered: no markdown library is installed, and adding one
					 * to make this look finished is a dependency decision that is not
					 * mine to make.
					 */}
					<div>
						<p className="pb-1.5 text-micro text-text-subtle">
							The skill, as imported. Markdown is not rendered.
						</p>
						<pre
							className="app-scroll max-h-[34rem] overflow-auto rounded-sm bg-muted px-3 py-3 font-mono text-micro leading-relaxed whitespace-pre-wrap text-text-muted"
							data-testid="skill-content"
						>
							{skill.contentMd}
						</pre>
					</div>

					{/*
					 * VISUALLY SEPARATE FROM THE IMPORTED TEXT, which is the entire
					 * reason this column exists. An accent rule down the left edge is a
					 * border AROUND this block rather than a rule BETWEEN two panes, so
					 * it survives the divider ruling.
					 */}
					{skill.avelEnhancementMd === null ? (
						// AN ABSENT-STATE, because the alternative is that the one field
						// defined by being separable from the source text is invisible
						// whether or not it exists. It is null on every skill today, so
						// without this the block has never rendered in either direction.
						<p
							className="border-l-2 border-[var(--elevation-border-rest)] pl-3 text-micro text-text-subtle"
							data-testid="skill-enhancement-absent"
						>
							No AVEL addition. Nothing has been written on top of the imported
							text, so this skill reaches an agent exactly as its source wrote
							it.
						</p>
					) : (
						<div
							className="border-l-2 border-accent pl-3"
							data-testid="skill-enhancement"
						>
							<p className="pb-1 text-micro font-medium text-accent-text">
								AVEL's addition
							</p>
							<p className="max-w-[52ch] pb-1.5 text-micro leading-relaxed text-text-subtle">
								Written here rather than imported. It travels with the skill
								into every package.
							</p>
							<pre className="app-scroll max-h-[24rem] overflow-auto rounded-sm bg-muted px-3 py-3 font-mono text-micro leading-relaxed whitespace-pre-wrap text-text-muted">
								{skill.avelEnhancementMd}
							</pre>
						</div>
					)}
				</div>
			</SectionCard>
		</div>
	);
}

/**
 * Where the skill is actually in use, as one or two lines.
 *
 * Templates and roster entries stay distinguishable — they are different facts,
 * one about future missions and one about running ones — but they no longer get
 * a section each. Absence is stated in words rather than as an empty list,
 * because "nothing carries this" is a real and useful answer.
 */
function CarriedByStrip({ skill }: { skill: SkillRow }) {
	const { templates, rosterEntries } = skill.attachedTo;
	return (
		<div className="flex flex-col gap-1.5" data-testid="skill-carried-by">
			<p className="text-micro text-text-subtle">Carried by</p>
			{templates.length === 0 && rosterEntries.length === 0 ? (
				<p className="max-w-[52ch] text-sm text-text-subtle">
					Nothing carries this skill, so no package will ship it. A skill does
					nothing until it is attached to an agent template.
				</p>
			) : (
				<div className="flex flex-wrap items-center gap-1.5">
					{templates.map((template) => (
						<Link
							data-testid="skill-template-link"
							key={template.id}
							params={{ agentId: template.id }}
							to="/catalog/agent/$agentId"
						>
							<Pill data-testid={`skill-template-${template.slug}`}>
								{template.name}
							</Pill>
						</Link>
					))}
					{rosterEntries.map((entry) => (
						<Link
							data-testid="skill-roster-link"
							key={entry.id}
							params={{ missionId: entry.missionId }}
							to="/missions/$missionId"
						>
							<Pill data-testid="skill-roster-entry">
								{entry.missionTitle ?? "Unnamed mission"} · {entry.agentSlug}
							</Pill>
						</Link>
					))}
					{rosterEntries.length === 0 ? (
						// Said, not omitted: a template carrying a skill and a mission
						// carrying it are different facts, and silence here reads as
						// "no data" rather than "not on a team yet".
						<span className="text-micro text-text-subtle">
							not on any mission team yet
						</span>
					) : null}
				</div>
			)}
		</div>
	);
}
