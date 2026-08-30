import { Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { useState } from "react";
import type { SkillSourceRow } from "#/contract/catalog";
import { RevocationChip } from "#/modules/catalog/chips";
import { isRevoked } from "#/modules/catalog/derive";
import { isoDate, plural } from "#/modules/catalog/format";
import { TERM } from "#/modules/catalog/jargon";
import { useSkillSources } from "#/modules/catalog/queries";
import { CatalogSurface } from "#/modules/catalog/screen";
import {
	type Column,
	DataNotice,
	DataTable,
	DefinitionList,
	EmptyState,
	MetricStat,
	type RowTone,
	SectionCard,
} from "#/modules/catalog/ui";
import { usePageHeader } from "#/modules/shell/use-page-header";

/**
 * WHERE SKILLS CAME FROM.
 *
 * The smallest of the three catalog screens, and the one that most easily
 * becomes a list of names. What makes it worth opening is the pair of counts on
 * each row: a source with forty skills of which thirty are withdrawn is a
 * different object from one with ten live skills, and a single total renders
 * them identically.
 *
 * REVOKING A SOURCE DOES NOT REVOKE ITS SKILLS. `skills.source_id` is a plain
 * foreign key with no cascade and no trigger, verified in schema.ts. So a
 * withdrawn source can sit above a column of live, attachable skills, and the
 * screen has to say so rather than letting the operator infer a cascade that
 * does not exist.
 */

/** Totals only. The revoked-skill count stays on the MetricStat row. */
function summarise(sources: SkillSourceRow[]): string {
	const liveSkills = sources.reduce((sum, s) => sum + s.liveSkillCount, 0);
	return `${plural(sources.length, "source", "sources")} · ${plural(liveSkills, "live skill", "live skills")}`;
}

export function SkillSourceCatalog() {
	const query = useSkillSources();

	// The shell renders the title. See the note in skills-view.tsx.
	const sources = query.data?.data;
	usePageHeader({
		title: "Skill sources",
		definition: TERM.source,
		subtitle: sources === undefined ? undefined : summarise(sources),
	});
	const [selectedId, setSelectedId] = useState<string | null>(null);

	return (
		<div className="flex flex-col gap-5 px-6 py-5">
			<CatalogSurface
				data-testid="sources"
				empty={
					<EmptyState
						body="A source is where a skill came from. None have been added, so the skills catalog has nothing to import from and stays empty. This list is filled in from the app rather than shipped with it, because what belongs in it depends on the work you take on."
						title="No skill sources"
					/>
				}
				noun="skill sources"
				query={query}
			>
				{(page) => (
					<SourcesBody
						onSelect={(id) =>
							setSelectedId((current) => (current === id ? null : id))
						}
						selectedId={selectedId}
						sources={page.data}
						total={page.meta.total}
					/>
				)}
			</CatalogSurface>
		</div>
	);
}

function SourcesBody({
	sources,
	total,
	selectedId,
	onSelect,
}: {
	sources: SkillSourceRow[];
	total: number;
	selectedId: string | null;
	onSelect: (id: string) => void;
}) {
	const live = sources.filter((s) => !isRevoked(s));
	const revoked = sources.filter(isRevoked);
	const liveSkills = sources.reduce((sum, s) => sum + s.liveSkillCount, 0);
	const revokedSkills = sources.reduce(
		(sum, s) => sum + s.revokedSkillCount,
		0,
	);
	// A revoked source that still has live skills. Not a fault, and not obvious.
	const revokedWithLive = revoked.filter((s) => s.liveSkillCount > 0);

	const selected = sources.find((s) => s.id === selectedId) ?? null;

	return (
		<>
			{sources.length === total ? null : (
				<p
					className="text-micro text-text-subtle"
					data-testid="sources-partial"
				>
					{sources.length} of {total} loaded. The rest are on a page this screen
					does not fetch yet, so every count below is of what is loaded.
				</p>
			)}

			<div className="flex flex-wrap gap-3">
				<MetricStat
					data-testid="sources-metric-live"
					hint="Available to import from."
					label="Live sources"
					value={live.length}
				/>
				<MetricStat
					data-testid="sources-metric-skills"
					hint="Across every source, countable on the skills page."
					label="Live skills"
					value={liveSkills}
				/>
				<MetricStat
					data-testid="sources-metric-revoked-skills"
					hint="Withdrawn skills, kept because delivered work refers to them."
					label="Revoked skills"
					value={revokedSkills}
				/>
			</div>

			{revokedWithLive.length === 0 ? null : (
				<DataNotice
					body={`${plural(revokedWithLive.length, "revoked source still has", "revoked sources still have")} live skills in the catalog. Revoking a source does not withdraw what came from it, so those skills are still attachable to an agent. Withdrawing them is a separate action on each skill.`}
					data-testid="sources-revoked-notice"
					icon={AlertTriangle}
					title="A revoked source still has live skills"
					tone="warn"
				/>
			)}

			<SectionCard
				count={sources.length}
				data-testid="sources-table-card"
				title="Sources"
			>
				<DataTable
					caption="Skill sources, with how many skills each one has in the catalog."
					columns={SOURCE_COLUMNS}
					data-testid="sources-table"
					empty={
						<EmptyState
							body="No source is listed. Skills cannot be imported until one exists."
							title="Nothing to show"
						/>
					}
					onSelect={onSelect}
					rowId={(row) => row.id}
					rowTone={(row): RowTone => (isRevoked(row) ? "revoked" : "rest")}
					rows={sources}
					selectColumn="name"
					selectedId={selectedId}
				/>
			</SectionCard>

			{selected === null ? null : <SourceDetail source={selected} />}
		</>
	);
}

const SOURCE_COLUMNS: Column<SkillSourceRow>[] = [
	{
		key: "name",
		header: "Source",
		sortValue: (row) => row.name,
		render: (row) => (
			<span
				className={
					isRevoked(row)
						? "font-display text-sm text-text-subtle line-through"
						: "font-display text-sm font-medium text-text"
				}
			>
				{row.name}
			</span>
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
					testId={`source-revoked-${row.id}`}
				/>
			) : (
				<span className="text-micro text-text-subtle">Live</span>
			),
	},
	{
		key: "skills",
		header: "Skills",
		align: "end",
		sortValue: (row) => row.liveSkillCount,
		render: (row) => (
			<div className="flex flex-col items-end gap-0.5">
				<span className="text-sm text-text">
					{plural(row.liveSkillCount, "live", "live")}
				</span>
				{row.revokedSkillCount === 0 ? null : (
					<span className="text-micro text-text-subtle">
						{row.revokedSkillCount} revoked
					</span>
				)}
			</div>
		),
	},
	{
		key: "url",
		header: "Location",
		sortValue: (row) => row.url ?? "",
		render: (row) =>
			row.url === null ? (
				// Nullable in the schema, so a source with no address is a real row
				// and not a rendering fault. It says which, in words.
				<span className="text-micro text-text-subtle">No address recorded</span>
			) : (
				<span className="font-mono text-micro break-all text-text-muted">
					{row.url}
				</span>
			),
	},
	{
		key: "added",
		header: "Added",
		align: "end",
		secondary: true,
		sortValue: (row) => row.createdAt,
		render: (row) => (
			<span className="font-mono text-micro text-text-subtle">
				{isoDate(row.createdAt)}
			</span>
		),
	},
];

function SourceDetail({ source }: { source: SkillSourceRow }) {
	const revoked = isRevoked(source);

	return (
		<div className="flex flex-col gap-4" data-testid="source-detail">
			{revoked && source.liveSkillCount > 0 ? (
				<DataNotice
					body={`Withdrawn on ${isoDate(source.revokedAt ?? "")}, and ${plural(source.liveSkillCount, "skill from it is", "skills from it are")} still live in the catalog and still attachable to an agent. Revoking a source does not withdraw what came from it.`}
					data-testid="source-detail-revoked"
					icon={AlertTriangle}
					title="Revoked, with live skills still in the catalog"
					tone="warn"
				/>
			) : null}

			<SectionCard data-testid="source-detail-facts" title={source.name}>
				<div className="px-4 py-4">
					<DefinitionList
						data-testid="source-detail-list"
						items={[
							{
								label: "Location",
								value:
									source.url === null ? (
										<span className="text-text-subtle">
											No address recorded. The skills from it were entered by
											hand.
										</span>
									) : (
										<span className="font-mono text-micro break-all">
											{source.url}
										</span>
									),
							},
							{
								label: "Live skills",
								value:
									source.liveSkillCount === 0
										? "None. Nothing from this source is attachable today."
										: plural(source.liveSkillCount, "skill", "skills"),
							},
							{
								label: "Revoked skills",
								value:
									source.revokedSkillCount === 0
										? "None."
										: plural(source.revokedSkillCount, "skill", "skills"),
								hint: source.revokedSkillCount === 0 ? undefined : TERM.revoked,
							},
							{
								label: "State",
								value: revoked ? (
									<RevocationChip
										revokedAt={source.revokedAt}
										testId="source-detail-state"
									/>
								) : (
									"Live"
								),
							},
							{
								label: "Added",
								value: (
									<span className="font-mono text-micro">
										{isoDate(source.createdAt)}
									</span>
								),
							},
						]}
					/>
					<p className="pt-4 text-micro text-text-subtle">
						{/* The skills page names its source on every row, so this is a
						    plain link rather than a filter that does not exist. */}
						<Link
							className="text-accent-text hover:text-accent-hover"
							data-testid="source-detail-skills-link"
							to="/catalog/skills"
						>
							Open the skills catalog
						</Link>{" "}
						to see what came from here. Every skill names its source.
					</p>
				</div>
			</SectionCard>
		</div>
	);
}
