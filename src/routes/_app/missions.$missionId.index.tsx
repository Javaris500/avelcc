import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { z } from "zod";

import { missionSchema } from "#/contract/mission";
import { success } from "#/contract/shared/envelope";
/**
 * TYPE-ONLY, and it has to stay that way. mission/service.ts holds the db
 * client; a value import would ship the connection string to the browser.
 * verbatimModuleSyntax guarantees an `import type` is erased at build.
 */
import { presentScreenError } from "#/modules/errors/screenError";
import type { RosterAgent } from "#/modules/mission/service";
import { Tag } from "#/ui/badge";
import { SkeletonRows } from "#/ui/skeleton";
import { ErrorState } from "#/ui/states";
import { Surface } from "#/ui/surface";

/**
 * `/missions/:missionId` — the mission overview. ROUTES.md's hub.
 *
 * An INDEX route (`missions.$missionId.index.tsx`) rather than
 * `missions.$missionId.tsx`, which would become the parent layout of
 * `missions.$missionId.exports.new.tsx` and blank the pre-flight screen unless
 * this file rendered an Outlet. The list route next door is named the same way
 * for the same reason.
 *
 * Shapes come from the contract and the response is parsed with the same
 * envelope the route answers with, so a drift between screen and route surfaces
 * here rather than as a field rendering undefined.
 */
const missionResponse = success(missionSchema);
type MissionResponse = z.infer<typeof missionResponse>;
type Mission = z.infer<typeof missionSchema>;

export const Route = createFileRoute("/_app/missions/$missionId/")({
	staticData: { device: "capture" as const },
	component: MissionOverview,
});

/** Client-only labels. Neither is a contract code; see missions.index.tsx. */
const SHAPE_MISMATCH = "SHAPE_MISMATCH";
const httpFailure = (status: number) => `HTTP_${status}`;

async function fetchMission(missionId: string): Promise<MissionResponse> {
	const res = await fetch(`/api/missions/${missionId}`);
	const body = await res.json().catch(() => null);

	if (body?.success === false) throw new Error(body.error.code);
	if (!res.ok || body === null) throw new Error(httpFailure(res.status));
	const parsed = missionResponse.safeParse(body);
	if (!parsed.success) throw new Error(SHAPE_MISMATCH);

	return parsed.data;
}

/**
 * The roster is a SECOND query, matching the endpoint, and it fails
 * independently: a roster that cannot load must not blank the mission facts
 * beside it. That is why each has its own Surface rather than one wrapping both.
 *
 * The shape is RosterAgent, which the service exports and the route serves. It
 * is deliberately NOT contract/roster.ts's rosterEntrySchema — that describes a
 * stored entry, while this carries the template's slug, name, kind and runtime
 * joined on, and the mount override already resolved.
 */
type RosterResponse = { data: RosterAgent[] };

async function fetchRoster(missionId: string): Promise<RosterResponse> {
	const res = await fetch(`/api/missions/${missionId}/roster`);
	const body = await res.json().catch(() => null);

	if (body?.success === false) throw new Error(body.error.code);
	if (!res.ok || body === null) throw new Error(httpFailure(res.status));
	if (!Array.isArray(body.data)) throw new Error(SHAPE_MISMATCH);

	return { data: body.data as RosterAgent[] };
}

function describeFailure(
	code: string,
	title: string,
): { title: string; body: string; canRetry: boolean } {
	switch (code) {
		case "NOT_FOUND":
			return {
				title,
				body: "There is no mission with this identifier. It may have been deleted, or the link may be wrong.",
				// Asking again will not bring a mission into existence.
				canRetry: false,
			};
		case SHAPE_MISMATCH:
			return {
				title,
				body: "The endpoint answered, but the body did not match the contract. The screen and the route have drifted apart, and rendering it anyway would be a guess.",
				// Deterministic: the same request produces the same mismatch.
				canRetry: false,
			};
		default:
			return {
				title,
				body: "The request did not complete, so nothing was loaded. This screen only reads, so nothing was written either.",
				// No envelope arrived, so this is transport and genuinely retryable.
				canRetry: true,
			};
	}
}

/**
 * Local rather than shared with the pre-flight screen, which has its own copy.
 * Extracting one into src/ui would mean editing a working screen that another
 * session may be in; twenty lines duplicated is the cheaper mistake to unwind.
 */
function Section({
	title,
	children,
	built = true,
	testid,
}: {
	title: string;
	children: ReactNode;
	built?: boolean;
	testid: string;
}) {
	return (
		<section
			className="rounded-md border border-[var(--elevation-border-rest)] bg-app-panel"
			data-built={built}
			data-testid={testid}
		>
			<header className="border-b border-[var(--elevation-border-rest)] px-4 py-2">
				<h2 className="font-display text-sm font-semibold tracking-wide uppercase">
					{title}
				</h2>
			</header>
			{children}
		</section>
	);
}

function NotBuilt({ what }: { what: string }) {
	return (
		<p className="px-4 py-3 text-sm text-text-subtle" data-testid="not-built">
			Not built. {what}
		</p>
	);
}

function Field({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2">
			<span className="min-w-[14ch] text-micro text-text-subtle">{label}</span>
			<span className="text-sm text-text">{children}</span>
		</div>
	);
}

/**
 * THE CUT, AND THE ONE DISTINCTION THIS SCREEN MUST NOT COLLAPSE.
 *
 * A null cut is NOT missing data. It means the repository's directory structure
 * has not been read yet, because a mission is captured before a repository is
 * connected. It is a real, expected, temporary state with a next action.
 *
 * So it is deliberately NOT rendered as the em-dash this codebase uses for
 * "nothing was ever recorded" — the mission list uses that for lastActivity,
 * where a dash genuinely does mean no data exists. Reusing the glyph here would
 * say the same thing about two states that call for different responses.
 *
 * `cutSource` is shown whenever a cut exists, because "derived" and
 * "overridden" are the difference between the system having read the repository
 * and a human having overruled it, and an override carries a rationale that
 * renders into the delivery.
 */
function Cut({ mission }: { mission: Mission }) {
	if (mission.cut === null) {
		return (
			<div className="px-4 py-3" data-testid="cut-underived">
				<p className="text-sm text-text">Not yet derived.</p>
				<p className="max-w-[60ch] pt-1 text-sm leading-relaxed text-text-muted">
					The cut is read from the connected repository's directory structure at
					mission setup, and no repository is connected yet. This is a state,
					not a gap in the record.
				</p>
			</div>
		);
	}

	return (
		<div data-testid="cut-derived">
			<Field label="cut">
				<Tag data-testid="cut-value">{mission.cut}</Tag>
			</Field>
			<Field label="source">
				<Tag data-testid="cut-source">{mission.cutSource}</Tag>
			</Field>
			{mission.cutSource === "overridden" ? (
				<div className="px-4 pt-1 pb-3">
					<p className="text-micro text-text-subtle">rationale</p>
					<p
						className="max-w-[60ch] pt-1 text-sm leading-relaxed text-text"
						data-testid="cut-rationale"
					>
						{mission.cutRationale ??
							"An override was recorded with no rationale, which the contract requires. That is a data fault worth reporting."}
					</p>
				</div>
			) : null}
		</div>
	);
}

/** The brief is a free-form record; values are rendered without interpreting them. */
function Brief({ brief }: { brief: Record<string, unknown> }) {
	const entries = Object.entries(brief);
	if (entries.length === 0) {
		return (
			<p
				className="px-4 py-3 text-sm text-text-subtle"
				data-testid="brief-empty"
			>
				Nothing captured yet. A mission starts as a brief, and this one is still
				empty.
			</p>
		);
	}

	return (
		<dl data-testid="brief-entries">
			{entries.map(([key, value]) => (
				<div
					className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2"
					key={key}
				>
					<dt className="min-w-[14ch] text-micro text-text-subtle">{key}</dt>
					<dd className="max-w-[60ch] text-sm leading-relaxed text-text">
						{typeof value === "string" || typeof value === "number" ? (
							String(value)
						) : (
							// Objects and arrays are shown as their literal JSON rather than
							// summarised. A summary here would be this screen deciding what
							// part of a brief matters.
							<code className="font-mono text-micro">
								{JSON.stringify(value)}
							</code>
						)}
					</dd>
				</div>
			))}
		</dl>
	);
}

/**
 * THE THREE MOUNT KINDS, AND WHY THEY ARE NOT THREE SHADES OF ONE THING.
 *
 * Rendering them as one "paths" list in three colours would destroy the
 * distinction that makes the boundary enforceable, so each carries its rule in
 * words beside it. appendOnly is the one that reads like a weaker writable and
 * is not: an agent may add its own registration to a shared composition root
 * and may never remove or reorder anyone else's, which is why a mount check
 * fails on any REMOVED line.
 *
 * All three are shown even when empty. An empty set here means the agent
 * genuinely has no grant of that kind, which is a fact about a boundary; hiding
 * the row would make "no write access" and "not configured" look the same.
 */
/**
 * WHICH OTHER AGENTS HOLD THE SAME PATH, AND UNDER WHICH RULE.
 *
 * Built because the real roster made the gap obvious. `apps/web/e2e/` is
 * READONLY for transactions and WRITABLE for nemi — the same path, two agents,
 * opposite grants — and on screen it sat second-from-last in a list of nine and
 * first in a list of four, four hundred pixels apart in identical type. Nothing
 * connected them. An operator would have had to read twenty paths and notice a
 * repeat, which is not a design, it is a memory test.
 *
 * EXACT STRING MATCH ONLY, deliberately. `apps/api/src/` for one agent and
 * `apps/api/src/modules/transactions/` for another almost certainly overlap
 * too, and saying so would mean deciding what a trailing slash means, what a
 * glob covers, and whether a prefix implies containment. Those are claims about
 * a BOUNDARY, and a wrong one here is worse than a missing one — it would tell
 * an operator two agents collide when they may not. What this reports is only
 * what it can prove: the identical path, written twice.
 */
type PathHolder = { slug: string; label: string };

function sharedPathIndex(agents: RosterAgent[]): Map<string, PathHolder[]> {
	const index = new Map<string, PathHolder[]>();
	for (const agent of agents) {
		for (const { key, label } of MOUNTS) {
			for (const path of agent.effective[key]) {
				const holders = index.get(path) ?? [];
				holders.push({ slug: agent.slug, label });
				index.set(path, holders);
			}
		}
	}
	return index;
}

const MOUNTS = [
	{ key: "writablePaths", label: "writable", rule: "edit freely" },
	{
		key: "appendOnlyPaths",
		label: "append-only",
		rule: "add its own; never remove or reorder another's",
	},
	{ key: "readonlyPaths", label: "readonly", rule: "read; never write" },
] as const;

/**
 * model | human | code, and a non-model agent is REAL rather than a
 * placeholder — one role is held by the operator, and one agent is never a
 * language model. A screen that assumes every agent is an LLM misrepresents the
 * roster on its first honest render, so the runtime is stated on every agent
 * rather than only on the exceptions.
 */
const RUNTIME_RULE: Record<RosterAgent["runtime"], string> = {
	model: "a language model runs this",
	human: "a person does this work",
	code: "deterministic code; never a language model",
};

function Mounts({
	agent,
	shared,
}: {
	agent: RosterAgent;
	shared: Map<string, PathHolder[]>;
}) {
	return (
		<div className="flex flex-col gap-2 pt-2">
			{MOUNTS.map(({ key, label, rule }) => (
				<div key={key}>
					<p className="flex flex-wrap items-baseline gap-x-2">
						<span
							className="text-micro text-text"
							data-testid={`mount-${label}`}
						>
							{label}
						</span>
						<span className="text-micro text-text-subtle">{rule}</span>
						{/*
						 * Still shown, because an override is somebody's decision and the
						 * template's default is not what applies. Demoted from a Tag to
						 * muted text after seeing the real roster: every set on every
						 * agent is overridden there, so six identical badges were the
						 * loudest thing in the section and crowded out the paths, which
						 * are the content. A fact that is always true carries no signal
						 * at full volume.
						 */}
						{agent.overridden[key] ? (
							<span
								className="text-micro text-text-subtle"
								data-testid={`mount-${label}-overridden`}
							>
								overridden for this mission
							</span>
						) : null}
					</p>
					{agent.effective[key].length === 0 ? (
						<p className="pt-0.5 text-micro text-text-subtle">none</p>
					) : (
						<ul className="flex flex-col gap-0.5 pt-0.5">
							{agent.effective[key].map((path) => {
								const others = (shared.get(path) ?? []).filter(
									(h) => h.slug !== agent.slug,
								);
								return (
									<li key={path}>
										<span className="font-mono text-micro break-all text-text-muted">
											{path}
										</span>
										{others.map((other) => (
											<span
												className="block text-micro text-text-subtle"
												data-testid={
													other.label === label
														? "shared-path"
														: "shared-path-conflict"
												}
												key={`${other.slug}-${other.label}`}
											>
												{other.label === label
													? `also ${other.slug}, same rule`
													: `${other.slug} holds this as ${other.label}`}
											</span>
										))}
									</li>
								);
							})}
						</ul>
					)}
				</div>
			))}
		</div>
	);
}

function Agent({
	agent,
	shared,
}: {
	agent: RosterAgent;
	shared: Map<string, PathHolder[]>;
}) {
	return (
		<li
			className="border-b border-[var(--elevation-border-rest)] px-4 py-3"
			data-active={agent.active}
			data-testid="roster-agent"
		>
			<div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
				<span
					className="font-display text-sm font-semibold text-text"
					data-testid="agent-name"
				>
					{agent.name}
				</span>
				<Tag data-testid="agent-slug">{agent.slug}</Tag>
				{/* A SCALAR. Phases are global and sequential, and an agent spanning
				    waves reintroduces the ordering contradiction they exist to prevent.
				    Null is "not yet assigned", a real state and not a missing value. */}
				<span className="text-micro text-text-subtle" data-testid="agent-wave">
					{agent.wave === null ? "wave not assigned" : `wave ${agent.wave}`}
				</span>
				{agent.active ? null : <Tag data-testid="agent-inactive">inactive</Tag>}
			</div>

			<p className="flex flex-wrap items-baseline gap-x-2 pt-1">
				<Tag data-testid="agent-runtime">{agent.runtime}</Tag>
				<span className="text-micro text-text-subtle">
					{RUNTIME_RULE[agent.runtime]}
				</span>
				<Tag data-testid="agent-kind">{agent.kind}</Tag>
			</p>

			<Mounts agent={agent} shared={shared} />
		</li>
	);
}

function MissionOverview() {
	const { missionId } = Route.useParams();
	const query = useQuery<MissionResponse>({
		queryKey: ["mission", missionId],
		queryFn: () => fetchMission(missionId),
		retry: false,
	});
	const roster = useQuery<RosterResponse>({
		queryKey: ["mission", missionId, "roster"],
		queryFn: () => fetchRoster(missionId),
		retry: false,
	});

	return (
		<div className="flex max-w-[72ch] flex-col gap-4 px-6 py-5">
			<div className="flex flex-col gap-1">
				<h1
					className="font-display text-title font-semibold"
					data-testid="page-title"
				>
					Mission
				</h1>
				<p className="flex flex-wrap items-center gap-2 text-sm text-text-muted">
					<Link
						className="text-accent-text hover:text-accent-hover"
						data-testid="link-missions"
						to="/missions"
					>
						All missions
					</Link>
					<Tag data-testid="mission-id">{missionId}</Tag>
				</p>
			</div>

			<Surface
				empty={<NotBuilt what="The endpoint returned no mission." />}
				error={({ error, retry }) => {
					// The affordance comes from the error map, not from this call site:
					// a code whose recovery is `none` must not be handed a retry.
					const shown = presentScreenError(
						error.message,
						describeFailure(error.message, "This mission could not be read."),
					);
					return (
						<ErrorState
							body={shown.body}
							code={shown.code}
							retry={shown.canRetry ? retry : undefined}
							title={shown.title}
						/>
					);
				}}
				loading={<SkeletonRows count={5} />}
				query={query}
			>
				{(page) => {
					const mission = page.data;
					return (
						<div className="flex flex-col gap-4" data-testid="mission-detail">
							<Section testid="section-mission" title="Mission">
								<Field label="type">
									<Tag data-testid="mission-type">{mission.type}</Tag>
								</Field>
								<Field label="sprint">
									<span data-testid="mission-sprint">{mission.sprintN}</span>
								</Field>
								{/* TEXT with no vocabulary declared anywhere, so it renders as a
								    mono tag rather than a coloured badge. A tone here would be
								    the screen inventing a lifecycle the contract refuses to. */}
								<Field label="status">
									<Tag data-testid="mission-status">{mission.status}</Tag>
								</Field>
								<Field label="repository">
									{mission.repoUrl ? (
										<span data-testid="mission-repo">{mission.repoUrl}</span>
									) : (
										<span
											className="text-text-subtle"
											data-testid="mission-repo"
										>
											none attached
										</span>
									)}
								</Field>
								<Field label="spend ceiling">
									{mission.spendCeilingUsd === null ? (
										<span
											className="text-text-subtle"
											data-testid="mission-spend"
										>
											none set
										</span>
									) : (
										<span data-testid="mission-spend">
											${mission.spendCeilingUsd}
										</span>
									)}
								</Field>
							</Section>

							<Section testid="section-cut" title="Cut">
								<Cut mission={mission} />
							</Section>

							<Section testid="section-brief" title="Brief">
								<Brief brief={mission.brief} />
							</Section>

							{/*
							 * THE ROSTER IS THE POINT OF THIS SCREEN AND IT HAS NO DATA
							 * SOURCE. `roster.getWithRoster` is a contract shape that nothing
							 * implements, so no endpoint returns roster entries or the agent
							 * templates behind them.
							 *
							 * Declared-and-unbuilt rather than omitted, and rather than faked
							 * from the fixture: an operator should see the shape of what is
							 * coming, and must never read a placeholder roster as the agents
							 * that actually ran.
							 */}
							<Section testid="section-roster" title="Roster">
								<Surface
									empty={
										/*
										 * AN EMPTY ROSTER IS A FINDING, NOT MISSING DATA. A
										 * mission can be run by the operator directly, and one
										 * was; that emptiness is the recorded outcome. "No data"
										 * would report a real result as a gap in the record.
										 */
										<p
											className="px-4 py-3 text-sm leading-relaxed text-text-muted"
											data-testid="roster-empty"
										>
											No agents were assigned to this mission. That is a
											recorded outcome rather than a gap: a mission can be run
											by the operator directly, and this one was.
										</p>
									}
									error={({ error, retry }) => {
										const shown = presentScreenError(
											error.message,
											describeFailure(
												error.message,
												"The roster could not be read.",
											),
										);
										return (
											<ErrorState
												body={shown.body}
												code={shown.code}
												retry={shown.canRetry ? retry : undefined}
												title={shown.title}
											/>
										);
									}}
									isEmpty={(r) => r.data.length === 0}
									loading={<SkeletonRows count={3} />}
									query={roster}
								>
									{(r) => {
										const shared = sharedPathIndex(r.data);
										return (
											<ul data-testid="roster-agents">
												{r.data.map((agent) => (
													<Agent
														agent={agent}
														key={agent.entryId}
														shared={shared}
													/>
												))}
											</ul>
										);
									}}
								</Surface>
							</Section>

							<Section built={false} testid="section-activity" title="Activity">
								<NotBuilt what="ActivityLog has no table yet, so there is no audited history to show." />
							</Section>

							{/* Construction actions are links, never inline controls: the work
							    they lead to is desktop-only and this route is phone-allowed. */}
							<div className="flex items-center gap-3 px-1">
								<Link
									className="text-sm text-accent-text hover:text-accent-hover"
									data-testid="link-preflight"
									params={{ missionId }}
									to="/missions/$missionId/exports/new"
								>
									Open pre-flight
								</Link>
							</div>
						</div>
					);
				}}
			</Surface>
		</div>
	);
}
