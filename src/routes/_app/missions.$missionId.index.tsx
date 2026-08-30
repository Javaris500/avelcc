import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { z } from "zod";

import { missionSchema } from "#/contract/mission";
import { success } from "#/contract/shared/envelope";
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

function describeFailure(code: string): string {
	switch (code) {
		case "NOT_FOUND":
			return "There is no mission with this identifier. It may have been deleted, or the link may be wrong.";
		case "SHAPE_MISMATCH":
			return "The endpoint answered, but the body did not match mission.get. The screen and the route have drifted apart, and rendering it anyway would be a guess.";
		default:
			return "The request did not complete, so nothing was loaded. This screen only reads, so nothing was written either.";
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

function MissionOverview() {
	const { missionId } = Route.useParams();
	const query = useQuery<MissionResponse>({
		queryKey: ["mission", missionId],
		queryFn: () => fetchMission(missionId),
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
				error={({ error, retry }) => (
					<ErrorState
						body={describeFailure(error.message)}
						code={error.message}
						retry={retry}
						title="This mission could not be read."
					/>
				)}
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
							<Section built={false} testid="section-roster" title="Roster">
								<NotBuilt what="Needs an endpoint over roster entries joined to their agent templates. Which agents ran, in which wave, and with which mount boundaries." />
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
