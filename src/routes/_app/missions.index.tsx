import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { z } from "zod";

import { missionListRow } from "#/contract/mission";
import { successList } from "#/contract/shared/envelope";
import { presentScreenError } from "#/modules/errors/screenError";
import { Tag } from "#/ui/badge";
import { Button } from "#/ui/button";
import { SkeletonRows } from "#/ui/skeleton";
import { EmptyState, ErrorState } from "#/ui/states";
import { Surface } from "#/ui/surface";

export const Route = createFileRoute("/_app/missions/")({
	staticData: { device: "capture" as const },
	component: Missions,
});

/**
 * The smallest real loop, closed.
 *
 * This is the first screen in the app that reads the database. The shape is
 * INFERRED from the contract and never hand-written: missionListRow is the one
 * definition this screen and /api/missions both import, so they cannot disagree
 * about a field without one of them failing to compile.
 *
 * The response is parsed with the same successList envelope the route answers
 * with. envelope.ts: a body that does not match the contract "fails validation
 * at the boundary instead of reaching a screen that has no case for it". So
 * drift surfaces here as an error state, not as a column rendering undefined.
 */
const missionListResponse = successList(missionListRow);
type MissionListResponse = z.infer<typeof missionListResponse>;
type MissionRow = z.infer<typeof missionListRow>;

/**
 * CLIENT-ONLY FAILURE LABELS. Deliberately NOT a fifth error vocabulary.
 *
 * Neither of these crosses the wire, neither is declared in contract/shared,
 * and nothing switches on them but this file. They exist because the two
 * failures below arrive with no envelope to carry a code: nothing answered, or
 * what answered did not match the contract. Named here rather than written as
 * literals at the throw site, so a string that reads like a contract code
 * cannot quietly become one.
 */
const SHAPE_MISMATCH = "SHAPE_MISMATCH";
const httpFailure = (status: number) => `HTTP_${status}`;

async function fetchMissions(): Promise<MissionListResponse> {
	const res = await fetch("/api/missions");
	const body = await res.json().catch(() => null);

	// Codes are the contract; messages change freely. Nothing here parses one.
	if (body?.success === false) throw new Error(body.error.code);

	if (!res.ok || body === null) throw new Error(httpFailure(res.status));
	const parsed = missionListResponse.safeParse(body);
	if (!parsed.success) throw new Error(SHAPE_MISMATCH);

	return parsed.data;
}

/**
 * mission.list declares 200 and 403 only, so FORBIDDEN is the single code an
 * envelope can carry to this screen. contract/errors holds an export-scoped map
 * and an auth-scoped map and no CRUD-scoped one, so this names the case it can
 * actually receive rather than inventing a table for a vocabulary it does not
 * own.
 */
function describeFailure(code: string): {
	title: string;
	body: string;
	canRetry: boolean;
} {
	const title = "The mission list could not be read.";
	switch (code) {
		case "FORBIDDEN":
			return {
				title,
				body: "This session is not permitted to read missions. Nothing was loaded.",
				// A permission does not change because it was asked twice.
				canRetry: false,
			};
		case SHAPE_MISMATCH:
			return {
				title,
				body: "The endpoint answered, but the body did not match mission.list. The screen and the route have drifted apart, and rendering it anyway would be a guess.",
				// Deterministic: the same request produces the same mismatch.
				canRetry: false,
			};
		default:
			return {
				title,
				body: "The request to /api/missions did not complete, so nothing was loaded. This screen only reads, so nothing was written either.",
				// No envelope arrived, so this is transport and genuinely retryable.
				canRetry: true,
			};
	}
}

/**
 * The row ROUTES.md specifies: client, type, sprint, status, last activity,
 * last export result.
 *
 * status is a mono tag rather than a coloured StatusBadge on purpose. The
 * column is TEXT with no vocabulary declared anywhere, so there is no state to
 * map a tone onto, and a green "draft" would be this screen inventing the
 * lifecycle the contract deliberately refuses to declare.
 */
function MissionRowView({ mission }: { mission: MissionRow }) {
	return (
		<li
			className="border-b border-[var(--elevation-border-rest)]"
			data-testid="mission-row"
		>
			{/*
			 * THE WHOLE ROW IS THE TARGET, not the client name alone. This route is
			 * phone-allowed, and a link the width of a word is a link you miss with
			 * a thumb. Nothing else in the row is interactive, so there is no nested
			 * control to swallow the tap.
			 *
			 * `interactive` rather than a hover class of my own: patch.css defines it
			 * as "one definition, every surface, both themes", carrying the hover
			 * AND active states and the brand's transition. My first attempt reached
			 * for an --elevation-surface-hover token that does not exist, which
			 * would have compiled, passed the token check, and silently done
			 * nothing.
			 */}
			<Link
				className="interactive flex flex-col gap-1 rounded-sm px-2 py-3"
				data-testid="mission-row-link"
				params={{ missionId: mission.id }}
				to="/missions/$missionId"
			>
				<div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
					<span
						className="font-display text-sm font-semibold text-text"
						data-testid="mission-client"
					>
						{mission.clientName}
					</span>
					<span className="text-sm text-text-muted" data-testid="mission-type">
						{mission.type}
					</span>
					<Tag data-testid="mission-sprint">sprint {mission.sprintN}</Tag>
					{/* Right-aligned as a column on desktop. On a phone the row wraps, and
				    an auto margin there strands the status alone on its own line, so it
				    flows inline with the rest instead. */}
					<Tag className="sm:ml-auto" data-testid="mission-status">
						{mission.status}
					</Tag>
				</div>
				{/* Both are NULL for every row today and are rendered as empty rather
			    than filled from somewhere else. ROUTES.md: ship the column when the
			    aggregate join exists, and never substitute updatedAt, which is
			    row-edit time and not audited activity. */}
				<div className="flex flex-wrap gap-x-4 text-micro text-text-subtle">
					<span data-testid="mission-activity">
						last activity {mission.lastActivity ?? "—"}
					</span>
					<span data-testid="mission-export">
						last export {mission.lastExportResult ?? "—"}
					</span>
				</div>
			</Link>
		</li>
	);
}

function Missions() {
	const query = useQuery<MissionListResponse>({
		queryKey: ["missions"],
		queryFn: fetchMissions,
		// Fail visibly and immediately. The error state carries its own retry, so
		// three silent backoffs only delay telling the operator what happened.
		retry: false,
	});

	return (
		<div className="px-6 py-5">
			<h1
				className="font-display text-lg font-semibold"
				data-testid="page-title"
			>
				Missions
			</h1>

			{/* The only other built route today. Linked so it is reachable rather
			    than needing the URL typed. */}
			<p className="pt-1 pb-3 text-sm text-text-muted">
				The pre-flight screen is partly built:{" "}
				<Link
					className="text-accent-text hover:text-accent-hover"
					data-testid="link-preflight"
					params={{ missionId: "01J8Z4K2QW3E5R7T9Y1V3J5P7A" }}
					to="/missions/$missionId/exports/new"
				>
					gates, from the golden fixture
				</Link>
			</p>

			<Surface
				empty={
					<EmptyState
						action={
							<Button data-testid="missions-empty-cta" variant="primary">
								Capture a mission
							</Button>
						}
						body="Nothing has been captured yet. A mission starts as a brief — client, type, sprint — and everything downstream is derived from it. Capture the first one from a phone, mid-conversation, and refine it later."
						title="No missions yet"
					/>
				}
				error={({ error, retry }) => {
					// The affordance comes from the error map, not from this call site:
					// a code whose recovery is `none` must not be handed a retry.
					const shown = presentScreenError(
						error.message,
						describeFailure(error.message),
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
				// The query resolves the ENVELOPE, not the array, so the default
				// heuristic cannot see the rows. Emptiness is the page being empty.
				isEmpty={(page) => page.data.length === 0}
				loading={<SkeletonRows count={6} />}
				query={query}
			>
				{(page) => (
					<div data-testid="mission-rows">
						<ul>
							{page.data.map((mission) => (
								<MissionRowView key={mission.id} mission={mission} />
							))}
						</ul>
						<p
							className="pt-3 text-micro text-text-subtle"
							data-testid="mission-list-note"
						>
							{page.data.length} of {page.meta.total} shown.
							{page.meta.nextCursor
								? " More rows exist; the next page is not built."
								: ""}{" "}
							Last activity and last export are empty on every row because
							ActivityLog and Export have no tables yet.
						</p>
					</div>
				)}
			</Surface>
		</div>
	);
}
