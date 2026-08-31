import { Link } from "@tanstack/react-router";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import type { AgentTemplateRow } from "#/contract/catalog";
import {
	RevokedAttachmentChip,
	RuntimeChip,
	runtimeLabel,
	SkillTypeChip,
} from "#/modules/catalog/chips";
import { isRevoked, strandedModelContext } from "#/modules/catalog/derive";
import { isoDate, plural } from "#/modules/catalog/format";
import { TERM } from "#/modules/catalog/jargon";
import {
	DataNotice,
	DefinitionList,
	EmptyState,
	PathList,
	SectionCard,
} from "#/modules/catalog/ui";
import { Tag } from "#/ui/badge";
import { cn } from "#/utils/cn";

/**
 * ONE OPENED TEMPLATE, in full.
 *
 * Separate from the roster because they answer different questions. The grid
 * answers "which of these seven", by showing the few facts you choose between:
 * runtime, scope, what it may change, what it carries. This answers "what
 * exactly is this one", and it is where the identity document, the path globs
 * and the skill list live.
 */
export function AgentDetail({ template }: { template: AgentTemplateRow }) {
	const revoked = isRevoked(template);
	const stranded = strandedModelContext(template);
	const revokedSkills = template.skills.filter((s) => s.revoked);

	return (
		<div className="flex flex-col gap-4" data-testid="agent-detail">
			{revoked ? (
				<DataNotice
					body={`Withdrawn on ${isoDate(template.revokedAt ?? "")}. No new mission can copy it in. Missions that already did keep their own copy, because a roster entry is a copy rather than a reference.`}
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
				<div className="px-4 pt-1 pb-4">
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
						]}
					/>
				</div>
			</SectionCard>

			<ModelContext template={template} />

			<SectionCard data-testid="agent-detail-paths" title="What it may change">
				<div className="flex flex-col gap-5 px-4 pt-1 pb-4">
					<div>
						<p className="pb-1 text-sm font-medium text-text">Writable</p>
						<p className="max-w-[52ch] pb-2 text-micro leading-relaxed text-text-subtle">
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
						<p className="max-w-[52ch] pb-2 text-micro leading-relaxed text-text-subtle">
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
						<p className="max-w-[52ch] pb-2 text-micro leading-relaxed text-text-subtle">
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
					<ul className="flex flex-col gap-2 px-4 pt-1 pb-4">
						{template.skills.map((skill) => (
							<li className="flex flex-wrap items-center gap-2" key={skill.id}>
								<Link
									className={cn(
										"font-display text-sm",
										skill.revoked
											? "text-text-subtle line-through"
											: "text-accent-text hover:text-accent-hover",
									)}
									data-testid="agent-skill-link"
									search={{ skill: skill.id }}
									to="/catalog/skills"
								>
									{skill.name}
								</Link>
								<SkillTypeChip
									testId={`agent-skill-type-${skill.slug}`}
									type={skill.type}
								/>
								{skill.revoked ? (
									<RevokedAttachmentChip
										testId={`agent-skill-revoked-${skill.slug}`}
									/>
								) : null}
							</li>
						))}
					</ul>
				)}
			</SectionCard>
		</div>
	);
}

/**
 * THE SECTION THAT REFUSES TO RENDER.
 *
 * For a model agent this shows identity.md and depth.md. For a person or a
 * script it shows neither and says why, because that is what the renderer
 * actually does. Showing the text with a caveat beside it would put the operator
 * one glance from believing a person receives it, which is the belief that
 * produced the bug.
 */
function ModelContext({ template }: { template: AgentTemplateRow }) {
	if (template.runtime !== "model") {
		return (
			<SectionCard
				data-testid="agent-detail-context"
				definition={TERM.runtime}
				title="Written context"
			>
				<div className="px-4 pt-1 pb-4" data-context-sent="false">
					<p className="max-w-[52ch] text-sm leading-relaxed text-text-muted">
						This agent is {runtimeLabel(template.runtime).toLowerCase()}, so no
						written context is sent to it. Identity and depth text are built for
						a model to read, and the delivered package leaves them out entirely
						for this agent.
					</p>
					{strandedModelContext(template) ? (
						<p className="max-w-[52ch] pt-2 text-sm leading-relaxed text-gate-warn">
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
			<div className="px-4 pt-1 pb-4" data-context-sent="true">
				<p className="pb-1.5 text-micro text-text-subtle">identity.md</p>
				<pre className="app-scroll max-h-[28rem] overflow-auto rounded-sm bg-muted px-3 py-3 font-mono text-micro leading-relaxed whitespace-pre-wrap text-text-muted">
					{template.identityMd.trim().length === 0
						? "Empty. This agent is sent no identity text."
						: template.identityMd}
				</pre>
				<p className="pt-4 pb-1.5 text-micro text-text-subtle">depth.md</p>
				<pre className="app-scroll max-h-[28rem] overflow-auto rounded-sm bg-muted px-3 py-3 font-mono text-micro leading-relaxed whitespace-pre-wrap text-text-muted">
					{(template.depthMd ?? "").trim().length === 0
						? "Not set. This agent is sent no depth text."
						: template.depthMd}
				</pre>
			</div>
		</SectionCard>
	);
}
